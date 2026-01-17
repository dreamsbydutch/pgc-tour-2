import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { SignInButton } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SeasonDoc } from "../../../convex/types/types";

import { useRoleAccess } from "@/hooks/useRoleAccess";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, normalizeList } from "@/components/admin";
import {
  CoursesSection,
  MembersManager,
  SeasonsSection,
  TiersSection,
  ToursSection,
  TransactionsManager,
} from "@/components/admin";

export const Route = createFileRoute("/admin/setup")({
  component: AdminSetupPage,
});

type SetupSection =
  | "seasons"
  | "tours"
  | "tiers"
  | "courses"
  | "members"
  | "transactions";

function AdminSetupPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();
  const [section, setSection] = useState<SetupSection>("seasons");

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Admin: League Setup
        </h1>

        <Unauthenticated>
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>
                You must be signed in to access admin tools.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignInButton>
                <Button>Sign In</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </Unauthenticated>

        <AuthLoading>
          <Card>
            <CardHeader>
              <CardTitle>Loading…</CardTitle>
              <CardDescription>Signing you in…</CardDescription>
            </CardHeader>
          </Card>
        </AuthLoading>

        <Authenticated>
          {isRoleLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
              </CardHeader>
            </Card>
          ) : !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>Admin access required.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <SetupManager section={section} setSection={setSection} />
          )}
        </Authenticated>
      </div>
    </div>
  );
}

function SetupManager({
  section,
  setSection,
}: {
  section: SetupSection;
  setSection: (next: SetupSection) => void;
}) {
  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    const list = normalizeList<SeasonDoc, "seasons">(
      seasonsResult as unknown,
      "seasons",
    );

    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const [seasonFilter, setSeasonFilter] = useState<Id<"seasons"> | "">("");

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Sections</CardTitle>
          <CardDescription>Manage league setup data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <NavButton
              label="Seasons"
              isActive={section === "seasons"}
              onClick={() => setSection("seasons")}
            />
            <NavButton
              label="Tours"
              isActive={section === "tours"}
              onClick={() => setSection("tours")}
            />
            <NavButton
              label="Tiers"
              isActive={section === "tiers"}
              onClick={() => setSection("tiers")}
            />
            <NavButton
              label="Courses"
              isActive={section === "courses"}
              onClick={() => setSection("courses")}
            />
            <NavButton
              label="Members"
              isActive={section === "members"}
              onClick={() => setSection("members")}
            />
            <NavButton
              label="Transactions"
              isActive={section === "transactions"}
              onClick={() => setSection("transactions")}
            />
          </div>

          {section === "tours" || section === "tiers" ? (
            <div className="pt-3">
              <Field label="Season filter">
                <select
                  value={seasonFilter}
                  onChange={(e) =>
                    setSeasonFilter(e.target.value as Id<"seasons"> | "")
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">All seasons</option>
                  {seasons.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.year} #{s.number}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="min-w-0">
        {section === "seasons" ? <SeasonsSection seasons={seasons} /> : null}
        {section === "tours" ? (
          <ToursSection seasons={seasons} seasonFilter={seasonFilter} />
        ) : null}
        {section === "tiers" ? (
          <TiersSection seasons={seasons} seasonFilter={seasonFilter} />
        ) : null}
        {section === "courses" ? <CoursesSection /> : null}
        {section === "members" ? <MembersManager /> : null}
        {section === "transactions" ? <TransactionsManager /> : null}
      </div>
    </div>
  );
}

function NavButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      className="justify-start"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
