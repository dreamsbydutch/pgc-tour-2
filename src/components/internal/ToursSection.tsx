import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { SeasonDoc, TourDoc } from "../../../convex/types/types";
import { AdminCrudSection } from "@/components/internal/AdminCrudSection";
import { AdminEditDeleteActions } from "../ui/admin-edit-delete-actions";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

import { Field } from "@/components/internal/AdminField";
import {
  formatCentsAsDollars,
  normalizeList,
  parseNumberList,
} from "@/lib/utils";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { adminActionsColumn } from "@/lib/adminTable";

/**
 * Admin UI for creating, editing, and deleting Tours.
 *
 * Data sources:
 * - Uses a Convex query to fetch tours (optionally filtered by the provided season).
 * - Uses Convex mutations to create/update/delete tours.
 *
 * Major render states:
 * - Loading: shows a lightweight internal skeleton until the tours query resolves.
 * - Ready: shows the tour form and the existing tours table.
 *
 * @param props.seasons List of seasons (provided by the parent admin view).
 * @param props.seasonFilter Optional season filter used for the tours query + table label.
 * @returns Tours admin section UI.
 */
export function ToursSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
  const model = useToursSection({ seasons, seasonFilter });

  if (model.status === "loading") return <ToursSectionSkeleton />;

  return (
    <AdminCrudSection<TourDoc>
      formTitle={model.isEditing ? "Update Tour" : "Create Tour"}
      formDescription="Buy-in is in cents."
      formFields={
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Season">
            <select
              value={model.form.seasonId}
              onChange={(e) =>
                model.updateField("seasonId", e.target.value as Id<"seasons">)
              }
              disabled={model.submitting || model.isEditing}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">Select season</option>
              {seasons.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.year} - Season #{s.number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Short form">
            <input
              value={model.form.shortForm}
              onChange={(e) => model.updateField("shortForm", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Name">
            <input
              value={model.form.name}
              onChange={(e) => model.updateField("name", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Logo URL">
            <input
              value={model.form.logoUrl}
              onChange={(e) => model.updateField("logoUrl", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Buy-in (cents)">
            <input
              inputMode="numeric"
              value={model.form.buyInCents}
              onChange={(e) => model.updateField("buyInCents", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="10000 = $100.00"
            />
          </Field>

          <Field label="Max participants (optional)">
            <input
              inputMode="numeric"
              value={model.form.maxParticipants}
              onChange={(e) =>
                model.updateField("maxParticipants", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Playoff spots (comma separated)">
            <input
              value={model.form.playoffSpots}
              onChange={(e) =>
                model.updateField("playoffSpots", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="8, 4, 2"
            />
          </Field>

          <Field label="Description (optional)">
            <input
              value={model.form.description}
              onChange={(e) => model.updateField("description", e.target.value)}
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
        model.submitting ? "Saving…" : model.isEditing ? "Update" : "Create"
      }
      secondaryActionLabel="Reset"
      onSecondaryAction={model.resetForm}
      onSubmit={model.onSubmit}
      tableTitle="Existing Tours"
      tableDescription={seasonFilter ? "Filtered by season." : "All seasons."}
      tableRows={model.tours}
      tableEmptyMessage="No tours found."
      tableColumns={[
        { id: "name", header: "Name", cell: (t) => t.name },
        { id: "tour", header: "Tour", cell: (t) => t.shortForm },
        {
          id: "season",
          header: "Season",
          cell: (t) => {
            const s = model.seasonsById.get(t.seasonId);
            return s ? `${s.year} #${s.number}` : "";
          },
        },
        {
          id: "buyIn",
          header: "Buy-in",
          cell: (t) => formatCentsAsDollars(t.buyIn),
        },
        {
          id: "playoff",
          header: "Playoff spots",
          cell: (t) => (t.playoffSpots ?? []).join(", "),
        },
        adminActionsColumn((t) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadTour(t)}
            onDelete={() => void model.onDelete(t)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Fetches tours and manages form state for `ToursSection`.
 *
 * @param params.seasons Seasons list used for season display lookups.
 * @param params.seasonFilter Optional season filter applied to the tours query.
 * @returns A view-model consumed by the `ToursSection` UI.
 */
function useToursSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
  type TourFormState = {
    tourId: Id<"tours"> | "";
    seasonId: Id<"seasons"> | "";
    name: string;
    shortForm: string;
    logoUrl: string;
    description: string;
    buyInCents: string;
    playoffSpots: string;
    maxParticipants: string;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        tours: TourDoc[];
        seasonsById: Map<string, SeasonDoc>;
        form: TourFormState;
        updateField: <K extends keyof TourFormState>(
          key: K,
          value: TourFormState[K],
        ) => void;
        isEditing: boolean;
        submitting: boolean;
        error: string | null;
        success: string | null;
        resetForm: () => void;
        loadTour: (t: TourDoc) => void;
        onDelete: (t: TourDoc) => Promise<void>;
        onSubmit: (e: FormEvent) => Promise<void>;
      };

  const createTour = useMutation(api.functions.tours.createTours);
  const updateTour = useMutation(api.functions.tours.updateTours);
  const deleteTour = useMutation(api.functions.tours.deleteTours);

  const toursResult = useQuery(api.functions.tours.getTours, {
    options: {
      ...(seasonFilter ? { filter: { seasonId: seasonFilter } } : {}),
      sort: { sortBy: "name", sortOrder: "asc" },
      pagination: { limit: 200, offset: 0 },
    },
  });

  const tours = useMemo(() => {
    return normalizeList<TourDoc, "tours">(toursResult as unknown, "tours");
  }, [toursResult]);

  const seasonsById = useMemo(() => {
    const map = new Map<string, SeasonDoc>();
    for (const s of seasons) map.set(s._id, s);
    return map;
  }, [seasons]);

  const [form, setForm] = useState<TourFormState>({
    tourId: "",
    seasonId: "",
    name: "",
    shortForm: "",
    logoUrl: "",
    description: "",
    buyInCents: "",
    playoffSpots: "",
    maxParticipants: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = <K extends keyof TourFormState>(
    key: K,
    value: TourFormState[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const isEditing = Boolean(form.tourId);

  const resetForm = () => {
    setForm({
      tourId: "",
      seasonId: "",
      name: "",
      shortForm: "",
      logoUrl: "",
      description: "",
      buyInCents: "",
      playoffSpots: "",
      maxParticipants: "",
    });
    setError(null);
    setSuccess(null);
  };

  const loadTour = (t: TourDoc) => {
    const description = (t as unknown as { description?: string }).description;
    setForm({
      tourId: t._id,
      seasonId: t.seasonId,
      name: t.name,
      shortForm: t.shortForm,
      logoUrl: t.logoUrl,
      description: description ?? "",
      buyInCents: `${t.buyIn}`,
      playoffSpots: (t.playoffSpots ?? []).join(", "),
      maxParticipants: `${t.maxParticipants ?? ""}`,
    });
    setError(null);
    setSuccess(null);
  };

  const onDelete = async (t: TourDoc) => {
    setError(null);
    setSuccess(null);

    const ok = window.confirm(
      `Delete tour “${t.name}”? This may also delete tour cards (participants).`,
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      await deleteTour({ tourId: t._id, options: { cascadeDelete: true } });
      setSuccess("Tour deleted.");
      if (form.tourId === t._id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tour");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const name = form.name.trim();
    const shortForm = form.shortForm.trim();
    const logoUrl = form.logoUrl.trim();

    if (!form.seasonId) {
      setError("Season is required.");
      return;
    }
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!shortForm) {
      setError("Short form is required.");
      return;
    }
    if (!logoUrl) {
      setError("Logo URL is required.");
      return;
    }

    const buyInRaw = Number(form.buyInCents);
    const buyIn = Math.trunc(buyInRaw);
    if (!Number.isFinite(buyInRaw) || buyIn < 0) {
      setError("Buy-in must be a non-negative number of cents.");
      return;
    }

    let playoffSpots: number[];
    try {
      playoffSpots = parseNumberList(form.playoffSpots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid playoff spots");
      return;
    }

    if (playoffSpots.length === 0 || playoffSpots.some((n) => n < 1)) {
      setError("Playoff spots must be comma-separated positive numbers.");
      return;
    }

    const maxParticipantsRaw = form.maxParticipants.trim();
    const maxParticipants = maxParticipantsRaw
      ? Math.trunc(Number(maxParticipantsRaw))
      : undefined;
    if (
      maxParticipantsRaw &&
      (!Number.isFinite(Number(maxParticipantsRaw)) ||
        (maxParticipants ?? 0) < 1)
    ) {
      setError("Max participants must be a positive whole number.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateTour({
          tourId: form.tourId as Id<"tours">,
          data: {
            name,
            shortForm,
            logoUrl,
            buyIn,
            playoffSpots,
            ...(maxParticipants !== undefined ? { maxParticipants } : {}),
            ...(form.description.trim()
              ? { description: form.description.trim() }
              : { description: "" }),
          },
        });
        setSuccess("Tour updated.");
      } else {
        await createTour({
          data: {
            name,
            shortForm,
            logoUrl,
            seasonId: form.seasonId as Id<"seasons">,
            buyIn,
            playoffSpots,
            ...(maxParticipants !== undefined ? { maxParticipants } : {}),
            ...(form.description.trim()
              ? { description: form.description.trim() }
              : {}),
          },
        });
        setSuccess("Tour created.");
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tour");
    } finally {
      setSubmitting(false);
    }
  };

  if (toursResult === undefined) return { status: "loading" } as const;

  return {
    status: "ready",
    tours,
    seasonsById,
    form,
    updateField,
    isEditing,
    submitting,
    error,
    success,
    resetForm,
    loadTour,
    onDelete,
    onSubmit,
  } as const satisfies Model;
}

/**
 * Loading UI for `ToursSection`.
 */
function ToursSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
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
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-44" />
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
