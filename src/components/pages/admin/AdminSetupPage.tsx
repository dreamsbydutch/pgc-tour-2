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
import { Field } from "@/components/internal/AdminField";
import { normalizeList } from "@/lib";
import { CoursesSection } from "@/components/internal/CoursesSection";
import { MembersManager } from "@/components/internal/MembersManager";
import { SeasonsSection } from "@/components/internal/SeasonsSection";
import { TiersSection } from "@/components/internal/TiersSection";
import { ToursSection } from "@/components/internal/ToursSection";
import { TransactionsManager } from "@/components/internal/TransactionsManager";
import type { AdminDashboardSection } from "@/lib/types";
import { AdminCronsPage } from "@/components/pages/admin/AdminCronsPage";
import { AdminEmailsPage } from "@/components/pages/admin/AdminEmailsPage";
import { AdminGolfersPage } from "@/components/pages/admin/AdminGolfersPage";
import { AdminTeamsPage } from "@/components/pages/admin/AdminTeamsPage";
import { AdminTourCardsPage } from "@/components/pages/admin/AdminTourCardsPage";
import { AdminTournamentsPage } from "@/components/pages/admin/AdminTournamentsPage";
import { MemberAccountAuditPage } from "@/components/pages/admin/MemberAccountAuditPage";
import { AdminMemberMergePage } from "@/components/pages/admin/AdminMemberMergePage";

/**
 * Admin page for league setup.
 *
 * @param props - Controlled UI state for the active admin dashboard section.
 * @returns Admin dashboard UI with section navigation, optional season filter (for tours/tiers), and section-specific managers.
 */
export function AdminSetupPage(props: {
  section: AdminDashboardSection;
  onSectionChange: (next: AdminDashboardSection) => void;
}) {
  const { isAdmin, isRoleLoading, seasons, seasonFilter, setSeasonFilter } =
    useAdminSetupPage();

  const sectionOptions = useMemo(
    () => [
      { label: "Seasons", value: "seasons" as const },
      { label: "Tours", value: "tours" as const },
      { label: "Tiers", value: "tiers" as const },
      { label: "Courses", value: "courses" as const },
      { label: "Members", value: "members" as const },
      { label: "Member Merge", value: "member-merge" as const },
      { label: "Account Audit", value: "account-audit" as const },
      { label: "Transactions", value: "transactions" as const },
      { label: "Emails", value: "emails" as const },
      { label: "Tournaments", value: "tournaments" as const },
      { label: "Teams", value: "teams" as const },
      { label: "Tour Cards", value: "tourcards" as const },
      { label: "Golfers", value: "golfers" as const },
      { label: "Crons", value: "crons" as const },
    ],
    [],
  );

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>

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
                  <CardDescription>
                    Manage league and admin data.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2">
                    {sectionOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={
                          props.section === opt.value ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={() => props.onSectionChange(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>

                  {props.section === "tours" || props.section === "tiers" ? (
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
                {props.section === "seasons" ? (
                  <SeasonsSection seasons={seasons} />
                ) : null}
                {props.section === "tours" ? (
                  <ToursSection seasons={seasons} seasonFilter={seasonFilter} />
                ) : null}
                {props.section === "tiers" ? (
                  <TiersSection seasons={seasons} seasonFilter={seasonFilter} />
                ) : null}
                {props.section === "courses" ? <CoursesSection /> : null}
                {props.section === "members" ? <MembersManager /> : null}
                {props.section === "member-merge" ? (
                  <AdminMemberMergePage />
                ) : null}
                {props.section === "account-audit" ? (
                  <MemberAccountAuditPage />
                ) : null}
                {props.section === "transactions" ? (
                  <TransactionsManager />
                ) : null}
                {props.section === "emails" ? <AdminEmailsPage /> : null}
                {props.section === "tournaments" ? (
                  <AdminTournamentsPage />
                ) : null}
                {props.section === "teams" ? <AdminTeamsPage /> : null}
                {props.section === "tourcards" ? <AdminTourCardsPage /> : null}
                {props.section === "golfers" ? <AdminGolfersPage /> : null}
                {props.section === "crons" ? <AdminCronsPage /> : null}
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
