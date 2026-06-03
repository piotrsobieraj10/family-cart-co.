import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Store, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { canManageHousehold, type HouseholdRole } from "@/lib/permissions";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/stores")({ component: StoresPage });

function StoresPage() {
  return (
    <RequireAuth>
      {({ userId, householdId, role }) => (
        <Inner userId={userId} householdId={householdId} role={role} />
      )}
    </RequireAuth>
  );
}

function Inner({
  userId,
  householdId,
  role,
}: {
  userId: string;
  householdId: string;
  role?: HouseholdRole;
}) {
  const qc = useQueryClient();
  const { language, t } = useI18n();
  const isEnglish = language === "en";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = canManageHousehold(role);

  const storesQ = useQuery({
    queryKey: ["stores", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("household_id", householdId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const addStore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("stores").insert({
      household_id: householdId,
      name: name.trim(),
      created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["stores", householdId] });
    toast.success(isEnglish ? "Store added" : "Dodano sklep");
  };

  const removeStore = async (id: string, storeName: string) => {
    if (
      !canManage ||
      !confirm(isEnglish ? `Remove store "${storeName}"?` : `Usunąć sklep „${storeName}”?`)
    )
      return;
    const { error } = await supabase.from("stores").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["stores", householdId] });
    toast.success(isEnglish ? "Store removed" : "Usunięto sklep");
  };

  return (
    <AppShell title={t("stores")}>
      <Link to="/settings" className="text-sm text-muted-foreground">
        ← {isEnglish ? "Back to settings" : "Wróć do ustawień"}
      </Link>

      <section className="mt-4 bg-card border border-border rounded-2xl p-4">
        <h2 className="font-semibold">
          {isEnglish ? "Stores in the active household" : "Sklepy w aktywnym domu"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEnglish
            ? "Stores help group products and remember prices separately for each place."
            : "Sklepy pomagają grupować produkty i zapamiętywać ceny osobno dla każdego miejsca."}
        </p>
        {canManage && (
          <form onSubmit={addStore} className="mt-4 flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isEnglish ? "Store name" : "Nazwa sklepu"}
              className="min-w-0 flex-1 px-3 py-2.5 rounded-xl bg-muted"
            />
            <button
              disabled={busy || !name.trim()}
              className="px-4 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-60"
            >
              {t("add")}
            </button>
          </form>
        )}
      </section>

      <ul className="mt-4 space-y-2">
        {(storesQ.data ?? []).map((store) => (
          <li
            key={store.id}
            className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3"
          >
            <Store className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 font-medium">{store.name}</span>
            {canManage && (
              <button
                aria-label={isEnglish ? `Remove store ${store.name}` : `Usuń sklep ${store.name}`}
                onClick={() => removeStore(store.id, store.name)}
                className="p-2 text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {!storesQ.isLoading && (storesQ.data?.length ?? 0) === 0 && (
          <li className="text-center py-10 text-sm text-muted-foreground">
            {isEnglish ? "No stores have been added yet." : "Nie dodano jeszcze żadnego sklepu."}
          </li>
        )}
      </ul>
    </AppShell>
  );
}
