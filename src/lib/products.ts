import { upsertDictionaryEntryFn, savePriceFn } from "@/lib/api/data.functions";

export function normalizePhrase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pl-PL")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function formatPrice(value: number | null | undefined) {
  if (value == null) return "Cena nieznana";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value);
}

export async function rememberProduct({
  householdId,
  phrase,
  category,
  unit,
  storeId,
  barcode,
}: {
  householdId: string;
  userId?: string;
  phrase: string;
  category?: string | null;
  unit?: string | null;
  storeId?: string | null;
  barcode?: string | null;
}) {
  const normalized = normalizePhrase(phrase);
  if (!normalized) return;
  await upsertDictionaryEntryFn({
    data: {
      householdId,
      phrase,
      category: category ?? null,
      default_store_id: storeId ?? null,
      barcode: barcode ?? null,
    },
  });
}

export async function saveManualPrice({
  householdId,
  storeId,
  productName,
  category,
  unit,
  price,
}: {
  householdId: string;
  userId?: string;
  storeId: string;
  productName: string;
  category?: string | null;
  unit?: string | null;
  price: number;
}) {
  const normalized = normalizePhrase(productName);
  if (!normalized || !Number.isFinite(price) || price < 0) return;
  await savePriceFn({
    data: {
      householdId,
      storeId,
      productName,
      category: category ?? null,
      unit: unit ?? null,
      price,
    },
  });
}
