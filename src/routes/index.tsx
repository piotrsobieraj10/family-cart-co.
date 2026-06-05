import { createFileRoute } from "@tanstack/react-router";
import { ActiveListPage } from "@/pages/ActiveListPage";
import { RequireAuth } from "@/pages/RequireAuth";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  return <RequireAuth>{(ctx) => <ActiveListPage {...ctx} />}</RequireAuth>;
}
