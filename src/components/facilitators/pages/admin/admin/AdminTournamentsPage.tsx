import { useMemo, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { SignInButton, useUser } from "@clerk/tanstack-react-start";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type {
  CourseDoc,
  SeasonDoc,
  TierDoc,
  TournamentDoc,
} from "../../../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { AdminDataTable } from "@/components/displays/admin/AdminDataTable";
import { Button, Field } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Admin page for creating and updating tournaments.
 *
 * Data sources:
 * - Convex: seasons, tiers, courses, tournaments
 * - Clerk: current user id (passed to admin mutations)
 */
export function AdminTournamentsPage() {
  const { isAdmin, isRoleLoading, vm } = useAdminTournamentsPage();

  function msToDateInput(ms: number | undefined): string {
    if (!ms) return "";
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Admin: Manage Tournaments
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
          <AdminTournamentsPageSkeleton />
        </AuthLoading>

        <Authenticated>
          {isRoleLoading ? (
            <AdminTournamentsPageSkeleton />
          ) : !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>Admin access required.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Create Tournament</CardTitle>
                  <CardDescription>
                    Creates a tournament in Convex. You must be an admin.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={vm.onCreateSubmit} className="space-y-4">
                    <Field label="Tournament Name">
                      <input
                        value={vm.createForm.name}
                        onChange={(e) =>
                          vm.updateCreateField("name", e.target.value)
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="e.g. The Masters"
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Season">
                        <select
                          value={vm.createForm.seasonId}
                          onChange={(e) => {
                            const nextSeasonId = e.target.value as
                              | Id<"seasons">
                              | "";
                            vm.updateCreateField("seasonId", nextSeasonId);
                            vm.updateCreateField("tierId", "");
                          }}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select season</option>
                          {vm.seasons.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.year} #{s.number}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Tier">
                        <select
                          value={vm.createForm.tierId}
                          onChange={(e) =>
                            vm.updateCreateField(
                              "tierId",
                              e.target.value as Id<"tiers"> | "",
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select tier</option>
                          {vm.createTiers.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field label="Course">
                      <select
                        value={vm.createForm.courseId}
                        onChange={(e) =>
                          vm.updateCreateField(
                            "courseId",
                            e.target.value as Id<"courses"> | "",
                          )
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="">Select course</option>
                        {vm.courses.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Start Date">
                        <input
                          type="date"
                          value={vm.createForm.startDate}
                          onChange={(e) =>
                            vm.updateCreateField("startDate", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="End Date">
                        <input
                          type="date"
                          value={vm.createForm.endDate}
                          onChange={(e) =>
                            vm.updateCreateField("endDate", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>

                    <Field label="Logo URL (optional)">
                      <input
                        value={vm.createForm.logoUrl}
                        onChange={(e) =>
                          vm.updateCreateField("logoUrl", e.target.value)
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="https://…"
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="API ID (optional)">
                        <input
                          value={vm.createForm.apiId}
                          onChange={(e) =>
                            vm.updateCreateField("apiId", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>

                      <Field label="Current Round (optional)">
                        <input
                          value={vm.createForm.currentRound}
                          onChange={(e) =>
                            vm.updateCreateField("currentRound", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>

                    {vm.createError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {vm.createError}
                      </div>
                    ) : null}

                    {vm.createSuccess ? (
                      <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        {vm.createSuccess}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <Button type="submit" disabled={vm.creating}>
                        {vm.creating ? "Creating…" : "Create Tournament"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Update Tournament</CardTitle>
                  <CardDescription>
                    Select a tournament below, edit fields, and save.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Field label="Filter tournaments by season (optional)">
                      <select
                        value={vm.selectedSeasonId}
                        onChange={(e) =>
                          vm.setSelectedSeasonId(
                            e.target.value as Id<"seasons"> | "",
                          )
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="">All seasons</option>
                        {vm.seasons.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.year} #{s.number}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <form onSubmit={vm.onSubmit} className="space-y-4">
                    <Field label="Tournament Name">
                      <input
                        value={vm.form.name}
                        onChange={(e) => vm.updateField("name", e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Start Date">
                        <input
                          type="date"
                          value={vm.form.startDate}
                          onChange={(e) =>
                            vm.updateField("startDate", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="End Date">
                        <input
                          type="date"
                          value={vm.form.endDate}
                          onChange={(e) =>
                            vm.updateField("endDate", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Season">
                        <select
                          value={vm.form.seasonId}
                          onChange={(e) =>
                            vm.updateField(
                              "seasonId",
                              e.target.value as Id<"seasons">,
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select season</option>
                          {vm.seasons.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.year} #{s.number}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Tier">
                        <select
                          value={vm.form.tierId}
                          onChange={(e) =>
                            vm.updateField(
                              "tierId",
                              e.target.value as Id<"tiers">,
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select tier</option>
                          {vm.tiers.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Course">
                        <select
                          value={vm.form.courseId}
                          onChange={(e) =>
                            vm.updateField(
                              "courseId",
                              e.target.value as Id<"courses">,
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select course</option>
                          {vm.courses.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Status (optional)">
                        <select
                          value={vm.form.status}
                          onChange={(e) =>
                            vm.updateField(
                              "status",
                              e.target.value as typeof vm.form.status,
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">(auto)</option>
                          <option value="upcoming">upcoming</option>
                          <option value="active">active</option>
                          <option value="completed">completed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Logo URL (optional)">
                        <input
                          value={vm.form.logoUrl}
                          onChange={(e) =>
                            vm.updateField("logoUrl", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>

                      <Field label="API ID (optional)">
                        <input
                          value={vm.form.apiId}
                          onChange={(e) =>
                            vm.updateField("apiId", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Current Round (optional)">
                        <input
                          value={vm.form.currentRound}
                          onChange={(e) =>
                            vm.updateField("currentRound", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          inputMode="numeric"
                        />
                      </Field>

                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Live Play</span>
                        <input
                          type="checkbox"
                          checked={vm.form.livePlay}
                          onChange={(e) =>
                            vm.updateField("livePlay", e.target.checked)
                          }
                        />
                      </label>
                    </div>

                    {vm.error ? (
                      <p className="text-sm text-red-600">{vm.error}</p>
                    ) : null}
                    {vm.success ? (
                      <p className="text-sm text-green-700">{vm.success}</p>
                    ) : null}

                    <div className="flex gap-2">
                      <Button type="submit" disabled={vm.submitting}>
                        {vm.submitting ? "Saving…" : "Update Tournament"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={vm.resetForm}
                        disabled={vm.submitting}
                      >
                        Clear
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tournaments</CardTitle>
                  <CardDescription>
                    Click “Edit” to load into the form.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminDataTable<TournamentDoc>
                    rows={vm.tournaments}
                    emptyMessage="No tournaments found."
                    columns={[
                      {
                        id: "name",
                        header: "Name",
                        cell: (t) => (
                          <span className="block max-w-[260px] truncate">
                            {t.name}
                          </span>
                        ),
                      },
                      {
                        id: "dates",
                        header: "Dates",
                        cell: (t) =>
                          `${msToDateInput(t.startDate)} → ${msToDateInput(t.endDate)}`,
                      },
                      {
                        id: "status",
                        header: "Status",
                        cell: (t) => t.status ?? "(auto)",
                      },
                      {
                        id: "actions",
                        header: "",
                        headClassName: "w-[1%]",
                        cell: (t) => (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => vm.loadTournament(t)}
                          >
                            Edit
                          </Button>
                        ),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </Authenticated>
      </div>
    </div>
  );
}

/**
 * Hook backing the tournaments admin page.
 *
 * Owns all Convex queries/mutations plus the create/update forms and messaging.
 */
function useAdminTournamentsPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();
  const { user } = useUser();

  function dateInputToMs(date: string, endOfDay = false): number {
    const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
    return new Date(`${date}${suffix}`).getTime();
  }

  function msToDateInput(ms: number | undefined): string {
    if (!ms) return "";
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeList<T, K extends string>(
    result: Array<T | null> | Record<K, Array<T | null>> | undefined,
    key: K,
  ): T[] {
    if (!result) return [];
    if (Array.isArray(result)) {
      return result.filter((x): x is T => x !== null);
    }
    const value = result[key];
    if (Array.isArray(value)) {
      return value.filter((x): x is T => x !== null);
    }
    return [];
  }

  const createTournament = useMutation(
    api.functions.tournaments.createTournaments,
  );
  const updateTournament = useMutation(
    api.functions.tournaments.updateTournaments,
  );

  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const tiersResult = useQuery(api.functions.tiers.getTiers, {
    options: {
      pagination: { limit: 200 },
      sort: { sortBy: "name", sortOrder: "asc" },
    },
  });

  const coursesResult = useQuery(api.functions.courses.getCourses, {
    options: {
      pagination: { limit: 500 },
      sort: { sortBy: "name", sortOrder: "asc" },
    },
  });

  const seasons = useMemo(() => {
    return normalizeList<SeasonDoc, "seasons">(
      seasonsResult as
        | Array<SeasonDoc | null>
        | { seasons: Array<SeasonDoc | null> }
        | undefined,
      "seasons",
    ).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const tiersAll = useMemo(() => {
    return normalizeList<TierDoc, "tiers">(
      tiersResult as
        | Array<TierDoc | null>
        | { tiers: Array<TierDoc | null> }
        | undefined,
      "tiers",
    );
  }, [tiersResult]);

  const courses = useMemo(() => {
    return normalizeList<CourseDoc, "courses">(
      coursesResult as
        | Array<CourseDoc | null>
        | { courses: Array<CourseDoc | null> }
        | undefined,
      "courses",
    );
  }, [coursesResult]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<Id<"seasons"> | "">(
    "",
  );

  const tournamentsResult = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      filter: {
        ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
      },
      pagination: { limit: 100 },
      sort: { sortBy: "startDate", sortOrder: "asc" },
    },
  });

  const tournaments = useMemo(() => {
    const raw = tournamentsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TournamentDoc | null>).filter(
          (t): t is TournamentDoc => t !== null,
        )
      : [];
    return list;
  }, [tournamentsResult]);

  type TournamentStatus = "upcoming" | "active" | "completed" | "cancelled";

  type TournamentFormState = {
    tournamentId: Id<"tournaments"> | "";
    name: string;
    seasonId: Id<"seasons"> | "";
    tierId: Id<"tiers"> | "";
    courseId: Id<"courses"> | "";
    startDate: string;
    endDate: string;
    status: TournamentStatus | "";
    logoUrl: string;
    apiId: string;
    livePlay: boolean;
    currentRound: string;
  };

  const [form, setForm] = useState<TournamentFormState>({
    tournamentId: "",
    name: "",
    seasonId: "",
    tierId: "",
    courseId: "",
    startDate: "",
    endDate: "",
    status: "",
    logoUrl: "",
    apiId: "",
    livePlay: false,
    currentRound: "",
  });

  const [createForm, setCreateForm] = useState<{
    name: string;
    seasonId: Id<"seasons"> | "";
    tierId: Id<"tiers"> | "";
    courseId: Id<"courses"> | "";
    startDate: string;
    endDate: string;
    logoUrl: string;
    apiId: string;
    currentRound: string;
  }>({
    name: "",
    seasonId: "",
    tierId: "",
    courseId: "",
    startDate: "",
    endDate: "",
    logoUrl: "",
    apiId: "",
    currentRound: "",
  });

  const tiers = useMemo(() => {
    if (!form.seasonId) return tiersAll;
    return tiersAll.filter((t) => t.seasonId === form.seasonId);
  }, [form.seasonId, tiersAll]);

  const createTiers = useMemo(() => {
    if (!createForm.seasonId) return tiersAll;
    return tiersAll.filter((t) => t.seasonId === createForm.seasonId);
  }, [createForm.seasonId, tiersAll]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  function updateField<K extends keyof TournamentFormState>(
    key: K,
    value: TournamentFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateCreateField<K extends keyof typeof createForm>(
    key: K,
    value: (typeof createForm)[K],
  ) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm({
      tournamentId: "",
      name: "",
      seasonId: "",
      tierId: "",
      courseId: "",
      startDate: "",
      endDate: "",
      status: "",
      logoUrl: "",
      apiId: "",
      livePlay: false,
      currentRound: "",
    });
    setError(null);
    setSuccess(null);
  }

  function resetCreateForm(keepSeasonTierCourse = true) {
    setCreateForm((prev) => ({
      ...prev,
      name: "",
      startDate: "",
      endDate: "",
      logoUrl: "",
      apiId: "",
      currentRound: "",
      ...(keepSeasonTierCourse
        ? {}
        : { seasonId: "", tierId: "", courseId: "" }),
    }));
    setCreateError(null);
    setCreateSuccess(null);
  }

  function loadTournament(t: TournamentDoc) {
    setForm({
      tournamentId: t._id,
      name: t.name,
      seasonId: t.seasonId,
      tierId: t.tierId,
      courseId: t.courseId,
      startDate: msToDateInput(t.startDate),
      endDate: msToDateInput(t.endDate),
      status: (t.status ?? "") as TournamentFormState["status"],
      logoUrl: t.logoUrl ?? "",
      apiId: t.apiId ?? "",
      livePlay: t.livePlay ?? false,
      currentRound: t.currentRound !== undefined ? `${t.currentRound}` : "",
    });
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.tournamentId) {
      setError("Select a tournament to update.");
      return;
    }

    if (!form.name.trim()) {
      setError("Tournament name is required.");
      return;
    }

    if (!form.seasonId) {
      setError("Season is required.");
      return;
    }

    if (!form.tierId) {
      setError("Tier is required.");
      return;
    }

    if (!form.courseId) {
      setError("Course is required.");
      return;
    }

    if (!form.startDate || !form.endDate) {
      setError("Start and end dates are required.");
      return;
    }

    const startDateMs = dateInputToMs(form.startDate);
    const endDateMs = dateInputToMs(form.endDate, true);

    if (!Number.isFinite(startDateMs) || !Number.isFinite(endDateMs)) {
      setError("Invalid dates.");
      return;
    }

    const currentRound = form.currentRound.trim()
      ? Number(form.currentRound)
      : undefined;

    if (form.currentRound.trim() && !Number.isFinite(currentRound)) {
      setError("Current round must be a number.");
      return;
    }

    setSubmitting(true);
    try {
      await updateTournament({
        clerkId: user?.id ?? "",
        tournamentId: form.tournamentId as Id<"tournaments">,
        data: {
          name: form.name.trim(),
          seasonId: form.seasonId as Id<"seasons">,
          tierId: form.tierId as Id<"tiers">,
          courseId: form.courseId as Id<"courses">,
          startDate: startDateMs,
          endDate: endDateMs,
          ...(form.status ? { status: form.status } : {}),
          ...(form.logoUrl.trim() ? { logoUrl: form.logoUrl.trim() } : {}),
          ...(form.apiId.trim() ? { apiId: form.apiId.trim() } : {}),
          livePlay: form.livePlay,
          ...(currentRound !== undefined ? { currentRound } : {}),
        },
        options: {
          autoUpdateStatus: true,
        },
      });

      setSuccess("Tournament updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!createForm.name.trim()) {
      setCreateError("Tournament name is required.");
      return;
    }
    if (!createForm.seasonId) {
      setCreateError("Season is required.");
      return;
    }
    if (!createForm.tierId) {
      setCreateError("Tier is required.");
      return;
    }
    if (!createForm.courseId) {
      setCreateError("Course is required.");
      return;
    }
    if (!createForm.startDate || !createForm.endDate) {
      setCreateError("Start and end dates are required.");
      return;
    }

    const startDateMs = dateInputToMs(createForm.startDate);
    const endDateMs = dateInputToMs(createForm.endDate, true);

    if (!Number.isFinite(startDateMs) || !Number.isFinite(endDateMs)) {
      setCreateError("Invalid dates.");
      return;
    }

    const currentRound = createForm.currentRound.trim()
      ? Number(createForm.currentRound)
      : undefined;

    if (createForm.currentRound.trim() && !Number.isFinite(currentRound)) {
      setCreateError("Current round must be a number.");
      return;
    }

    setCreating(true);
    try {
      await createTournament({
        clerkId: user?.id ?? "",
        data: {
          name: createForm.name.trim(),
          seasonId: createForm.seasonId as Id<"seasons">,
          tierId: createForm.tierId as Id<"tiers">,
          courseId: createForm.courseId as Id<"courses">,
          startDate: startDateMs,
          endDate: endDateMs,
          ...(createForm.logoUrl.trim()
            ? { logoUrl: createForm.logoUrl.trim() }
            : {}),
          ...(createForm.apiId.trim()
            ? { apiId: createForm.apiId.trim() }
            : {}),
          ...(currentRound !== undefined ? { currentRound } : {}),
        },
        options: {
          autoSetStatus: true,
          returnEnhanced: true,
        },
      });

      setCreateSuccess("Tournament created.");
      resetCreateForm(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create tournament";
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  return {
    isAdmin,
    isRoleLoading,
    vm: {
      seasons,
      tiers,
      courses,
      tournaments,
      selectedSeasonId,
      setSelectedSeasonId,

      form,
      updateField,
      resetForm,
      loadTournament,
      onSubmit,

      createForm,
      updateCreateField,
      createTiers,
      onCreateSubmit,

      submitting,
      error,
      success,

      creating,
      createError,
      createSuccess,
    },
  };
}

/** Admin tournaments loading state placeholder. */
function AdminTournamentsPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
