import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { logActivity } from "@/lib/household";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/item/$id")({ component: ItemPage });

function ItemPage() {
  const { id } = Route.useParams();
  return (
    <RequireAuth>
      {({ userId, householdId }) => <Inner id={id} userId={userId} householdId={householdId} />}
    </RequireAuth>
  );
}

function Inner({ id, userId, householdId }: { id: string; userId: string; householdId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const itemQ = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_items").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const photoQ = useQuery({
    queryKey: ["item-photo", id],
    queryFn: async () => {
      const { data } = await supabase.from("item_photos").select("*").eq("item_id", id).maybeSingle();
      return data;
    },
  });

  const it = itemQ.data;
  if (!it) return <AppShell title="Produkt">Ładowanie…</AppShell>;

  const update = async (patch: Partial<typeof it>) => {
    const { error } = await supabase.from("shopping_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["item", id] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const setBought = async () => {
    await update({ status: "bought", checked_by: userId, checked_at: new Date().toISOString() });
    void logActivity({ household_id: householdId, user_id: userId, action: "item_bought", description: it.name, item_id: id, list_id: it.list_id });
  };
  const setActive = async () => {
    await update({ status: "active", checked_by: null, checked_at: null });
    void logActivity({ household_id: householdId, user_id: userId, action: "item_reactivated", description: it.name, item_id: id, list_id: it.list_id });
  };
  const setUnavailable = async () => {
    await update({ status: "unavailable" });
    void logActivity({ household_id: householdId, user_id: userId, action: "item_unavailable", description: it.name, item_id: id, list_id: it.list_id });
  };

  const removeItem = async () => {
    if (!confirm("Usunąć produkt?")) return;
    const { error } = await supabase.from("shopping_items").update({ status: "deleted" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Usunięto");
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: "/" });
  };

  return (
    <AppShell title="Produkt" right={
      <button onClick={removeItem} className="text-destructive p-2"><Trash2 className="w-4 h-4" /></button>
    }>
      <Link to="/" className="text-sm text-muted-foreground">← Wróć</Link>
      <div className="mt-3 bg-card border border-border rounded-2xl p-4">
        {photoQ.data?.preview_url ? (
          <img src={photoQ.data.preview_url} alt={it.name} className="w-full max-h-72 object-contain rounded-xl bg-muted mb-3" />
        ) : (
          <div className="w-full h-40 rounded-xl bg-muted flex items-center justify-center text-5xl mb-3">
            {it.category ? CATEGORY_EMOJI[it.category] ?? "📦" : "📦"}
          </div>
        )}
        <h2 className="text-xl font-bold">{it.name}</h2>
        <div className="text-sm text-muted-foreground mt-1">
          {it.quantity != null && <>{it.quantity} {it.unit ?? ""} · </>}{it.category}
        </div>
        {it.note && <p className="mt-3 text-sm bg-muted rounded-xl p-3">{it.note}</p>}
        {it.exact_match_required && (
          <p className="mt-2 text-xs text-accent">📸 Kup dokładnie taki jak na zdjęciu</p>
        )}
        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          <div>Status: <span className="font-medium text-foreground">{labelStatus(it.status)}</span></div>
          <div>Dodano: {new Date(it.created_at).toLocaleString("pl-PL")}</div>
          {it.checked_at && <div>Kupione: {new Date(it.checked_at).toLocaleString("pl-PL")}</div>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {it.status !== "bought" && (
          <button onClick={setBought} className="w-full py-3 rounded-2xl bg-success text-success-foreground font-semibold">
            Oznacz jako kupione
          </button>
        )}
        {it.status === "bought" && (
          <button onClick={setActive} className="w-full py-3 rounded-2xl bg-card border border-border font-medium">
            Cofnij odhaczenie
          </button>
        )}
        {it.status !== "unavailable" && it.status !== "bought" && (
          <button onClick={setUnavailable} className="w-full py-3 rounded-2xl bg-warning/20 text-warning font-medium">
            Oznacz jako niedostępne
          </button>
        )}
        {it.status === "unavailable" && (
          <button onClick={setActive} className="w-full py-3 rounded-2xl bg-card border border-border font-medium">
            Z powrotem na listę
          </button>
        )}
      </div>
    </AppShell>
  );
}

function labelStatus(s: string) {
  switch (s) {
    case "active": return "do kupienia";
    case "bought": return "kupione";
    case "unavailable": return "niedostępne";
    case "deleted": return "usunięte";
    default: return s;
  }
}