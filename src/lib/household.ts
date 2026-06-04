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

import { logActivityFn } from "@/lib/api/data.functions";

export async function logActivity(params: {
  household_id: string;
  user_id: string;
  action: string;
  description?: string;
  list_id?: string | null;
  item_id?: string | null;
}) {
  try {
    await logActivityFn({ data: params });
  } catch {
    // non-critical — swallow errors
  }
}
