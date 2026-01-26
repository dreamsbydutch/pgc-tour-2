import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { SeasonDoc } from "../../../../convex/types/types";
import { AdminEditDeleteActions } from "@/displays";
import { AdminCrudSection } from "./AdminCrudSection";
import { Card, CardContent, CardHeader, Field, Skeleton } from "@/ui";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { dateInputValueToMs, msToDateInputValue } from "@/lib";
import { adminActionsColumn } from "@/lib";

/**
 * Admin UI for creating and updating Seasons.
 *
 * Data sources:
 * - Uses Convex mutations to create/update seasons.
 * - Renders the provided `seasons` list in a table for edit selection.
 *
 * Major render states:
 * - Loading: shows an internal skeleton if the parent has not yet provided seasons.
 * - Ready: shows a season form and a table of existing seasons.
 *
 * @param props.seasons Seasons list from the parent admin view (may be `undefined` while loading).
 * @returns Seasons admin section UI.
 */
export function SeasonsSection({
  seasons,
}: {
  seasons: SeasonDoc[] | undefined;
}) {
  const model = useSeasonsSection({ seasons });

  if (model.status === "loading") return <SeasonsSectionSkeleton />;

  return (
    <AdminCrudSection<SeasonDoc>
      formTitle={model.editingId ? "Update Season" : "Create Season"}
      formDescription="Seasons are the top-level container."
      formFields={
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Year">
            <input
              inputMode="numeric"
              value={model.form.year}
              onChange={(e) => model.updateField("year", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Number">
            <input
              inputMode="numeric"
              value={model.form.number}
              onChange={(e) => model.updateField("number", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Registration deadline (optional)">
            <input
              type="date"
              value={model.form.registrationDeadline}
              onChange={(e) =>
                model.updateField("registrationDeadline", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Start date (optional)">
            <input
              type="date"
              value={model.form.startDate}
              onChange={(e) => model.updateField("startDate", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="End date (optional)">
            <input
              type="date"
              value={model.form.endDate}
              onChange={(e) => model.updateField("endDate", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
        </div>
      }
      formError={model.error}
      formSuccess={model.success}
      submitting={model.submitting}
      primaryActionLabel={
        model.submitting ? "Saving…" : model.editingId ? "Update" : "Create"
      }
      secondaryActionLabel="Reset"
      onSecondaryAction={model.resetForm}
      onSubmit={model.onSubmit}
      tableTitle="Existing Seasons"
      tableDescription="Click “Edit” to load."
      tableRows={model.seasons}
      tableEmptyMessage="No seasons found."
      tableColumns={[
        { id: "year", header: "Year", cell: (s) => s.year },
        { id: "num", header: "#", cell: (s) => s.number },
        adminActionsColumn((s) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadSeason(s)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Manages create/update form state for `SeasonsSection`.
 *
 * @param params.seasons Seasons list from the parent; `undefined` means loading.
 * @returns A view-model consumed by the `SeasonsSection` UI.
 */
function useSeasonsSection({ seasons }: { seasons: SeasonDoc[] | undefined }) {
  type SeasonFormState = {
    year: string;
    number: string;
    startDate: string;
    endDate: string;
    registrationDeadline: string;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        seasons: SeasonDoc[];
        editingId: Id<"seasons"> | null;
        form: SeasonFormState;
        updateField: <K extends keyof SeasonFormState>(
          key: K,
          value: SeasonFormState[K],
        ) => void;
        submitting: boolean;
        error: string | null;
        success: string | null;
        resetForm: () => void;
        loadSeason: (s: SeasonDoc) => void;
        onSubmit: (e: FormEvent) => Promise<void>;
      };

  const createSeason = useMutation(api.functions.seasons.createSeasons);
  const updateSeason = useMutation(api.functions.seasons.updateSeasons);

  const msToDateInput = msToDateInputValue;

  const dateInputToMs = dateInputValueToMs;

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

  const resetForm = () => {
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
  };

  const loadSeason = (s: SeasonDoc) => {
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
  };

  const updateField = <K extends keyof SeasonFormState>(
    key: K,
    value: SeasonFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
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
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save season");
    } finally {
      setSubmitting(false);
    }
  };

  if (!seasons) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    seasons,
    editingId,
    form,
    updateField,
    submitting,
    error,
    success,
    resetForm,
    loadSeason,
    onSubmit,
  } as const satisfies Model;
}

/**
 * Loading UI for `SeasonsSection`.
 */
function SeasonsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
