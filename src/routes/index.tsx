import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/pages/RequireAuth";
import { ActiveListPage } from "@/pages/ActiveListPage";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <RequireAuth>
      {({ userId, householdId, role }) => (
        <ActiveListPage userId={userId} householdId={householdId} role={role} />
      )}
    </RequireAuth>
  );
}
