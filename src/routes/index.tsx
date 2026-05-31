import { createFileRoute } from "@tanstack/react-router";
import { ActiveListPage } from "@/pages/ActiveListPage";

export const Route = createFileRoute("/")({
  component: ActiveListPage,
});
