import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SeasonDoc } from "../../../convex/types/types";
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

export const Route = createFileRoute("/admin/seasons")({
  component: AdminSeasonsPage,
});

function AdminSeasonsPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();

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
            <SeasonsManager />
          )}
        </SignedIn>
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

type SeasonFormState = {
  year: string;
  number: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
};

function SeasonsManager() {
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Update Season" : "Create Season"}</CardTitle>
          <CardDescription>
            Create or update seasons (current season is based on year).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Year">
              <input
                value={form.year}
                onChange={(e) => updateField("year", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="e.g. 2026"
              />
            </Field>

            <Field label="Season Number">
              <input
                value={form.number}
                onChange={(e) => updateField("number", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="e.g. 1"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date (optional)">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End Date (optional)">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <Field label="Registration Deadline (optional)">
              <input
                type="date"
                value={form.registrationDeadline}
                onChange={(e) =>
                  updateField("registrationDeadline", e.target.value)
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </Field>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving…"
                  : editingId
                    ? "Update Season"
                    : "Create Season"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                {editingId ? "Cancel" : "Reset"}
              </Button>
            </div>

            {editingSeason ? (
              <p className="text-xs text-muted-foreground">
                Editing: {editingSeason.year} #{editingSeason.number}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Seasons</CardTitle>
          <CardDescription>Click “Edit” to load into the form.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<SeasonDoc>
            rows={seasons}
            emptyMessage="No seasons found."
            columns={[
              { id: "year", header: "Year", cell: (s: SeasonDoc) => s.year },
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
                    onClick={() => loadSeason(s)}
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
