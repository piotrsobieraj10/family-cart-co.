import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, CATEGORY_EMOJI, UNITS, categorizeProduct } from "@/lib/categories";
import { logActivity } from "@/lib/household";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { canChangeItemStatus, canEditAnyItem, type HouseholdRole } from "@/lib/permissions";
import { formatPrice, rememberProduct, saveManualPrice } from "@/lib/products";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/item/$id")({ component: ItemPage });

function ItemPage() {
  const { id } = Route.useParams();
  return (
    <RequireAuth>
      {({ userId, householdId, role }) => (
        <Inner id={id} userId={userId} householdId={householdId} role={role} />
      )}
    </RequireAuth>
  );
}

function Inner({
  id,
  userId,
  householdId,
  role,
}: {
  id: string;
  userId: string;
  householdId: string;
  role?: HouseholdRole;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const isEnglish = language === "en";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCategory, setEditCategory] = useState("Inne");
  const [editStoreId, setEditStoreId] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [categoryManual, setCategoryManual] = useState(false);
  const storesQ = useQuery({
    queryKey: ["stores", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("household_id", householdId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const itemQ = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const photoQ = useQuery({
    queryKey: ["item-photo", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("item_photos")
        .select("*")
        .eq("item_id", id)
        .maybeSingle();
      if (!data) return null;
      const { data: signed } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(data.storage_path, 3600);
      return { ...data, signed_url: signed?.signedUrl ?? null };
    },
  });

  const it = itemQ.data;
  useEffect(() => {
    if (!it) return;
    setEditName(it.name);
    setEditQuantity(it.quantity?.toString() ?? "");
    setEditUnit(it.unit ?? "");
    setEditCategory(it.category ?? "Inne");
    setEditStoreId(it.store_id ?? "");
    setEditPrice(it.estimated_unit_price?.toString() ?? "");
    setCategoryManual(false);
  }, [it]);
  if (!it)
    return (
      <AppShell title={isEnglish ? "Product" : "Produkt"}>
        {isEnglish ? "Loading…" : "Ładowanie…"}
      </AppShell>
    );
  const canEdit = canEditAnyItem(role) || it.added_by === userId;

  const update = async (patch: Partial<typeof it>) => {
    if (!canChangeItemStatus(role))
      return toast.error(isEnglish ? "You have view-only access" : "Masz dostęp tylko do podglądu");
    const { error } = await supabase.from("shopping_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["item", id] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const setBought = async () => {
    await update({ status: "bought", checked_by: userId, checked_at: new Date().toISOString() });
    void logActivity({
      household_id: householdId,
      user_id: userId,
      action: "item_bought",
      description: it.name,
      item_id: id,
      list_id: it.list_id,
    });
  };
  const setActive = async () => {
    await update({ status: "active", checked_by: null, checked_at: null });
    void logActivity({
      household_id: householdId,
      user_id: userId,
      action: "item_reactivated",
      description: it.name,
      item_id: id,
      list_id: it.list_id,
    });
  };
  const setUnavailable = async () => {
    await update({ status: "unavailable" });
    void logActivity({
      household_id: householdId,
      user_id: userId,
      action: "item_unavailable",
      description: it.name,
      item_id: id,
      list_id: it.list_id,
    });
  };

  const removeItem = async () => {
    if (!canEditAnyItem(role) && it.added_by !== userId)
      return toast.error(
        isEnglish ? "You can remove only your own products" : "Możesz usuwać tylko własne produkty",
      );
    if (!confirm(isEnglish ? "Remove product?" : "Usunąć produkt?")) return;
    const { error } = await supabase
      .from("shopping_items")
      .update({ status: "deleted" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(isEnglish ? "Removed" : "Usunięto");
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: "/" });
  };

  const saveEdit = async () => {
    if (!canEdit || !editName.trim()) return;
    const price = editPrice ? Number(editPrice) : null;
    const observedAt = price != null ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("shopping_items")
      .update({
        name: editName.trim(),
        quantity: editQuantity ? Number(editQuantity) : null,
        unit: editUnit || null,
        category: editCategory,
        store_id: editStoreId || null,
        estimated_unit_price: price,
        price_observed_at: observedAt,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    try {
      await rememberProduct({
        householdId,
        userId,
        phrase: editName,
        category: editCategory,
        unit: editUnit,
        storeId: editStoreId || null,
      });
      if (price != null && editStoreId) {
        await saveManualPrice({
          householdId,
          userId,
          storeId: editStoreId,
          productName: editName,
          category: editCategory,
          unit: editUnit,
          price,
        });
      }
    } catch (memoryError) {
      toast.error(
        memoryError instanceof Error
          ? memoryError.message
          : isEnglish
            ? "Could not save product in household memory"
            : "Nie udało się zapisać produktu w pamięci domu",
      );
    }
    setEditing(false);
    toast.success(isEnglish ? "Changes saved" : "Zapisano zmiany");
    qc.invalidateQueries({ queryKey: ["item", id] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  return (
    <AppShell
      title={isEnglish ? "Product" : "Produkt"}
      right={
        canEdit ? (
          <>
            <button
              onClick={() => setEditing((value) => !value)}
              className="text-primary text-sm font-medium"
            >
              {editing ? t("cancel") : t("edit")}
            </button>
            <button onClick={removeItem} className="text-destructive p-2">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : null
      }
    >
      <Link to="/" className="text-sm text-muted-foreground">
        ← {t("back")}
      </Link>
      <div className="mt-3 bg-card border border-border rounded-2xl p-4">
        {photoQ.data?.signed_url ? (
          <img
            src={photoQ.data.signed_url}
            alt={it.name}
            className="w-full max-h-72 object-contain rounded-xl bg-muted mb-3"
          />
        ) : (
          <div className="w-full h-40 rounded-xl bg-muted flex items-center justify-center text-5xl mb-3">
            {it.category ? (CATEGORY_EMOJI[it.category] ?? "📦") : "📦"}
          </div>
        )}
        {editing ? (
          <div className="space-y-2">
            <input
              value={editName}
              onChange={(e) => {
                const nextName = e.target.value;
                setEditName(nextName);
                if (!categoryManual) setEditCategory(categorizeProduct(nextName));
              }}
              className="w-full px-3 py-2 rounded-xl bg-muted text-lg font-semibold"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                placeholder={isEnglish ? "Quantity" : "Ilość"}
                className="min-w-0 px-3 py-2 rounded-xl bg-muted"
              />
              <select
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                className="min-w-0 px-3 py-2 rounded-xl bg-muted"
              >
                <option value="">—</option>
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </div>
            <select
              value={editCategory}
              onChange={(e) => {
                setEditCategory(e.target.value);
                setCategoryManual(true);
              }}
              className="w-full px-3 py-2 rounded-xl bg-muted"
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={editStoreId}
                onChange={(e) => setEditStoreId(e.target.value)}
                className="min-w-0 px-3 py-2 rounded-xl bg-muted"
              >
                <option value="">{isEnglish ? "No store" : "Bez sklepu"}</option>
                {(storesQ.data ?? []).map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder={isEnglish ? "Unit price" : "Cena za jednostkę"}
                className="min-w-0 px-3 py-2 rounded-xl bg-muted"
              />
            </div>
            {editPrice && !editStoreId && (
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? "Choose a store to save this price in history."
                  : "Wybierz sklep, aby zapisać tę cenę w historii."}
              </p>
            )}
            {!categoryManual && (
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? "Category selected automatically. You can change it."
                  : "Kategoria dobrana automatycznie. Możesz ją zmienić."}
              </p>
            )}
            <button
              onClick={saveEdit}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold"
            >
              {isEnglish ? "Save changes" : "Zapisz zmiany"}
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold">{it.name}</h2>
            <div className="text-sm text-muted-foreground mt-1">
              {it.quantity != null && (
                <>
                  {it.quantity} {it.unit ?? ""} ·{" "}
                </>
              )}
              {it.category}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {isEnglish ? "Store" : "Sklep"}:{" "}
              <span className="text-foreground">
                {storesQ.data?.find((store) => store.id === it.store_id)?.name ??
                  (isEnglish ? "No store" : "Bez sklepu")}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {isEnglish ? "Last price" : "Ostatnia cena"}:{" "}
              <span className="text-foreground">{formatPrice(it.estimated_unit_price)}</span>
            </div>
          </>
        )}
        {it.note && <p className="mt-3 text-sm bg-muted rounded-xl p-3">{it.note}</p>}
        {it.exact_match_required && (
          <p className="mt-2 text-xs text-accent">
            📸{" "}
            {isEnglish ? "Buy exactly the one from the photo" : "Kup dokładnie taki jak na zdjęciu"}
          </p>
        )}
        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          <div>
            {isEnglish ? "Status" : "Status"}:{" "}
            <span className="font-medium text-foreground">{labelStatus(it.status, isEnglish)}</span>
          </div>
          <div>
            {isEnglish ? "Added" : "Dodano"}:{" "}
            {new Date(it.created_at).toLocaleString(isEnglish ? "en-US" : "pl-PL")}
          </div>
          {it.checked_at && (
            <div>
              {isEnglish ? "Bought" : "Kupione"}:{" "}
              {new Date(it.checked_at).toLocaleString(isEnglish ? "en-US" : "pl-PL")}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {canChangeItemStatus(role) && it.status !== "bought" && (
          <button
            onClick={setBought}
            className="w-full py-3 rounded-2xl bg-success text-success-foreground font-semibold"
          >
            {isEnglish ? "Mark as bought" : "Oznacz jako kupione"}
          </button>
        )}
        {canChangeItemStatus(role) && it.status === "bought" && (
          <button
            onClick={setActive}
            className="w-full py-3 rounded-2xl bg-card border border-border font-medium"
          >
            {isEnglish ? "Undo check" : "Cofnij odhaczenie"}
          </button>
        )}
        {canChangeItemStatus(role) && it.status !== "unavailable" && it.status !== "bought" && (
          <button
            onClick={setUnavailable}
            className="w-full py-3 rounded-2xl bg-warning/20 text-warning font-medium"
          >
            {isEnglish ? "Mark as unavailable" : "Oznacz jako niedostępne"}
          </button>
        )}
        {canChangeItemStatus(role) && it.status === "unavailable" && (
          <button
            onClick={setActive}
            className="w-full py-3 rounded-2xl bg-card border border-border font-medium"
          >
            {isEnglish ? "Back to list" : "Z powrotem na listę"}
          </button>
        )}
      </div>
    </AppShell>
  );
}

function labelStatus(s: string, isEnglish: boolean) {
  switch (s) {
    case "active":
      return isEnglish ? "to buy" : "do kupienia";
    case "bought":
      return isEnglish ? "bought" : "kupione";
    case "unavailable":
      return isEnglish ? "unavailable" : "niedostępne";
    case "deleted":
      return isEnglish ? "removed" : "usunięte";
    default:
      return s;
  }
}
