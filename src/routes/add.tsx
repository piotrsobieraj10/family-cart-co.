import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, UNITS, categorizeProduct } from "@/lib/categories";
import { compressToWebP } from "@/lib/image-compress";
import { logActivity } from "@/lib/household";
import { ensureActiveList } from "@/lib/shopping";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { normalizePhrase, rememberProduct, saveManualPrice } from "@/lib/products";
import { notifyHousehold } from "@/lib/push";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/add")({ component: AddPage });

function AddPage() {
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { language, t } = useI18n();
  const isEnglish = language === "en";
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<string>("szt.");
  const [category, setCategory] = useState<string>("Inne");
  const [categoryManual, setCategoryManual] = useState(false);
  const [note, setNote] = useState("");
  const [storeId, setStoreId] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [exact, setExact] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const dictionaryQ = useQuery({
    queryKey: ["product-dictionary", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_product_dictionary")
        .select("id, phrase, normalized_phrase, category, default_unit, default_store_id")
        .eq("household_id", householdId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const suggestions = (dictionaryQ.data ?? [])
    .filter((entry) => {
      const query = normalizePhrase(name);
      return query.length >= 2 && entry.normalized_phrase.includes(query);
    })
    .slice(0, 5);

  const applySuggestion = (suggestion: (typeof suggestions)[number]) => {
    setName(suggestion.phrase);
    if (suggestion.category) setCategory(suggestion.category);
    if (suggestion.default_unit) setUnit(suggestion.default_unit);
    if (suggestion.default_store_id) setStoreId(suggestion.default_store_id);
    setCategoryManual(true);
  };

  const onPhoto = (f: File | null) => {
    setPhoto(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!canAddItems(role))
      return toast.error(
        isEnglish
          ? "You do not have permission to add products"
          : "Nie masz uprawnień do dodawania produktów",
      );
    setBusy(true);
    try {
      const list = await ensureActiveList(householdId, userId);
      const listId = list.id;
      const selectedStoreId = storeId || list.default_store_id || null;
      const price = estimatedPrice ? Number(estimatedPrice) : null;
      const observedAt = price != null ? new Date().toISOString() : null;

      const { data: item, error } = await supabase
        .from("shopping_items")
        .insert({
          list_id: listId,
          household_id: householdId,
          name: name.trim(),
          quantity: quantity ? Number(quantity) : null,
          unit,
          category,
          note: note.trim() || null,
          store_id: selectedStoreId,
          estimated_unit_price: price,
          price_observed_at: observedAt,
          exact_match_required: exact,
          added_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      try {
        await rememberProduct({
          householdId,
          userId,
          phrase: name,
          category,
          unit,
          storeId: selectedStoreId,
        });
        if (price != null && selectedStoreId) {
          await saveManualPrice({
            householdId,
            userId,
            storeId: selectedStoreId,
            productName: name,
            category,
            unit,
            price,
          });
        }
      } catch {
        toast.error(
          isEnglish
            ? "Product added, but price memory and suggestions could not be updated"
            : "Produkt dodano, ale nie udało się zaktualizować pamięci cen i sugestii",
        );
      }

      if (photo) {
        try {
          const compressed = await compressToWebP(photo);
          const base = `${householdId}/${item.id}`;
          const thumbPath = `${base}/thumb.webp`;
          const prevPath = `${base}/preview.webp`;
          const up1 = await supabase.storage
            .from("product-photos")
            .upload(thumbPath, compressed.thumbnail, { contentType: "image/webp", upsert: true });
          if (up1.error) throw up1.error;
          const up2 = await supabase.storage
            .from("product-photos")
            .upload(prevPath, compressed.preview, { contentType: "image/webp", upsert: true });
          if (up2.error) throw up2.error;
          await supabase.from("item_photos").insert({
            item_id: item.id,
            household_id: householdId,
            storage_path: prevPath,
            width: compressed.width,
            height: compressed.height,
            created_by: userId,
          });
        } catch (perr) {
          toast.error(
            (isEnglish ? "Could not add photo: " : "Nie udało się dodać zdjęcia: ") +
              (perr instanceof Error ? perr.message : ""),
          );
        }
      }

      void logActivity({
        household_id: householdId,
        user_id: userId,
        action: "item_added",
        description: name.trim(),
        list_id: listId,
        item_id: item.id,
      });
      void notifyHousehold({
        householdId,
        type: "item_added",
        body: isEnglish ? `Added: ${name.trim()}` : `Dodano: ${name.trim()}`,
        listId,
        itemId: item.id,
        url: "/",
      });

      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["active-list", householdId] });
      toast.success(isEnglish ? "Product added" : "Dodano produkt");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEnglish ? "Error" : "Błąd");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title={t("addProduct")}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 bg-muted rounded-2xl p-1">
          <div className="text-center py-2 rounded-xl bg-card shadow-sm text-sm font-medium">
            {t("addProduct")}
          </div>
          <Link
            to="/quick-add"
            className="text-center py-2 rounded-xl text-sm font-medium text-muted-foreground"
          >
            {isEnglish ? "Quick list" : "Szybka lista"}
          </Link>
        </div>
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => {
            const nextName = e.target.value;
            setName(nextName);
            if (!categoryManual) setCategory(categorizeProduct(nextName));
          }}
          placeholder={isEnglish ? "What to buy? e.g. Milk 2%" : "Co kupić? np. Mleko 2%"}
          className="w-full px-4 py-4 rounded-2xl bg-card border border-border text-base"
        />
        {suggestions.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-2 space-y-1">
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {isEnglish ? "Suggestions from this household" : "Sugestie z tego domu"}
            </div>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="w-full px-3 py-2 rounded-xl text-left hover:bg-muted"
              >
                <div className="text-sm font-medium">{suggestion.phrase}</div>
                <div className="text-xs text-muted-foreground">
                  {[suggestion.category, suggestion.default_unit].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">
              {isEnglish ? "Quantity" : "Ilość"}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-transparent outline-none text-base"
            />
          </div>
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">
              {isEnglish ? "Unit" : "Jednostka"}
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full bg-transparent outline-none text-base"
            >
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl px-3 py-2">
          <label className="text-xs text-muted-foreground">
            {isEnglish ? "Category" : "Kategoria"}
          </label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCategoryManual(true);
            }}
            className="w-full bg-transparent outline-none text-base"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {!categoryManual && name.trim() && (
          <p className="text-xs text-muted-foreground px-1">
            {category === "Inne"
              ? isEnglish
                ? "Category not recognized - set to Other."
                : "Nie rozpoznano kategorii — ustawiono Inne."
              : isEnglish
                ? "Category selected automatically. You can change it."
                : "Kategoria dobrana automatycznie. Możesz ją zmienić."}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">{isEnglish ? "Store" : "Sklep"}</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full bg-transparent outline-none text-base"
            >
              <option value="">{isEnglish ? "Default list store" : "Domyślny sklep listy"}</option>
              {(storesQ.data ?? []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">
              {isEnglish ? "Unit price" : "Cena za jednostkę"}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(e.target.value)}
              placeholder={isEnglish ? "e.g. 4.99" : "np. 4,99"}
              className="w-full bg-transparent outline-none text-base"
            />
          </div>
        </div>
        {estimatedPrice && !storeId && (
          <p className="text-xs text-muted-foreground px-1">
            {isEnglish
              ? "The price will go to history if the list has a default store."
              : "Cena trafi do historii, jeśli lista ma domyślny sklep."}
          </p>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isEnglish ? "Note (optional)" : "Notatka (opcjonalnie)"}
          rows={2}
          className="w-full px-4 py-3 rounded-2xl bg-card border border-border"
        />

        <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">
              {isEnglish
                ? "Buy exactly the one from the photo"
                : "Kup dokładnie taki jak na zdjęciu"}
            </span>
            <input
              type="checkbox"
              checked={exact}
              onChange={(e) => setExact(e.target.checked)}
              className="w-5 h-5 accent-primary"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {isEnglish
              ? "Off = a similar substitute is OK."
              : "Wyłączone = może być podobny zamiennik."}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{isEnglish ? "Photo" : "Zdjęcie"}</span>
            {photo && (
              <button
                type="button"
                onClick={() => onPhoto(null)}
                className="text-xs text-destructive flex items-center gap-1"
              >
                <X className="w-3 h-3" /> {isEnglish ? "Remove" : "Usuń"}
              </button>
            )}
          </div>
          {photoPreview ? (
            <img
              src={photoPreview}
              alt={isEnglish ? "preview" : "podgląd"}
              className="w-full max-h-64 object-contain rounded-xl bg-muted"
            />
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground cursor-pointer">
              <Camera className="w-6 h-6" />
              <span className="text-sm">
                {isEnglish
                  ? "Take a photo or choose from gallery"
                  : "Zrób zdjęcie lub wybierz z galerii"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          )}
        </div>

        <button
          disabled={busy || !name.trim() || !canAddItems(role)}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {busy ? (isEnglish ? "Adding…" : "Dodaję…") : t("addProductCta")}
        </button>
      </form>
    </AppShell>
  );
}
