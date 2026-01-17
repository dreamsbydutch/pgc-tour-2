import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { SignInButton, useUser } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CourseDoc,
  SeasonDoc,
  TierDoc,
  TournamentDoc,
} from "../../../convex/types/types";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { AdminDataTable } from "@/components/admin/AdminDataTable";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/admin/tournaments")({
  component: AdminTournamentsManagePage,
});

function AdminTournamentsManagePage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();

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
            <TournamentsManager />
          )}
        </Authenticated>
      </div>
    </div>
  );
}

function msToDateInput(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToMs(date: string, endOfDay = false): number {
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  return new Date(`${date}${suffix}`).getTime();
}

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

function TournamentsManager() {
  const { user } = useUser();

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Tournament</CardTitle>
          <CardDescription>
            Creates a tournament in Convex. You must be an admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateSubmit} className="space-y-4">
            <Field label="Tournament Name">
              <input
                value={createForm.name}
                onChange={(e) => updateCreateField("name", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. The Masters"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Season">
                <select
                  value={createForm.seasonId}
                  onChange={(e) => {
                    const nextSeasonId = e.target.value as Id<"seasons"> | "";
                    updateCreateField("seasonId", nextSeasonId);
                    updateCreateField("tierId", "");
                  }}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select season</option>
                  {seasons.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.year} #{s.number}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tier">
                <select
                  value={createForm.tierId}
                  onChange={(e) =>
                    updateCreateField(
                      "tierId",
                      e.target.value as Id<"tiers"> | "",
                    )
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select tier</option>
                  {createTiers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Course">
              <select
                value={createForm.courseId}
                onChange={(e) =>
                  updateCreateField(
                    "courseId",
                    e.target.value as Id<"courses"> | "",
                  )
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select course</option>
                {courses.map((c) => (
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
                  value={createForm.startDate}
                  onChange={(e) =>
                    updateCreateField("startDate", e.target.value)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  value={createForm.endDate}
                  onChange={(e) => updateCreateField("endDate", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <Field label="Logo URL (optional)">
              <input
                value={createForm.logoUrl}
                onChange={(e) => updateCreateField("logoUrl", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="API ID (optional)">
                <input
                  value={createForm.apiId}
                  onChange={(e) => updateCreateField("apiId", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Current Round (optional)">
                <input
                  value={createForm.currentRound}
                  onChange={(e) =>
                    updateCreateField("currentRound", e.target.value)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </Field>
            </div>

            {createError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {createError}
              </div>
            ) : null}

            {createSuccess ? (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                {createSuccess}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create Tournament"}
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
                value={selectedSeasonId}
                onChange={(e) =>
                  setSelectedSeasonId(e.target.value as Id<"seasons"> | "")
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

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Tournament Name">
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Season">
                <select
                  value={form.seasonId}
                  onChange={(e) =>
                    updateField("seasonId", e.target.value as Id<"seasons">)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select season</option>
                  {seasons.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.year} #{s.number}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tier">
                <select
                  value={form.tierId}
                  onChange={(e) =>
                    updateField("tierId", e.target.value as Id<"tiers">)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select tier</option>
                  {tiers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Course">
                <select
                  value={form.courseId}
                  onChange={(e) =>
                    updateField("courseId", e.target.value as Id<"courses">)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status (optional)">
                <select
                  value={form.status}
                  onChange={(e) =>
                    updateField(
                      "status",
                      e.target.value as TournamentFormState["status"],
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
                  value={form.logoUrl}
                  onChange={(e) => updateField("logoUrl", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="API ID (optional)">
                <input
                  value={form.apiId}
                  onChange={(e) => updateField("apiId", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current Round (optional)">
                <input
                  value={form.currentRound}
                  onChange={(e) => updateField("currentRound", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </Field>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Live Play</span>
                <input
                  type="checkbox"
                  checked={form.livePlay}
                  onChange={(e) => updateField("livePlay", e.target.checked)}
                />
              </label>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Update Tournament"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
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
          <CardDescription>Click “Edit” to load into the form.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<TournamentDoc>
            rows={tournaments}
            emptyMessage="No tournaments found."
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (t) => (
                  <span className="block max-w-[260px] truncate">{t.name}</span>
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
                    onClick={() => loadTournament(t)}
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
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
