import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useMyHouseholds, getActiveHouseholdId, setActiveHouseholdId } from "@/lib/household";
import { ActiveListPage } from "@/components/pages/ActiveListPage";

export const Route = createFileRoute("/")({
  component: HomeGate,
});

function HomeGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: memberships, isLoading: hhLoading } = useMyHouseholds(user?.id);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (hhLoading) return;
    if (!memberships || memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    const active = getActiveHouseholdId();
    if (!active || !memberships.find((m) => m.household_id === active)) {
      setActiveHouseholdId(memberships[0].household_id);
    }
  }, [user, loading, memberships, hhLoading, navigate]);

  if (loading || !user || hhLoading || !memberships || memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Ładowanie…
      </div>
    );
  }

  return <ActiveListPage />;
}
