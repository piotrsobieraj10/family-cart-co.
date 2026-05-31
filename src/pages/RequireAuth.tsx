import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useMyHouseholds, getActiveHouseholdId, setActiveHouseholdId } from "@/lib/household";

export function RequireAuth({
  children,
  requireHousehold = true,
}: {
  children: (ctx: { userId: string; householdId: string }) => ReactNode;
  requireHousehold?: boolean;
}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: memberships, isLoading: hhLoading } = useMyHouseholds(user?.id);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!requireHousehold) return;
    if (hhLoading) return;
    if (!memberships || memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    const active = getActiveHouseholdId();
    if (!active || !memberships.find((m) => m.household_id === active)) {
      setActiveHouseholdId(memberships[0].household_id);
    }
  }, [user, loading, memberships, hhLoading, navigate, requireHousehold]);

  if (loading || !user) {
    return <Loader />;
  }
  if (requireHousehold) {
    if (hhLoading || !memberships || memberships.length === 0) return <Loader />;
    const active = getActiveHouseholdId() ?? memberships[0].household_id;
    return <>{children({ userId: user.id, householdId: active })}</>;
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