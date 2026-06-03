import { supabase } from "@/integrations/supabase/client";

export async function findActiveList(householdId: string) {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select("id, status, default_store_id, budget_amount, estimated_total, actual_total")
    .eq("household_id", householdId)
    .in("status", ["active", "shopping", "partially_done"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureActiveList(householdId: string, userId: string) {
  const existing = await findActiveList(householdId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      created_by: userId,
      name: "Lista zakupów",
      status: "active",
    })
    .select("id, status, default_store_id, budget_amount, estimated_total, actual_total")
    .single();
  if (error) throw error;
  return data;
}
