export type HouseholdRole = "owner" | "admin" | "member" | "viewer";

export function canManageHousehold(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin";
}

export function canManageMembers(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin";
}

export function canAddItems(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}

export function canEditAnyItem(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin";
}

export function canChangeItemStatus(role: HouseholdRole | undefined) {
  return canAddItems(role);
}

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  member: "Użytkownik",
  viewer: "Podgląd",
};
