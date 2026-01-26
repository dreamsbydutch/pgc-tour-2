import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/facilitators";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return <HomePage />;
}
