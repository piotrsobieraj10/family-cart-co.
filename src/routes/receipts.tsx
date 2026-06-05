import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { formatPrice } from "@/lib/products";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { getStoresFn, getReceiptsFn, addReceiptFn } from "@/lib/api/data.functions";

export const Route = createFileRoute("/receipts")({ component: ReceiptsPage });

function ReceiptsPage() {
  return (
    <RequireAuth>
      {({ userId, householdId, role }) => (
        <Inner userId={userId} householdId={householdId} role={role} />
      )}
    </RequireAuth>
  );
}

function Inner({
  userId: _userId,
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
  const [storeId, setStoreId] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = canAddItems(role);

  const storesQ = useQuery({
    queryKey: ["stores", householdId],
    queryFn: () => getStoresFn({ data: { householdId } }),
  });
  const receiptsQ = useQuery({
    queryKey: ["receipts", householdId],
    queryFn: () => getReceiptsFn({ data: { householdId } }),
  });

  const addReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    try {
      await addReceiptFn({
        data: {
          householdId,
          store_id: storeId || null,
          receipt_date: receiptDate || null,
          total_amount: totalAmount ? Number(totalAmount) : null,
        },
      });
      setTotalAmount("");
      qc.invalidateQueries({ queryKey: ["receipts", householdId] });
      toast.success(isEnglish ? "Receipt added" : "Dodano paragon");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not add receipt"
            : "Nie udało się dodać paragonu",
      );
    } finally {
      setBusy(false);
    }
  };

  const storeName = new Map((storesQ.data ?? []).map((s) => [s.id, s.name]));

  return (
    <AppShell title={t("receipts")}>
      <Link to="/settings" className="text-sm text-muted-foreground">
        ← {isEnglish ? "Back to settings" : "Wróć do ustawień"}
      </Link>

      <section className="mt-4 bg-card border border-border rounded-2xl p-4">
        <h2 className="font-semibold">{isEnglish ? "Add receipt" : "Dodaj paragon"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEnglish
            ? "OCR is prepared for a later stage. The app currently does not read products automatically."
            : "OCR jest przygotowany jako etap do późniejszego uruchomienia. Aplikacja nie odczytuje jeszcze automatycznie produktów."}
        </p>
        {canAdd && (
          <form onSubmit={addReceipt} className="mt-4 space-y-3">
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-muted"
            >
              <option value="">{isEnglish ? "Unknown store" : "Sklep nieznany"}</option>
              {(storesQ.data ?? []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="min-w-0 px-3 py-3 rounded-xl bg-muted"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder={isEnglish ? "Total" : "Suma"}
                className="min-w-0 px-3 py-3 rounded-xl bg-muted"
              />
            </div>
            <button
              disabled={busy}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {busy
                ? isEnglish
                  ? "Adding…"
                  : "Dodaję…"
                : isEnglish
                  ? "Add receipt"
                  : "Dodaj paragon"}
            </button>
          </form>
        )}
      </section>

      <ul className="mt-4 space-y-2">
        {(receiptsQ.data ?? []).map((receipt) => (
          <li key={receipt.id} className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <ReceiptText className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {receipt.store_id
                    ? storeName.get(receipt.store_id) || (isEnglish ? "Store" : "Sklep")
                    : isEnglish
                      ? "Unknown store"
                      : "Sklep nieznany"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {receipt.receipt_date || (isEnglish ? "Unknown date" : "Data nieznana")} ·{" "}
                  {formatPrice(receipt.total_amount)}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {isEnglish ? "To review" : "Do weryfikacji"}
              </span>
            </div>
          </li>
        ))}
        {!receiptsQ.isLoading && (receiptsQ.data?.length ?? 0) === 0 && (
          <li className="text-center py-10 text-sm text-muted-foreground">
            {isEnglish
              ? "No receipts have been added yet."
              : "Nie dodano jeszcze żadnego paragonu."}
          </li>
        )}
      </ul>
    </AppShell>
  );
}
