export { useMyHouseholds } from "@/lib/auth";
import type { HouseholdRole } from "@/lib/permissions";

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

// logActivity is a no-op stub (no activity_log table in schema)
export async function logActivity(_params: {
  household_id: string;
  user_id: string;
  action: string;
  description?: string;
  list_id?: string | null;
  item_id?: string | null;
}) {
  // stub — activity log not implemented in local DB
}
