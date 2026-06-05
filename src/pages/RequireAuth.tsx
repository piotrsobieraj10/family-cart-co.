import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { useBootstrap, clearToken } from "@/lib/auth";
import { getActiveHouseholdId, setActiveHouseholdId } from "@/lib/household";
import type { HouseholdRole } from "@/lib/permissions";

export function RequireAuth({
  children,
  requireHousehold = true,
  requireCompleteProfile = true,
}: {
  children: (ctx: { userId: string; householdId: string; role?: HouseholdRole }) => ReactNode;
  requireHousehold?: boolean;
  requireCompleteProfile?: boolean;
}) {
  const navigate = useNavigate();
  const t0 = useRef(Date.now());

  // Single bootstrap query — replaces 3 sequential requests (getMeFn → profile → households)
  const { data, isLoading } = useBootstrap();

  const user = data?.user ?? null;
  const profile = data?.profile ?? null;
  const memberships = (data?.memberships ?? []) as Array<{
    household_id: string;
    role: HouseholdRole;
    status: string;
    households: { id: string; name: string; owner_id: string } | null;
  }>;

  // Perf logging
  useEffect(() => {
    if (!isLoading) {
      console.log(`[perf] RequireAuth resolved: ${Date.now() - t0.current}ms, user=${!!user}`);
    }
  }, [isLoading, user]);

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      clearToken();
      void navigate({ to: "/login", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/login");
      });
      return;
    }

    if (requireCompleteProfile && (profile?.must_complete_profile || profile?.must_change_password)) {
      void navigate({ to: "/complete-profile", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/complete-profile");
      });
      return;
    }

    if (!requireHousehold) return;

    if (memberships.length === 0) {
      void navigate({ to: "/onboarding", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/onboarding");
      });
      return;
    }

    const active = getActiveHouseholdId();
    if (memberships.length === 1 && (!active || memberships[0].household_id !== active)) {
      setActiveHouseholdId(memberships[0].household_id);
      return;
    }
    if (memberships.length > 1 && (!active || !memberships.find((m) => m.household_id === active))) {
      void navigate({ to: "/select-household", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/select-household");
      });
    }
  }, [isLoading, user, profile, memberships, navigate, requireCompleteProfile, requireHousehold]);

  // Immediate redirects for SSR hydration
  if (!isLoading && !user) {
    if (typeof window !== "undefined") window.location.replace("/login");
    return <Loader />;
  }
  if (isLoading || !user) {
    return <Loader />;
  }
  if (requireCompleteProfile && (profile?.must_complete_profile || profile?.must_change_password)) {
    if (typeof window !== "undefined") window.location.replace("/complete-profile");
    return <Loader />;
  }
  if (requireHousehold) {
    if (memberships.length === 0) {
      if (typeof window !== "undefined") window.location.replace("/onboarding");
      return <Loader />;
    }
    const active = getActiveHouseholdId();
    const membership =
      memberships.find((m) => m.household_id === active) ??
      (memberships.length === 1 ? memberships[0] : undefined);
    if (!membership) {
      if (typeof window !== "undefined") window.location.replace("/select-household");
      return <Loader />;
    }
    return (
      <>
        {children({
          userId: user.id,
          householdId: membership.household_id,
          role: membership.role,
        })}
      </>
    );
  }
  return <>{children({ userId: user.id, householdId: "" })}</>;
}

function Loader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <div className="text-4xl">🛒</div>
      <p className="text-sm text-muted-foreground animate-pulse">Ładowanie listy zakupów…</p>
    </div>
  );
}
