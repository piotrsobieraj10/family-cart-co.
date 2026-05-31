import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Crown } from "lucide-react";

export const Route = createFileRoute("/household")({ component: HouseholdPage });

function HouseholdPage() {
  return (
    <RequireAuth>
      {({ householdId, userId }) => <Inner householdId={householdId} userId={userId} />}
    </RequireAuth>
  );
}

function Inner({ householdId, userId }: { householdId: string; userId: string }) {
  const qc = useQueryClient();
  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("households").select("*").eq("id", householdId).single();
      if (error) throw error;
      return data;
    },
  });
  const membersQ = useQuery({
    queryKey: ["members", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id, user_id, role, status, profiles!inner(display_name, email)")
        .eq("household_id", householdId);
      if (error) throw error;
      return data;
    },
  });

  const meMember = membersQ.data?.find((m) => m.user_id === userId);
  const isAdmin = meMember?.role === "admin";

  const remove = async (memberId: string) => {
    if (!confirm("Usunąć tę osobę z domu?")) return;
    const { error } = await supabase.from("household_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Usunięto");
    qc.invalidateQueries({ queryKey: ["members", householdId] });
  };

  return (
    <AppShell title={householdQ.data?.name ?? "Dom"}>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h2 className="font-semibold mb-1">Zaproś domownika</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Poproś tę osobę o założenie konta tym samym e-mailem, a następnie podaj jej kod domu:
        </p>
        <div className="bg-muted rounded-xl px-3 py-2 text-xs font-mono break-all select-all">{householdId}</div>
        <p className="text-xs text-muted-foreground mt-2">
          W kolejnej wersji dodamy pełne zaproszenia e-mail. Na razie administrator może dodać członka po jego user_id w bazie.
        </p>
      </div>

      <h2 className="font-semibold mb-2 px-1">Członkowie</h2>
      <ul className="space-y-2">
        {membersQ.data?.map((m) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return (
            <li key={m.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {(p?.display_name ?? p?.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-1.5">
                  {p?.display_name ?? p?.email}
                  {m.role === "admin" && <Crown className="w-4 h-4 text-accent" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">{p?.email}</div>
              </div>
              {isAdmin && m.user_id !== userId && (
                <button onClick={() => remove(m.id)} className="text-destructive p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}