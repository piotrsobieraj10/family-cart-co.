import { supabase } from "@/integrations/supabase/client";

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
  userId,
  phrase,
  category,
  unit,
  storeId,
  barcode,
}: {
  householdId: string;
  userId: string;
  phrase: string;
  category?: string | null;
  unit?: string | null;
  storeId?: string | null;
  barcode?: string | null;
}) {
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedPhrase) return;

  const { error } = await supabase.from("household_product_dictionary").upsert(
    {
      household_id: householdId,
      phrase: phrase.trim(),
      normalized_phrase: normalizedPhrase,
      category: category || null,
      default_unit: unit || null,
      default_store_id: storeId || null,
      barcode: barcode || null,
      created_by: userId,
      updated_by: userId,
    },
    { onConflict: "household_id,normalized_phrase" },
  );
  if (error) throw error;
}

export async function saveManualPrice({
  householdId,
  userId,
  storeId,
  productName,
  category,
  unit,
  price,
}: {
  householdId: string;
  userId: string;
  storeId: string;
  productName: string;
  category?: string | null;
  unit?: string | null;
  price: number;
}) {
  const normalizedProductName = normalizePhrase(productName);
  if (!normalizedProductName || !Number.isFinite(price) || price < 0) return;

  const { error } = await supabase.from("product_price_history").insert({
    household_id: householdId,
    store_id: storeId,
    product_name: productName.trim(),
    normalized_product_name: normalizedProductName,
    category: category || null,
    unit: unit || null,
    price,
    created_by: userId,
  });
  if (error) throw error;
}
