import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, ShoppingCart, Check, X, RotateCcw, Camera } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { logActivity } from "@/lib/household";
import { toast } from "sonner";

type Filter = "all" | "active" | "bought" | "unavailable";

interface Item {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  status: "active" | "bought" | "unavailable" | "deleted";
  exact_match_required: boolean;
  added_by: string;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
  list_id: string;
}

interface Photo {
  item_id: string;
  thumbnail_url: string | null;
}

async function ensureActiveList(householdId: string, userId: string) {
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id, status")
    .eq("household_id", householdId)
    .in("status", ["active", "shopping", "partially_done"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({ household_id: householdId, created_by: userId, name: "Lista zakupów", status: "active" })
    .select("id, status")
    .single();
  if (error) throw error;
  return data;
}

export function ActiveListPage() {
  return (
    <RequireAuth>
      {({ userId, householdId }) => <Inner userId={userId} householdId={householdId} />}
    </RequireAuth>
  );
}

function Inner({ userId, householdId }: { userId: string; householdId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [shoppingMode, setShoppingMode] = useState(false);

  const listQuery = useQuery({
    queryKey: ["active-list", householdId],
    queryFn: () => ensureActiveList(householdId, userId),
  });
  const listId = listQuery.data?.id;

  const itemsQuery = useQuery({
    queryKey: ["items", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", listId!)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const photosQuery = useQuery({
    queryKey: ["photos", listId, itemsQuery.data?.length ?? 0],
    enabled: !!itemsQuery.data && itemsQuery.data.length > 0,
    queryFn: async () => {
      const ids = (itemsQuery.data ?? []).map((i) => i.id);
      if (ids.length === 0) return [] as Photo[];
      const { data, error } = await supabase
        .from("item_photos")
        .select("item_id, thumbnail_url")
        .in("item_id", ids);
      if (error) throw error;
      return data as Photo[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!listId) return;
    const ch = supabase
      .channel(`items-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `list_id=eq.${listId}` },
        () => qc.invalidateQueries({ queryKey: ["items", listId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_photos" },
        () => qc.invalidateQueries({ queryKey: ["photos", listId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [listId, qc]);

  const items = itemsQuery.data ?? [];
  const photos = photosQuery.data ?? [];
  const photoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of photos) if (p.thumbnail_url) m.set(p.item_id, p.thumbnail_url);
    return m;
  }, [photos]);

  const counts = useMemo(() => ({
    active: items.filter((i) => i.status === "active").length,
    bought: items.filter((i) => i.status === "bought").length,
    unavailable: items.filter((i) => i.status === "unavailable").length,
  }), [items]);

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
    // Group by status when shopping
    if (shoppingMode) {
      list = [...list].sort((a, b) => {
        const order = { active: 0, unavailable: 1, bought: 2, deleted: 3 } as const;
        return order[a.status] - order[b.status];
      });
    }
    return list;
  }, [items, filter, search, shoppingMode]);

  const setStatus = async (item: Item, status: Item["status"]) => {
    const patch: Partial<Item> = { status };
    if (status === "bought") {
      patch.checked_by = userId;
      patch.checked_at = new Date().toISOString();
    } else if (status === "active") {
      patch.checked_by = null;
      patch.checked_at = null;
    }
    const { error } = await supabase.from("shopping_items").update(patch).eq("id", item.id);
    if (error) return toast.error(error.message);
    void logActivity({
      household_id: householdId,
      user_id: userId,
      action: status === "bought" ? "item_bought" : status === "unavailable" ? "item_unavailable" : "item_reactivated",
      description: item.name,
      list_id: item.list_id,
      item_id: item.id,
    });
  };

  const finishShopping = async () => {
    if (!listId) return;
    const hasActive = items.some((i) => i.status === "active" || i.status === "unavailable");
    const newStatus = hasActive ? "partially_done" : "done";
    await supabase
      .from("shopping_lists")
      .update({ status: newStatus, completed_at: new Date().toISOString() })
      .eq("id", listId);
    void logActivity({
      household_id: householdId,
      user_id: userId,
      action: "shopping_finished",
      description: newStatus === "done" ? "Wszystko kupione" : "Zakupy częściowo zrobione",
      list_id: listId,
    });
    setShoppingMode(false);
    toast.success(newStatus === "done" ? "Wszystko kupione!" : "Zakończono zakupy");
    qc.invalidateQueries({ queryKey: ["active-list", householdId] });
  };

  return (
    <AppShell
      title="Lista zakupów"
      right={
        <Link to="/add" className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium">
          + Dodaj
        </Link>
      }
    >
      {!shoppingMode && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj…"
              className="w-full pl-10 pr-3 py-3 rounded-2xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {[
              { v: "active", label: `Do kupienia · ${counts.active}` },
              { v: "bought", label: `Kupione · ${counts.bought}` },
              { v: "unavailable", label: `Niedostępne · ${counts.unavailable}` },
              { v: "all", label: "Wszystko" },
            ].map((f) => (
              <button
                key={f.v}
                onClick={() => setFilter(f.v as Filter)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === f.v ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShoppingMode(true)}
            className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
          >
            <ShoppingCart className="w-5 h-5" />
            Rozpocznij zakupy
          </button>
        </div>
      )}

      {shoppingMode && (
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShoppingMode(false)}
            className="text-sm text-muted-foreground"
          >
            ← Wyjdź z trybu sklepu
          </button>
          <span className="text-xs px-2 py-1 rounded-full bg-accent/15 text-accent">Tryb sklepu</span>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {visible.length === 0 && (
          <li className="text-center py-12 text-muted-foreground text-sm">
            {items.length === 0 ? "Lista jest pusta. Dodaj pierwszy produkt." : "Nic tu nie ma."}
          </li>
        )}
        {visible.map((it) => {
          const thumb = photoMap.get(it.id);
          const isBought = it.status === "bought";
          const isUnavailable = it.status === "unavailable";
          return (
            <li
              key={it.id}
              className={`bg-card rounded-2xl border border-border p-3 flex items-center gap-3 ${
                isBought ? "opacity-60" : ""
              }`}
            >
              {/* checkbox */}
              <button
                aria-label={isBought ? "Cofnij odhaczenie" : "Oznacz jako kupione"}
                onClick={() => setStatus(it, isBought ? "active" : "bought")}
                className={`shrink-0 ${shoppingMode ? "w-12 h-12" : "w-9 h-9"} rounded-full border-2 flex items-center justify-center transition-all ${
                  isBought
                    ? "bg-success border-success text-success-foreground"
                    : "border-border bg-background"
                }`}
              >
                {isBought && <Check className={shoppingMode ? "w-6 h-6" : "w-5 h-5"} />}
              </button>

              <Link to="/item/$id" params={{ id: it.id }} className="flex-1 min-w-0 flex items-center gap-3">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={it.name} loading="lazy" className="w-12 h-12 rounded-xl object-cover bg-muted" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl">
                    {it.category ? CATEGORY_EMOJI[it.category] ?? "📦" : "📦"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`font-medium truncate ${isBought ? "line-through" : ""}`}>{it.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    {it.quantity != null && (
                      <span>
                        {it.quantity} {it.unit ?? ""}
                      </span>
                    )}
                    {it.category && <span>· {it.category}</span>}
                    {it.exact_match_required && (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Camera className="w-3 h-3" />
                        dokładnie taki
                      </span>
                    )}
                    {isUnavailable && <span className="text-warning">· niedostępne</span>}
                  </div>
                </div>
              </Link>

              {/* status quick actions */}
              {!isBought && (
                <button
                  aria-label="Oznacz jako niedostępne"
                  onClick={() => setStatus(it, isUnavailable ? "active" : "unavailable")}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs ${
                    isUnavailable
                      ? "bg-warning/20 text-warning"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isUnavailable ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </button>
              )}
            </li>
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
            Zakupy zrobione
          </button>
        </div>
      )}
    </AppShell>
  );
}