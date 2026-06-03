import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, ReceiptText, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { compressToWebP } from "@/lib/image-compress";
import { canAddItems, type HouseholdRole } from "@/lib/permissions";
import { formatPrice } from "@/lib/products";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

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
  const [storeId, setStoreId] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAdd = canAddItems(role);

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

  const receiptsQ = useQuery({
    queryKey: ["receipts", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("id, store_id, receipt_date, total_amount, ocr_status, created_at")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const onPhoto = (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const addReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdd || !photo) return;
    setBusy(true);
    try {
      const { data: receipt, error } = await supabase
        .from("receipts")
        .insert({
          household_id: householdId,
          store_id: storeId || null,
          receipt_date: receiptDate || null,
          total_amount: totalAmount ? Number(totalAmount) : null,
          ocr_status: "awaiting_review",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const compressed = await compressToWebP(photo);
      const path = `${householdId}/${receipt.id}/receipt.webp`;
      const upload = await supabase.storage
        .from("receipt-images")
        .upload(path, compressed.preview, { contentType: "image/webp", upsert: true });
      if (upload.error) throw upload.error;

      const update = await supabase
        .from("receipts")
        .update({ image_url: path })
        .eq("id", receipt.id);
      if (update.error) throw update.error;

      onPhoto(null);
      setTotalAmount("");
      qc.invalidateQueries({ queryKey: ["receipts", householdId] });
      toast.success(isEnglish ? "Receipt added for review" : "Dodano paragon do weryfikacji");
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

  const storeName = new Map((storesQ.data ?? []).map((store) => [store.id, store.name]));

  return (
    <AppShell title={t("receipts")}>
      <Link to="/settings" className="text-sm text-muted-foreground">
        ← {isEnglish ? "Back to settings" : "Wróć do ustawień"}
      </Link>

      <section className="mt-4 bg-card border border-border rounded-2xl p-4">
        <h2 className="font-semibold">{isEnglish ? "Add receipt" : "Dodaj paragon"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEnglish
            ? "OCR is prepared for a later stage. The app currently does not read products automatically or save prices without your confirmation."
            : "OCR jest przygotowany jako etap do późniejszego uruchomienia. Obecnie aplikacja nie odczytuje automatycznie produktów ani nie zapisuje cen bez Twojego potwierdzenia."}
        </p>
        <p className="mt-2 text-xs text-warning">
          {isEnglish
            ? "Do not upload receipts containing personal, payment, or other sensitive information."
            : "Nie przesyłaj paragonów zawierających dane osobowe, dane płatnicze lub inne wrażliwe informacje."}
        </p>

        {canAdd && (
          <form onSubmit={addReceipt} className="mt-4 space-y-3">
            <select
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
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
                onChange={(event) => setReceiptDate(event.target.value)}
                className="min-w-0 px-3 py-3 rounded-xl bg-muted"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={(event) => setTotalAmount(event.target.value)}
                placeholder={isEnglish ? "Total" : "Suma"}
                className="min-w-0 px-3 py-3 rounded-xl bg-muted"
              />
            </div>
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt={isEnglish ? "Receipt preview" : "Podgląd paragonu"}
                  className="w-full max-h-72 object-contain rounded-xl bg-muted"
                />
                <button
                  type="button"
                  aria-label={isEnglish ? "Remove photo" : "Usuń zdjęcie"}
                  onClick={() => onPhoto(null)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-background/80 text-destructive"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground cursor-pointer">
                <Camera className="w-6 h-6" />
                <span className="text-sm">
                  {isEnglish
                    ? "Take a receipt photo or choose one from gallery"
                    : "Zrób zdjęcie paragonu lub wybierz je z galerii"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            )}
            <button
              disabled={busy || !photo}
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
