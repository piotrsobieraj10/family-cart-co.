import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, useMyProfile } from "@/lib/auth";
import { useMyHouseholds, getActiveHouseholdId, setActiveHouseholdId } from "@/lib/household";
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
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!user.email_confirmed_at) {
      navigate({ to: "/confirm-email", replace: true });
      return;
    }
    if (profileLoading) return;
    if (
      requireCompleteProfile &&
      (profile?.must_complete_profile || profile?.must_change_password)
    ) {
      navigate({ to: "/complete-profile", replace: true });
      return;
    }
    if (!requireHousehold) return;
    if (hhLoading) return;
    if (!memberships || memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
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
      navigate({ to: "/select-household", replace: true });
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

  if (loading || !user || !user.email_confirmed_at || profileLoading) {
    return <Loader />;
  }
  if (requireCompleteProfile && (profile?.must_complete_profile || profile?.must_change_password))
    return <Loader />;
  if (requireHousehold) {
    if (hhLoading || !memberships || memberships.length === 0) return <Loader />;
    const active = getActiveHouseholdId();
    const membership =
      memberships.find((m) => m.household_id === active) ??
      (memberships.length === 1 ? memberships[0] : undefined);
    if (!membership) return <Loader />;
    return (
      <>
        {children({ userId: user.id, householdId: membership.household_id, role: membership.role })}
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
