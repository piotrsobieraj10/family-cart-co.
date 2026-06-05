import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrapFn, getMeFn, getMyProfileFn, getMyHouseholdsFn } from "@/lib/api/auth.functions";
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

// ── User type ───────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at: string;
}

// ── Bootstrap types ─────────────────────────────────────────────────────────
export type BootstrapProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  must_complete_profile: boolean;
  must_change_password: boolean;
} | null;

export type BootstrapMembership = {
  household_id: string;
  role: HouseholdRole;
  status: string;
  households: { id: string; name: string; owner_id: string } | null;
};

// ── useBootstrap — single round-trip for user + profile + memberships ────────
// Returns all auth data in one server function call.
// Cached for 30s (via QueryClient defaultOptions); skips entirely if no token.
export function useBootstrap() {
  const hasToken = typeof window !== "undefined" && !!getStoredToken();
  const t0 = useRef(Date.now());

  const query = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      console.log(`[perf] bootstrap fetch start (${Date.now() - t0.current}ms since mount)`);
      const t = Date.now();
      const result = await getBootstrapFn();
      console.log(`[perf] bootstrap fetch done: ${Date.now() - t}ms`);
      if (!result.user) clearToken();
      return result;
    },
    enabled: hasToken,
    staleTime: 30_000,
    retry: false,
  });

  return query;
}

// ── useAuth — derived from bootstrap ────────────────────────────────────────
export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const hasToken = typeof window !== "undefined" && !!getStoredToken();
  const { data, isLoading } = useBootstrap();

  if (!hasToken) return { user: null, loading: false };

  const user = data?.user
    ? { ...data.user, email_confirmed_at: "confirmed" }
    : null;

  return { user, loading: isLoading };
}

// ── signOut ──────────────────────────────────────────────────────────────────
export async function signOut() {
  clearToken();
  window.location.href = "/login";
}

// ── useMyProfile — reads from bootstrap cache, falls back to individual fetch ─
export function useMyProfile(userId: string | undefined) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Awaited<ReturnType<typeof getBootstrapFn>>>(["bootstrap"]);

  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    initialData: cached?.profile && cached.user?.id === userId ? cached.profile : undefined,
    queryFn: () => getMyProfileFn({ data: { userId: userId! } }),
  });
}

// ── useMyHouseholds — reads from bootstrap cache, falls back to individual fetch
export function useMyHouseholds(userId: string | undefined) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Awaited<ReturnType<typeof getBootstrapFn>>>(["bootstrap"]);

  return useQuery({
    queryKey: ["my-households", userId],
    enabled: !!userId,
    initialData:
      cached?.user?.id === userId && cached?.memberships?.length !== undefined
        ? (cached.memberships as BootstrapMembership[])
        : undefined,
    queryFn: async () => {
      const rows = await getMyHouseholdsFn({ data: { userId: userId! } });
      return rows as BootstrapMembership[];
    },
  });
}
