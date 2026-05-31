import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  return (
    <RequireAuth>
      {({ householdId, userId }) => <Inner householdId={householdId} userId={userId} />}
    </RequireAuth>
  );
}

function Inner({ householdId, userId }: { householdId: string; userId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["history", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("id, name, category, quantity, unit, checked_at, list_id")
        .eq("household_id", householdId)
        .eq("status", "bought")
        .order("checked_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const reAdd = async (item: { name: string; category: string | null; quantity: number | null; unit: string | null }) => {
    const { data: list } = await supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .in("status", ["active", "shopping", "partially_done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let listId = list?.id;
    if (!listId) {
      const { data: created, error } = await supabase
        .from("shopping_lists")
        .insert({ household_id: householdId, created_by: userId, name: "Lista zakupów" })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      listId = created.id;
    }
    const { error } = await supabase.from("shopping_items").insert({
      list_id: listId,
      household_id: householdId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      added_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Dodano ponownie");
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  return (
    <AppShell title="Historia">
      <ul className="space-y-2">
        {(!data || data.length === 0) && (
          <li className="text-center py-12 text-muted-foreground text-sm">Brak kupionych produktów.</li>
        )}
        {data?.map((it) => (
          <li key={it.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              {it.category ? CATEGORY_EMOJI[it.category] ?? "📦" : "📦"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{it.name}</div>
              <div className="text-xs text-muted-foreground">
                {it.quantity != null ? `${it.quantity} ${it.unit ?? ""} · ` : ""}
                {it.checked_at ? new Date(it.checked_at).toLocaleDateString("pl-PL") : ""}
              </div>
            </div>
            <button onClick={() => reAdd(it)} className="text-primary text-xs font-medium flex items-center gap-1">
              <RotateCcw className="w-4 h-4" /> Dodaj
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}