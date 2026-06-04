import { getActiveListFn, ensureActiveListFn } from "@/lib/api/data.functions";

export async function findActiveList(householdId: string) {
  return getActiveListFn({ data: { householdId } });
}

export async function ensureActiveList(householdId: string, _userId: string) {
  return ensureActiveListFn({ data: { householdId } });
}
