import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfileFn, getMyHouseholdsFn } from "@/lib/api/auth.functions";
import type { HouseholdRole } from "@/lib/permissions";

export interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function getStoredToken(): string | null {
  return null;
}

export function storeToken(_token: string) {
  // Supabase stores sessions internally.
}

export function clearToken() {
  // Kept for compatibility with older callers.
}

export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const sessionUser = data.session?.user;
      setUser(
        sessionUser?.email
          ? {
              id: sessionUser.id,
              email: sessionUser.email,
              email_confirmed_at: sessionUser.email_confirmed_at ?? null,
            }
          : null,
      );
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      setUser(
        sessionUser?.email
          ? {
              id: sessionUser.id,
              email: sessionUser.email,
              email_confirmed_at: sessionUser.email_confirmed_at ?? null,
            }
          : null,
      );
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: () => getMyProfileFn({ data: { userId: userId! } }),
  });
}

export function useMyHouseholds(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-households", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = await getMyHouseholdsFn({ data: { userId: userId! } });
      console.log("[household] memberships count", rows.length);
      return rows as unknown as Array<{
        household_id: string;
        role: HouseholdRole;
        status: string;
        households: { id: string; name: string; owner_id: string } | null;
      }>;
    },
  });
}
