import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: RouteComponent,
  head: () => ({
    meta: [
      { title: "History | PGC Tour" },
      {
        name: "description",
        content: "Explore past PGC Tour seasons and results.",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold">History</h1>
      <p className="mt-2 text-muted-foreground">
        Season history is coming soon.
      </p>
    </div>
  );
}
