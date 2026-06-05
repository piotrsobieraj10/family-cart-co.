import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { CATEGORIES, UNITS, categorizeProduct } from "@/lib/categories";
import { ensureActiveList } from "@/lib/shopping";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { normalizePhrase, rememberProduct, saveManualPrice } from "@/lib/products";
import { notifyHousehold } from "@/lib/push";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { getStoresFn, getDictionaryFn, addItemFn } from "@/lib/api/data.functions";

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
  const [busy, setBusy] = useState(false);

  const storesQ = useQuery({
    queryKey: ["stores", householdId],
    queryFn: () => getStoresFn({ data: { householdId } }),
  });

  const dictionaryQ = useQuery({
    queryKey: ["product-dictionary", householdId],
    queryFn: () => getDictionaryFn({ data: { householdId } }),
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
    if (suggestion.default_store_id) setStoreId(suggestion.default_store_id);
    setCategoryManual(true);
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

      const result = await addItemFn({
        data: {
          listId,
          householdId,
          name: name.trim(),
          quantity: quantity ? Number(quantity) : null,
          unit,
          category,
          note: note.trim() || null,
          store_id: selectedStoreId,
          estimated_unit_price: price,
        },
      });

      try {
        await rememberProduct({
          householdId,
          phrase: name,
          category,
          unit,
          storeId: selectedStoreId,
        });
        if (price != null && selectedStoreId) {
          await saveManualPrice({
            householdId,
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

      void notifyHousehold({
        householdId,
        type: "item_added",
        body: isEnglish ? `Added: ${name.trim()}` : `Dodano: ${name.trim()}`,
        listId,
        itemId: result.id,
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
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => applySuggestion(s)}
                className="w-full px-3 py-2 rounded-xl text-left hover:bg-muted"
              >
                <div className="text-sm font-medium">{s.phrase}</div>
                <div className="text-xs text-muted-foreground">
                  {[s.category].filter(Boolean).join(" · ")}
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
              {(storesQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isEnglish ? "Note (optional)" : "Notatka (opcjonalnie)"}
          rows={2}
          className="w-full px-4 py-3 rounded-2xl bg-card border border-border"
        />

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
