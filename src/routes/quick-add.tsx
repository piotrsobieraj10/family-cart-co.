import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { CATEGORIES, UNITS, parseQuickList, type ParsedProduct } from "@/lib/categories";
import { ensureActiveList } from "@/lib/shopping";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { rememberProduct } from "@/lib/products";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { quickAddItemsFn } from "@/lib/api/data.functions";

export const Route = createFileRoute("/quick-add")({ component: QuickAddPage });

function QuickAddPage() {
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
  const [text, setText] = useState("");
  const [items, setItems] = useState<ParsedProduct[]>([]);
  const [busy, setBusy] = useState(false);

  const process = () => {
    const parsed = parseQuickList(text);
    if (parsed.length === 0)
      return toast.error(
        isEnglish ? "Enter products one per line" : "Wpisz produkty jeden pod drugim",
      );
    setItems(parsed);
    if (parsed.some((item) => !item.categoryRecognized)) {
      toast.info(
        isEnglish
          ? "Category not recognized - set to Other"
          : "Nie rozpoznano kategorii — ustawiono Inne",
      );
    } else {
      toast.success(
        isEnglish ? "Categories selected automatically" : "Kategorie zostały dobrane automatycznie",
      );
    }
  };

  const updateItem = (index: number, patch: Partial<ParsedProduct>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addAll = async () => {
    if (!canAddItems(role))
      return toast.error(
        isEnglish
          ? "You do not have permission to add products"
          : "Nie masz uprawnień do dodawania produktów",
      );
    if (items.length === 0) return;
    setBusy(true);
    try {
      const list = await ensureActiveList(householdId, userId);
      await quickAddItemsFn({
        data: {
          householdId,
          listId: list.id,
          items: items.map((item) => ({
            name: item.name.trim(),
            quantity: item.quantity ?? null,
            unit: item.unit || null,
            category: item.category,
            store_id: list.default_store_id ?? null,
          })),
        },
      });
      try {
        await Promise.all(
          items.map((item) =>
            rememberProduct({
              householdId,
              phrase: item.name,
              category: item.category,
              unit: item.unit,
            }),
          ),
        );
      } catch {
        toast.error(
          isEnglish
            ? "Products added, but household suggestions could not be updated"
            : "Produkty dodano, ale nie udało się zaktualizować sugestii domu",
        );
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["active-list", householdId] });
      toast.success(
        isEnglish
          ? `Added ${items.length} products to the list`
          : `Dodano ${items.length} produktów do listy`,
      );
      navigate({ to: "/" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not add products"
            : "Nie udało się dodać produktów",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title={isEnglish ? "Quick shopping list" : "Szybka lista zakupów"}>
      <div className="grid grid-cols-2 gap-2 bg-muted rounded-2xl p-1 mb-3">
        <Link
          to="/add"
          className="text-center py-2 rounded-xl text-sm font-medium text-muted-foreground"
        >
          {t("addProduct")}
        </Link>
        <div className="text-center py-2 rounded-xl bg-card shadow-sm text-sm font-medium">
          {isEnglish ? "Quick list" : "Szybka lista"}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={
              isEnglish
                ? "Enter products one per line\n\nmilk 2 pcs\nplain yogurt\nbananas 1 kg\nwater 6x"
                : "Wpisz produkty jeden pod drugim\n\nmleko 2 szt\njogurt naturalny\nbanany 1 kg\nwoda 6x"
            }
            className="w-full px-4 py-4 rounded-2xl bg-card border border-border text-base resize-none"
          />
          <p className="text-xs text-muted-foreground px-1">
            {isEnglish
              ? "Enter products one per line. You can adjust quantity, unit, and category before adding."
              : "Wpisz produkty jeden pod drugim. Ilość, jednostkę i kategorię możesz poprawić przed dodaniem."}
          </p>
          <button
            onClick={process}
            disabled={!text.trim()}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {isEnglish ? "Process list" : "Przetwórz listę"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-semibold">{isEnglish ? "List preview" : "Podgląd listy"}</h2>
            <button onClick={() => setItems([])} className="text-xs text-primary">
              {isEnglish ? "Edit text" : "Edytuj tekst"}
            </button>
          </div>
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={`${index}-${item.name}`}
                className="bg-card border border-border rounded-2xl p-3 space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent font-medium outline-none"
                  />
                  <button
                    onClick={() => setItems((c) => c.filter((_, i) => i !== index))}
                    className="text-destructive p-1"
                    aria-label={isEnglish ? "Remove from preview" : "Usuń z podglądu"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.quantity ?? ""}
                    onChange={(e) =>
                      updateItem(index, {
                        quantity: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder={isEnglish ? "Qty" : "Ilość"}
                    className="min-w-0 px-2 py-2 rounded-xl bg-muted text-sm"
                  />
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(index, { unit: e.target.value })}
                    className="min-w-0 px-2 py-2 rounded-xl bg-muted text-sm"
                  >
                    <option value="">—</option>
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <select
                    value={item.category}
                    onChange={(e) =>
                      updateItem(index, {
                        category: e.target.value as ParsedProduct["category"],
                        categoryRecognized: true,
                      })
                    }
                    className="min-w-0 px-2 py-2 rounded-xl bg-muted text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-20 pt-2 bg-background/90 backdrop-blur">
            <button
              onClick={addAll}
              disabled={busy || items.length === 0 || !canAddItems(role)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg disabled:opacity-60"
            >
              {busy
                ? isEnglish
                  ? "Adding…"
                  : "Dodaję…"
                : isEnglish
                  ? `Add ${items.length} products to the list`
                  : `Dodaj ${items.length} produktów do listy`}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
