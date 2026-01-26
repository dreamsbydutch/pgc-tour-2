"use client";

import { Edit, Trophy, Target } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";
import { Button, Skeleton } from "@/ui";

/**
 * Shows moderator controls for content management.
 *
 * Render behavior:
 * - When `loading` is true, renders an internal skeleton.
 * - Otherwise renders a static set of moderator actions.
 *
 * @param props.loading Whether to render a loading skeleton.
 * @returns Moderator tools card.
 */
export function ModeratorTools(props: { loading?: boolean }) {
  const model = useModeratorTools(props);

  if (model.status === "loading") return <ModeratorToolsSkeleton />;

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="h-5 w-5 text-blue-600" />
          Moderator Tools
        </CardTitle>
        <CardDescription>
          Content management and tournament operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {model.actions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="justify-start"
              size="sm"
              type="button"
            >
              <action.Icon className="mr-2 h-4 w-4" />
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Creates the view-model for `ModeratorTools`.
 *
 * @param props.loading Whether to render a loading skeleton.
 * @returns A discriminated model for loading vs ready.
 */
function useModeratorTools(props: { loading?: boolean }) {
  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        actions: Array<{
          id: "manageTournaments" | "updateGolfers" | "tournamentResults";
          label: string;
          Icon: typeof Trophy;
        }>;
      };

  if (props.loading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    actions: [
      { id: "manageTournaments", label: "Manage Tournaments", Icon: Trophy },
      { id: "updateGolfers", label: "Update Golfers", Icon: Target },
      { id: "tournamentResults", label: "Tournament Results", Icon: Edit },
    ],
  } as const satisfies Model;
}

/**
 * Loading UI for `ModeratorTools`.
 */
function ModeratorToolsSkeleton() {
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
