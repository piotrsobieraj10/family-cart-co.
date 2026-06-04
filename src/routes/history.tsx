import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { ensureActiveList } from "@/lib/shopping";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { useI18n } from "@/i18n";
import { getHistoryFn, addItemFn } from "@/lib/api/data.functions";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  return (
    <RequireAuth>
      {({ householdId, userId, role }) => (
        <Inner householdId={householdId} userId={userId} role={role} />
      )}
    </RequireAuth>
  );
}

function Inner({ householdId, userId, role }: { householdId: string; userId: string; role?: HouseholdRole }) {
  const qc = useQueryClient();
  const { language, t } = useI18n();
  const isEnglish = language === "en";

  const { data } = useQuery({
    queryKey: ["history", householdId],
    queryFn: () => getHistoryFn({ data: { householdId } }),
  });

  const reAdd = async (item: { name: string; category: string | null; quantity: number | null; unit: string | null }) => {
    if (!canAddItems(role)) return toast.error(isEnglish ? "You have view-only access" : "Masz dostęp tylko do podglądu");
    try {
      const list = await ensureActiveList(householdId, userId);
      await addItemFn({
        data: {
          listId: list.id,
          householdId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
        },
      });
      toast.success(isEnglish ? "Added again" : "Dodano ponownie");
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  return (
    <AppShell title={t("history")}>
      <ul className="space-y-2">
        {(!data || data.length === 0) && (
          <li className="text-center py-12 text-muted-foreground text-sm">
            {isEnglish ? "No bought products yet." : "Brak kupionych produktów."}
          </li>
        )}
        {data?.map((it) => (
          <li key={it.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              {it.category ? (CATEGORY_EMOJI[it.category] ?? "📦") : "📦"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{it.name}</div>
              <div className="text-xs text-muted-foreground">
                {it.quantity != null ? `${it.quantity} ${it.unit ?? ""} · ` : ""}
                {it.bought_at ? new Date(it.bought_at).toLocaleDateString(isEnglish ? "en-US" : "pl-PL") : ""}
              </div>
            </div>
            {canAddItems(role) && (
              <button onClick={() => reAdd(it)} className="text-primary text-xs font-medium flex items-center gap-1">
                <RotateCcw className="w-4 h-4" /> {t("add")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
