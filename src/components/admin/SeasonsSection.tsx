import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SeasonDoc } from "../../../convex/types/types";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Field } from "./shared";

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
  name: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
};

export function SeasonsSection({ seasons }: { seasons: SeasonDoc[] }) {
  const createSeason = useMutation(api.functions.seasons.createSeasons);
  const updateSeason = useMutation(api.functions.seasons.updateSeasons);

  const [editingId, setEditingId] = useState<Id<"seasons"> | null>(null);
  const [form, setForm] = useState<SeasonFormState>({
    year: "",
    number: "",
    name: "",
    startDate: "",
    endDate: "",
    registrationDeadline: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setForm({
      year: "",
      number: "",
      name: "",
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
      name: s.name ?? "",
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
            ...(form.name.trim() ? { name: form.name.trim() } : { name: "" }),
            ...(startDateMs !== undefined ? { startDate: startDateMs } : {}),
            ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
            ...(registrationDeadlineMs !== undefined
              ? { registrationDeadline: registrationDeadlineMs }
              : {}),
          },
          options: {
            regenerateName: !form.name.trim(),
          },
        });
        setSuccess("Season updated.");
      } else {
        await createSeason({
          data: {
            year,
            number,
            ...(form.name.trim() ? { name: form.name.trim() } : {}),
            ...(startDateMs !== undefined ? { startDate: startDateMs } : {}),
            ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
            ...(registrationDeadlineMs !== undefined
              ? { registrationDeadline: registrationDeadlineMs }
              : {}),
          },
          options: {
            autoGenerateName: !form.name.trim(),
          },
        });
        setSuccess("Season created.");
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save season");
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
            Seasons are the top-level container.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Year">
                <input
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => updateField("year", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Number">
                <input
                  inputMode="numeric"
                  value={form.number}
                  onChange={(e) => updateField("number", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Name (optional)">
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Registration deadline (optional)">
                <input
                  type="date"
                  value={form.registrationDeadline}
                  onChange={(e) =>
                    updateField("registrationDeadline", e.target.value)
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Start date (optional)">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="End date (optional)">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editingId ? "Update" : "Create"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Seasons</CardTitle>
          <CardDescription>Click “Edit” to load.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<SeasonDoc>
            rows={seasons}
            emptyMessage="No seasons found."
            columns={[
              { id: "year", header: "Year", cell: (s) => s.year },
              { id: "num", header: "#", cell: (s) => s.number },
              { id: "name", header: "Name", cell: (s) => s.name ?? "" },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (s) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadSeason(s)}
                    disabled={submitting}
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
