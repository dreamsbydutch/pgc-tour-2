import { useMemo, useState } from "react";
import { api, useMutation, useQuery } from "@/convex";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import type { Id } from "@/convex";
import type { SeasonDoc } from "../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { AdminDataTable } from "@/components/internal/AdminDataTable";
import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Admin page for creating and updating seasons.
 *
 * Data sources:
 * - Convex: seasons list + create/update mutations
 */
export function AdminSeasonsPage() {
  const { isAdmin, isRoleLoading, vm } = useAdminSeasonsPage();
  const Skeleton = AdminSeasonsPageSkeleton;
  const roleLoadingNode = isRoleLoading ? Skeleton() : null;

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

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin: Seasons</h1>

        <SignedOut>
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
        </SignedOut>

        <SignedIn>
          {isRoleLoading ? (
            roleLoadingNode
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
                  <CardTitle>
                    {vm.editingId ? "Update Season" : "Create Season"}
                  </CardTitle>
                  <CardDescription>
                    Create or update seasons (current season is based on year).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={vm.onSubmit} className="space-y-4">
                    <Field label="Year">
                      <input
                        value={vm.form.year}
                        onChange={(e) => vm.updateField("year", e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        inputMode="numeric"
                        placeholder="e.g. 2026"
                      />
                    </Field>

                    <Field label="Season Number">
                      <input
                        value={vm.form.number}
                        onChange={(e) =>
                          vm.updateField("number", e.target.value)
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        inputMode="numeric"
                        placeholder="e.g. 1"
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Start Date (optional)">
                        <input
                          type="date"
                          value={vm.form.startDate}
                          onChange={(e) =>
                            vm.updateField("startDate", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="End Date (optional)">
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

                    <Field label="Registration Deadline (optional)">
                      <input
                        type="date"
                        value={vm.form.registrationDeadline}
                        onChange={(e) =>
                          vm.updateField("registrationDeadline", e.target.value)
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </Field>

                    {vm.error ? (
                      <p className="text-sm text-red-600">{vm.error}</p>
                    ) : null}
                    {vm.success ? (
                      <p className="text-sm text-green-700">{vm.success}</p>
                    ) : null}

                    <div className="flex gap-2">
                      <Button type="submit" disabled={vm.submitting}>
                        {vm.submitting
                          ? "Saving…"
                          : vm.editingId
                            ? "Update Season"
                            : "Create Season"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={vm.resetForm}
                        disabled={vm.submitting}
                      >
                        {vm.editingId ? "Cancel" : "Reset"}
                      </Button>
                    </div>

                    {vm.editingSeason ? (
                      <p className="text-xs text-muted-foreground">
                        Editing: {vm.editingSeason.year} #
                        {vm.editingSeason.number}
                      </p>
                    ) : null}
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Existing Seasons</CardTitle>
                  <CardDescription>
                    Click “Edit” to load into the form.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminDataTable<SeasonDoc>
                    rows={vm.seasons}
                    emptyMessage="No seasons found."
                    columns={[
                      {
                        id: "year",
                        header: "Year",
                        cell: (s: SeasonDoc) => s.year,
                      },
                      {
                        id: "number",
                        header: "#",
                        cell: (s: SeasonDoc) => s.number,
                      },
                      {
                        id: "actions",
                        header: "",
                        headClassName: "w-[1%]",
                        cell: (s: SeasonDoc) => (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => vm.loadSeason(s)}
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
        </SignedIn>
      </div>
    </div>
  );
}

/**
 * Hook backing the seasons admin page.
 *
 * Owns all form state, list data, and create/update mutations.
 */
function useAdminSeasonsPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();

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

  type SeasonFormState = {
    year: string;
    number: string;
    startDate: string;
    endDate: string;
    registrationDeadline: string;
  };

  const createSeason = useMutation(api.functions.seasons.createSeasons);
  const updateSeason = useMutation(api.functions.seasons.updateSeasons);

  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    const raw = seasonsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<SeasonDoc | null>).filter(
          (s): s is SeasonDoc => s !== null,
        )
      : [];

    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const [editingId, setEditingId] = useState<Id<"seasons"> | null>(null);
  const [form, setForm] = useState<SeasonFormState>({
    year: "",
    number: "",
    startDate: "",
    endDate: "",
    registrationDeadline: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const editingSeason = useMemo(() => {
    if (!editingId) return null;
    return seasons.find((s) => s._id === editingId) || null;
  }, [editingId, seasons]);

  function resetForm() {
    setEditingId(null);
    setForm({
      year: "",
      number: "",
      startDate: "",
      endDate: "",
      registrationDeadline: "",
    });
    setError(null);
    setSuccess(null);
  }

  function loadSeason(s: SeasonDoc) {
    setEditingId(s._id);
    setForm({
      year: `${s.year}`,
      number: `${s.number}`,
      startDate: msToDateInput(s.startDate),
      endDate: msToDateInput(s.endDate),
      registrationDeadline: msToDateInput(s.registrationDeadline),
    });
    setError(null);
    setSuccess(null);
  }

  function updateField<K extends keyof SeasonFormState>(
    key: K,
    value: SeasonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const year = Number(form.year);
    const number = Number(form.number);

    if (!Number.isFinite(year) || year < 2000) {
      setError("Year is required.");
      return;
    }

    if (!Number.isFinite(number) || number < 1) {
      setError("Season number is required.");
      return;
    }

    const startDateMs = form.startDate
      ? dateInputToMs(form.startDate)
      : undefined;
    const endDateMs = form.endDate
      ? dateInputToMs(form.endDate, true)
      : undefined;
    const registrationDeadlineMs = form.registrationDeadline
      ? dateInputToMs(form.registrationDeadline, true)
      : undefined;

    setSubmitting(true);
    try {
      if (editingId) {
        await updateSeason({
          seasonId: editingId,
          data: {
            year,
            number,
            ...(startDateMs !== undefined ? { startDate: startDateMs } : {}),
            ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
            ...(registrationDeadlineMs !== undefined
              ? { registrationDeadline: registrationDeadlineMs }
              : {}),
          },
        });
        setSuccess("Season updated.");
      } else {
        await createSeason({
          data: {
            year,
            number,
            ...(startDateMs !== undefined ? { startDate: startDateMs } : {}),
            ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
            ...(registrationDeadlineMs !== undefined
              ? { registrationDeadline: registrationDeadlineMs }
              : {}),
          },
        });
        setSuccess("Season created.");
        setForm((prev) => ({
          ...prev,
          startDate: "",
          endDate: "",
          registrationDeadline: "",
        }));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save season";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    isAdmin,
    isRoleLoading,
    vm: {
      seasons,
      editingId,
      editingSeason,
      form,
      updateField,
      resetForm,
      loadSeason,
      onSubmit,
      submitting,
      error,
      success,
    },
  };
}

/** Admin seasons loading state placeholder. */
function AdminSeasonsPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
