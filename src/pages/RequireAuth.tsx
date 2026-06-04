import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, useMyProfile, useMyHouseholds } from "@/lib/auth";
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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useMyProfile(user?.id);
  const { data: memberships, isLoading: hhLoading } = useMyHouseholds(user?.id);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/login", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/login");
      });
      return;
    }
    if (profileLoading) return;
    if (
      requireCompleteProfile &&
      (profile?.must_complete_profile || profile?.must_change_password)
    ) {
      void navigate({ to: "/complete-profile", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/complete-profile");
      });
      return;
    }
    if (!requireHousehold) return;
    if (hhLoading) return;
    if (!memberships || memberships.length === 0) {
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
    if (
      memberships.length > 1 &&
      (!active || !memberships.find((m) => m.household_id === active))
    ) {
      void navigate({ to: "/select-household", replace: true }).catch(() => {
        if (typeof window !== "undefined") window.location.replace("/select-household");
      });
    }
  }, [
    user,
    loading,
    memberships,
    hhLoading,
    navigate,
    profile,
    profileLoading,
    requireCompleteProfile,
    requireHousehold,
  ]);

  // Not authenticated — redirect immediately (covers SSR hydration cases)
  if (!loading && !user) {
    if (typeof window !== "undefined") window.location.replace("/login");
    return <Loader />;
  }
  if (loading || !user || profileLoading) {
    return <Loader />;
  }
  if (requireCompleteProfile && (profile?.must_complete_profile || profile?.must_change_password)) {
    if (typeof window !== "undefined") window.location.replace("/complete-profile");
    return <Loader />;
  }
  if (requireHousehold) {
    if (hhLoading) return <Loader />;
    if (!memberships || memberships.length === 0) {
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
        {children({ userId: user.id, householdId: membership.household_id, role: membership.role as HouseholdRole })}
      </>
    );
  }
  return <>{children({ userId: user.id, householdId: "" })}</>;
}

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Ładowanie…
    </div>
  );
}
