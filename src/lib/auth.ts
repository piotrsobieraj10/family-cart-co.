import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMeFn, getMyProfileFn, getMyHouseholdsFn } from "@/lib/api/auth.functions";
import type { HouseholdRole } from "@/lib/permissions";

// ── Token storage ──────────────────────────────────────────────────────────
const TOKEN_KEY = "fc.token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

// ── User type (compatible shape for RequireAuth) ────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at: string; // always set — local auth doesn't need email confirmation
}

// ── useAuth hook ───────────────────────────────────────────────────────────
export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const result = await getMeFn();
      if (result.user) {
        setUser({ ...result.user, email_confirmed_at: "confirmed" });
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading };
}

// ── signOut ────────────────────────────────────────────────────────────────
export async function signOut() {
  clearToken();
  window.location.href = "/login";
}

// ── useMyProfile ───────────────────────────────────────────────────────────
export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: () => getMyProfileFn({ data: { userId: userId! } }),
  });
}

// ── useMyHouseholds — re-exported here so household.ts uses same hook ──────
export function useMyHouseholds(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-households", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = await getMyHouseholdsFn({ data: { userId: userId! } });
      return rows as Array<{
        household_id: string;
        role: HouseholdRole;
        status: string;
        households: { id: string; name: string; owner_id: string } | null;
      }>;
    },
  });
}
