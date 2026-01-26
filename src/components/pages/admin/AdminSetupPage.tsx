import { useMemo, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { SignInButton } from "@clerk/tanstack-react-start";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { SeasonDoc } from "../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";
import { Field } from "@/ui";
import { normalizeList } from "@/lib";
import {
  CoursesSection,
  MembersManager,
  SeasonsSection,
  TiersSection,
  ToursSection,
  TransactionsManager,
} from "@/components";

/**
 * Admin page for league setup.
 *
 * @returns Admin setup UI with section navigation, optional season filter (for tours/tiers), and section-specific managers.
 */
export function AdminSetupPage() {
  const {
    isAdmin,
    isRoleLoading,
    section,
    setSection,
    seasons,
    seasonFilter,
    setSeasonFilter,
  } = useAdminSetupPage();

  const sectionOptions = useMemo(
    () => [
      { label: "Seasons", value: "seasons" as const },
      { label: "Tours", value: "tours" as const },
      { label: "Tiers", value: "tiers" as const },
      { label: "Courses", value: "courses" as const },
      { label: "Members", value: "members" as const },
      { label: "Transactions", value: "transactions" as const },
    ],
    [],
  );

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
          <AdminSetupPageSkeleton />
        </AuthLoading>

        <Authenticated>
          {isRoleLoading ? (
            <AdminSetupPageSkeleton />
          ) : !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>Admin access required.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Sections</CardTitle>
                  <CardDescription>Manage league setup data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2">
                    {sectionOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={section === opt.value ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setSection(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>

                  {section === "tours" || section === "tiers" ? (
                    <div className="pt-3">
                      <Field label="Season filter">
                        <select
                          value={seasonFilter}
                          onChange={(e) =>
                            setSeasonFilter(
                              e.target.value as Id<"seasons"> | "",
                            )
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
                {section === "seasons" ? (
                  <SeasonsSection seasons={seasons} />
                ) : null}
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
          )}
        </Authenticated>
      </div>
    </div>
  );
}

/**
 * Hook backing the admin setup page.
 *
 * Fetches seasons (for section filtering + section content), tracks current section selection and season filter,
 * and exposes admin role gating state.
 */
function useAdminSetupPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();
  const [section, setSection] = useState<
    "seasons" | "tours" | "tiers" | "courses" | "members" | "transactions"
  >("seasons");

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

  return {
    isAdmin,
    isRoleLoading,
    section,
    setSection,
    seasons,
    seasonFilter,
    setSeasonFilter,
  };
}

/** Admin setup loading state placeholder. */
function AdminSetupPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
