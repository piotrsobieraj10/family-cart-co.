import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CATEGORY_EMOJI } from "@/lib/categories";
import {
  canAddItems,
  canChangeItemStatus,
  canManageHousehold,
  type HouseholdRole,
} from "@/lib/permissions";
import { findActiveList } from "@/lib/shopping";
import { formatPrice } from "@/lib/products";
import { notifyHousehold } from "@/lib/push";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  getStoresFn,
  getShoppingItemsFn,
  updateItemStatusFn,
  saveListSettingsFn,
  finishShoppingFn,
} from "@/lib/api/data.functions";

type Filter = "active" | "bought" | "unavailable" | "all";

interface Item {
  id: string;
  list_id: string;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  status: "active" | "bought" | "unavailable" | "deleted";
  store_id: string | null;
  estimated_unit_price: number | null;
  created_by: string | null;
  bought_by: string | null;
  bought_at: string | null;
}

export function ActiveListPage({
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
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [shoppingMode, setShoppingMode] = useState(false);
  const [groupByStore, setGroupByStore] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [defaultStoreId, setDefaultStoreId] = useState("");

  const listQuery = useQuery({
    queryKey: ["active-list", householdId],
    queryFn: () => findActiveList(householdId),
  });
  const listId = listQuery.data?.id;

  // Stores loaded lazily — only when user enables store grouping
  const storesQuery = useQuery({
    queryKey: ["stores", householdId],
    queryFn: () => getStoresFn({ data: { householdId } }),
    enabled: groupByStore,
    staleTime: 60_000,
  });

  useEffect(() => {
    setBudgetAmount(listQuery.data?.budget_amount?.toString() ?? "");
    setDefaultStoreId(listQuery.data?.default_store_id ?? "");
  }, [listQuery.data?.budget_amount, listQuery.data?.default_store_id]);

  const itemsQuery = useQuery({
    queryKey: ["items", listId],
    enabled: !!listId,
    queryFn: () => getShoppingItemsFn({ data: { listId: listId!, householdId } }),
    refetchInterval: 15000,
  });

  const items = useMemo(() => (itemsQuery.data ?? []) as Item[], [itemsQuery.data]);

  const counts = useMemo(
    () => ({
      active: items.filter((i) => i.status === "active").length,
      bought: items.filter((i) => i.status === "bought").length,
      unavailable: items.filter((i) => i.status === "unavailable").length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    let list = items;
    if (shoppingMode) {
      list = list.filter((i) => i.status === "active" || i.status === "unavailable");
    } else if (filter !== "all") {
      list = list.filter((i) => i.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (shoppingMode) {
      list = [...list].sort((a, b) => {
        const order = { active: 0, unavailable: 1, bought: 2, deleted: 3 } as const;
        return order[a.status] - order[b.status];
      });
    }
    if (groupByStore) {
      list = [...list].sort((a, b) => (a.store_id ?? "").localeCompare(b.store_id ?? ""));
    }
    return list;
  }, [items, filter, search, shoppingMode, groupByStore]);

  const storeName = useMemo(
    () => new Map((storesQuery.data ?? []).map((store) => [store.id, store.name])),
    [storesQuery.data],
  );

  const estimatedTotal = useMemo(
    () =>
      items
        .filter((i) => i.status !== "deleted" && i.estimated_unit_price != null)
        .reduce((total, i) => total + i.estimated_unit_price! * (i.quantity ?? 1), 0),
    [items],
  );

  const pricedCount = items.filter((i) => i.estimated_unit_price != null).length;
  const budget = listQuery.data?.budget_amount ?? null;
  const remaining = budget == null ? null : budget - estimatedTotal;

  const saveListSettings = async () => {
    if (!listId || !canManageHousehold(role)) return;
    try {
      await saveListSettingsFn({
        data: {
          listId,
          householdId,
          budget_amount: budgetAmount ? Number(budgetAmount) : null,
          default_store_id: defaultStoreId || null,
          estimated_total: estimatedTotal,
        },
      });
      qc.invalidateQueries({ queryKey: ["active-list", householdId] });
      toast.success(isEnglish ? "List settings saved" : "Zapisano ustawienia listy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  const setStatus = async (item: Item, status: Item["status"]) => {
    if (!canChangeItemStatus(role))
      return toast.error(isEnglish ? "You have view-only access" : "Masz dostęp tylko do podglądu");
    try {
      await updateItemStatusFn({ data: { itemId: item.id, householdId, status } });
      void notifyHousehold({
        householdId,
        type: status === "bought" ? "item_bought" : "item_added",
        body:
          status === "bought"
            ? isEnglish
              ? `Bought: ${item.name}`
              : `Kupiono: ${item.name}`
            : item.name,
        listId: item.list_id,
        itemId: item.id,
        url: "/",
      });
      qc.invalidateQueries({ queryKey: ["items", listId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  const finishShopping = async () => {
    if (!canChangeItemStatus(role))
      return toast.error(isEnglish ? "You have view-only access" : "Masz dostęp tylko do podglądu");
    if (!canManageHousehold(role)) {
      setShoppingMode(false);
      toast.success(isEnglish ? "Shopping mode ended" : "Zakończono tryb zakupów");
      return;
    }
    if (!listId) return;
    const hasActive = items.some((i) => i.status === "active" || i.status === "unavailable");
    const status = hasActive ? "partially_done" : "done";
    try {
      await finishShoppingFn({ data: { listId, householdId, status } });
      void notifyHousehold({
        householdId,
        type: "shopping_finished",
        body: isEnglish ? "Shopping finished" : "Zakończono zakupy",
        listId,
        url: "/",
      });
      setShoppingMode(false);
      toast.success(
        isEnglish
          ? status === "done"
            ? "Everything bought!"
            : "Shopping finished"
          : status === "done"
            ? "Wszystko kupione!"
            : "Zakończono zakupy",
      );
      qc.invalidateQueries({ queryKey: ["active-list", householdId] });
      qc.invalidateQueries({ queryKey: ["items", listId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  return (
    <AppShell
      title={t("shoppingList")}
      right={
        canAddItems(role) ? (
          <Link
            to="/add"
            className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium"
          >
            + {t("add")}
          </Link>
        ) : null
      }
    >
      {!shoppingMode && (
        <div className="space-y-3">
          {listId && (
            <section className="bg-card border border-border rounded-2xl p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {isEnglish ? "Estimated value" : "Szacowana wartość"}
                  </div>
                  <div className="text-lg font-semibold">{formatPrice(estimatedTotal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {isEnglish
                      ? `Prices: ${pricedCount} of ${items.length} products`
                      : `Ceny: ${pricedCount} z ${items.length} produktów`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {isEnglish ? "Remaining budget" : "Pozostało z budżetu"}
                  </div>
                  <div
                    className={`text-lg font-semibold ${remaining != null && remaining < 0 ? "text-destructive" : ""}`}
                  >
                    {remaining == null
                      ? isEnglish
                        ? "No budget"
                        : "Brak budżetu"
                      : formatPrice(remaining)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isEnglish ? "Budget" : "Budżet"}:{" "}
                    {budget == null
                      ? isEnglish
                        ? "not set"
                        : "nie ustawiono"
                      : formatPrice(budget)}
                  </div>
                </div>
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span>
                  {isEnglish ? "Group products by store" : "Grupuj produkty według sklepu"}
                </span>
                <input
                  type="checkbox"
                  checked={groupByStore}
                  onChange={(e) => setGroupByStore(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>
              {canManageHousehold(role) && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      placeholder={isEnglish ? "List budget" : "Budżet listy"}
                      className="min-w-0 px-3 py-2 rounded-xl bg-muted"
                    />
                    <select
                      value={defaultStoreId}
                      onChange={(e) => setDefaultStoreId(e.target.value)}
                      className="min-w-0 px-3 py-2 rounded-xl bg-muted"
                    >
                      <option value="">
                        {isEnglish ? "No default store" : "Bez domyślnego sklepu"}
                      </option>
                      {(storesQuery.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={saveListSettings}
                    className="w-full py-2 rounded-xl bg-muted text-sm font-medium"
                  >
                    {isEnglish ? "Save budget and default store" : "Zapisz budżet i domyślny sklep"}
                  </button>
                </div>
              )}
            </section>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEnglish ? "Search…" : "Szukaj…"}
              className="w-full pl-10 pr-3 py-3 rounded-2xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {[
              { v: "active", label: `${isEnglish ? "To buy" : "Do kupienia"} · ${counts.active}` },
              { v: "bought", label: `${isEnglish ? "Bought" : "Kupione"} · ${counts.bought}` },
              {
                v: "unavailable",
                label: `${isEnglish ? "Unavailable" : "Niedostępne"} · ${counts.unavailable}`,
              },
              { v: "all", label: isEnglish ? "All" : "Wszystko" },
            ].map((f) => (
              <button
                key={f.v}
                onClick={() => setFilter(f.v as Filter)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === f.v ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {canChangeItemStatus(role) && (
            <button
              onClick={() => setShoppingMode(true)}
              className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
            >
              <ShoppingCart className="w-5 h-5" />
              {isEnglish ? "Start shopping" : "Rozpocznij zakupy"}
            </button>
          )}
        </div>
      )}

      {shoppingMode && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShoppingMode(false)} className="text-sm text-muted-foreground">
            ← {isEnglish ? "Exit store mode" : "Wyjdź z trybu sklepu"}
          </button>
          <span className="text-xs px-2 py-1 rounded-full bg-accent/15 text-accent">
            {isEnglish ? "Store mode" : "Tryb sklepu"}
          </span>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {visible.length === 0 && (
          <li className="text-center py-12 text-muted-foreground text-sm">
            {items.length === 0
              ? isEnglish
                ? "The list is empty. Add the first product."
                : "Lista jest pusta. Dodaj pierwszy produkt."
              : isEnglish
                ? "Nothing here."
                : "Nic tu nie ma."}
          </li>
        )}
        {visible.map((it, index) => {
          const isBought = it.status === "bought";
          const isUnavailable = it.status === "unavailable";
          const currentStoreName = it.store_id
            ? storeName.get(it.store_id) || (isEnglish ? "Store" : "Sklep")
            : isEnglish
              ? "No store"
              : "Bez sklepu";
          const previousItem = visible[index - 1];
          const previousStoreName = previousItem
            ? previousItem.store_id
              ? storeName.get(previousItem.store_id) || (isEnglish ? "Store" : "Sklep")
              : isEnglish
                ? "No store"
                : "Bez sklepu"
            : null;
          return (
            <Fragment key={it.id}>
              {groupByStore && currentStoreName !== previousStoreName && (
                <li className="pt-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {currentStoreName}
                </li>
              )}
              <li
                className={`bg-card rounded-2xl border border-border p-3 flex items-center gap-3 ${isBought ? "opacity-60" : ""}`}
              >
                <button
                  aria-label={
                    isBought
                      ? isEnglish
                        ? "Undo check"
                        : "Cofnij odhaczenie"
                      : isEnglish
                        ? "Mark as bought"
                        : "Oznacz jako kupione"
                  }
                  onClick={() => setStatus(it, isBought ? "active" : "bought")}
                  disabled={!canChangeItemStatus(role)}
                  className={`shrink-0 ${shoppingMode ? "w-12 h-12" : "w-9 h-9"} rounded-full border-2 flex items-center justify-center transition-all ${isBought ? "bg-success border-success text-success-foreground" : "border-border bg-background"}`}
                >
                  {isBought && <Check className={shoppingMode ? "w-6 h-6" : "w-5 h-5"} />}
                </button>

                <Link
                  to="/item/$id"
                  params={{ id: it.id }}
                  className="flex-1 min-w-0 flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl">
                    {it.category ? (CATEGORY_EMOJI[it.category] ?? "📦") : "📦"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium truncate ${isBought ? "line-through" : ""}`}>
                      {it.name}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      {it.quantity != null && (
                        <span>
                          {it.quantity} {it.unit ?? ""}
                        </span>
                      )}
                      {it.category && <span>· {it.category}</span>}
                      <span>· {currentStoreName}</span>
                      <span>· {formatPrice(it.estimated_unit_price)}</span>
                      {isUnavailable && (
                        <span className="text-warning">
                          · {isEnglish ? "unavailable" : "niedostępne"}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                {!isBought && (
                  <button
                    aria-label={isEnglish ? "Mark as unavailable" : "Oznacz jako niedostępne"}
                    onClick={() => setStatus(it, isUnavailable ? "active" : "unavailable")}
                    disabled={!canChangeItemStatus(role)}
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs ${isUnavailable ? "bg-warning/20 text-warning" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {isUnavailable ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ul>

      {shoppingMode && (
        <div className="fixed bottom-20 inset-x-0 px-4 max-w-md mx-auto z-30">
          <button
            onClick={finishShopping}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            {isEnglish ? "Shopping done" : "Zakupy zrobione"}
          </button>
        </div>
      )}
    </AppShell>
  );
}
