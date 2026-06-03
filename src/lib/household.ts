import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HouseholdRole } from "@/lib/permissions";

export function useMyHouseholds(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-households", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id, role, status, households(id, name, owner_id)")
        .eq("user_id", userId!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Array<{
        household_id: string;
        role: HouseholdRole;
        status: string;
        households: { id: string; name: string; owner_id: string } | null;
      }>;
    },
  });
}

const KEY = "zr.activeHouseholdId";

export function getActiveHouseholdId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setActiveHouseholdId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, id);
}

export function clearActiveHouseholdId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export async function logActivity(params: {
  household_id: string;
  user_id: string;
  action: string;
  description?: string;
  list_id?: string | null;
  item_id?: string | null;
}) {
  await supabase.from("activity_log").insert({
    household_id: params.household_id,
    user_id: params.user_id,
    action: params.action,
    description: params.description ?? null,
    list_id: params.list_id ?? null,
    item_id: params.item_id ?? null,
  });
}
