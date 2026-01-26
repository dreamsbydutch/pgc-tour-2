import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { SeasonDoc, TierDoc } from "../../../../convex/types/types";
import { AdminEditDeleteActions } from "@/displays";
import { AdminCrudSection } from "./AdminCrudSection";
import { Card, CardContent, CardHeader, Field, Skeleton } from "@/ui";
import {
  formatCentsAsDollars,
  normalizeList,
  parseNumberList,
} from "@/lib/utils";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { adminActionsColumn } from "@/lib/adminTable";

/**
 * Admin UI for creating, editing, and deleting Tiers.
 *
 * Data sources:
 * - Uses a Convex query to fetch tiers (optionally filtered by the provided season).
 * - Uses Convex mutations to create/update/delete tiers.
 *
 * Major render states:
 * - Loading: shows a lightweight internal skeleton until the tiers query resolves.
 * - Ready: shows the tier form and the existing tiers table.
 *
 * @param props.seasons List of seasons (provided by the parent admin view).
 * @param props.seasonFilter Optional season filter used for the tiers query + table label.
 * @returns Tiers admin section UI.
 */
export function TiersSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
  const model = useTiersSection({ seasons, seasonFilter });

  if (model.status === "loading") return <TiersSectionSkeleton />;

  return (
    <AdminCrudSection<TierDoc>
      formTitle={model.isEditing ? "Update Tier" : "Create Tier"}
      formDescription={
        "Payouts are cents; points are integers. Use comma-separated lists."
      }
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

          <Field label="Name">
            <input
              value={model.form.name}
              onChange={(e) => model.updateField("name", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Payouts (cents, comma separated)">
            <input
              value={model.form.payoutsCents}
              onChange={(e) =>
                model.updateField("payoutsCents", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="50000, 25000, 10000"
            />
          </Field>

          <Field label="Points (comma separated)">
            <input
              value={model.form.points}
              onChange={(e) => model.updateField("points", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="500, 300, 250"
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
      tableTitle="Existing Tiers"
      tableDescription={seasonFilter ? "Filtered by season." : "All seasons."}
      tableRows={model.tiers}
      tableEmptyMessage="No tiers found."
      tableColumns={[
        { id: "name", header: "Name", cell: (t) => t.name },
        {
          id: "season",
          header: "Season",
          cell: (t) => {
            const s = model.seasonsById.get(t.seasonId);
            return s ? `${s.year} #${s.number}` : "";
          },
        },
        {
          id: "payouts",
          header: "Payouts",
          cell: (t) =>
            `${t.payouts.length} (top: ${formatCentsAsDollars(t.payouts[0] ?? 0)})`,
        },
        {
          id: "points",
          header: "Points",
          cell: (t) => `${t.points.length} (top: ${t.points[0] ?? 0})`,
        },
        adminActionsColumn((t) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadTier(t)}
            onDelete={() => void model.onDelete(t)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Fetches tiers and manages form state for `TiersSection`.
 *
 * @param params.seasons Seasons list used for season display lookups.
 * @param params.seasonFilter Optional season filter applied to the tiers query.
 * @returns A view-model consumed by the `TiersSection` UI.
 */
function useTiersSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
  type TierFormState = {
    tierId: Id<"tiers"> | "";
    seasonId: Id<"seasons"> | "";
    name: string;
    payoutsCents: string;
    points: string;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        tiers: TierDoc[];
        seasonsById: Map<string, SeasonDoc>;
        form: TierFormState;
        updateField: <K extends keyof TierFormState>(
          key: K,
          value: TierFormState[K],
        ) => void;
        isEditing: boolean;
        submitting: boolean;
        error: string | null;
        success: string | null;
        resetForm: () => void;
        loadTier: (t: TierDoc) => void;
        onDelete: (t: TierDoc) => Promise<void>;
        onSubmit: (e: FormEvent) => Promise<void>;
      };

  const createTier = useMutation(api.functions.tiers.createTiers);
  const updateTier = useMutation(api.functions.tiers.updateTiers);
  const deleteTier = useMutation(api.functions.tiers.deleteTiers);

  const tiersResult = useQuery(api.functions.tiers.getTiers, {
    options: {
      ...(seasonFilter ? { filter: { seasonId: seasonFilter } } : {}),
      sort: { sortBy: "name", sortOrder: "asc" },
      pagination: { limit: 200, offset: 0 },
    },
  });

  const tiers = useMemo(() => {
    return normalizeList<TierDoc, "tiers">(tiersResult as unknown, "tiers");
  }, [tiersResult]);

  const seasonsById = useMemo(() => {
    const map = new Map<string, SeasonDoc>();
    for (const s of seasons) map.set(s._id, s);
    return map;
  }, [seasons]);

  const [form, setForm] = useState<TierFormState>({
    tierId: "",
    seasonId: "",
    name: "",
    payoutsCents: "",
    points: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = <K extends keyof TierFormState>(
    key: K,
    value: TierFormState[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const isEditing = Boolean(form.tierId);

  const resetForm = () => {
    setForm({
      tierId: "",
      seasonId: "",
      name: "",
      payoutsCents: "",
      points: "",
    });
    setError(null);
    setSuccess(null);
  };

  const loadTier = (t: TierDoc) => {
    setForm({
      tierId: t._id,
      seasonId: t.seasonId,
      name: t.name,
      payoutsCents: (t.payouts ?? []).join(", "),
      points: (t.points ?? []).join(", "),
    });
    setError(null);
    setSuccess(null);
  };

  const onDelete = async (t: TierDoc) => {
    setError(null);
    setSuccess(null);

    const ok = window.confirm(
      `Delete tier “${t.name}”? This may affect tournaments using it.`,
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      await deleteTier({ tierId: t._id, options: { softDelete: false } });
      setSuccess("Tier deleted.");
      if (form.tierId === t._id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tier");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.seasonId) {
      setError("Season is required.");
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    let payouts: number[];
    let points: number[];
    try {
      payouts = parseNumberList(form.payoutsCents);
      points = parseNumberList(form.points);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid list values");
      return;
    }

    if (payouts.length === 0) {
      setError("At least one payout (cents) is required.");
      return;
    }

    if (points.length === 0) {
      setError("At least one points value is required.");
      return;
    }

    if (payouts.length !== points.length) {
      setError("Payouts and points must have the same length.");
      return;
    }

    if (payouts.some((n) => n < 0) || points.some((n) => n < 0)) {
      setError("Payouts and points must be non-negative.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateTier({
          tierId: form.tierId as Id<"tiers">,
          data: {
            name,
            payouts,
            points,
          },
        });
        setSuccess("Tier updated.");
      } else {
        await createTier({
          data: {
            name,
            seasonId: form.seasonId as Id<"seasons">,
            payouts,
            points,
          },
        });
        setSuccess("Tier created.");
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tier");
    } finally {
      setSubmitting(false);
    }
  };

  if (tiersResult === undefined) return { status: "loading" } as const;

  return {
    status: "ready",
    tiers,
    seasonsById,
    form,
    updateField,
    isEditing,
    submitting,
    error,
    success,
    resetForm,
    loadTier,
    onDelete,
    onSubmit,
  } as const satisfies Model;
}

/**
 * Loading UI for `TiersSection`.
 */
function TiersSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
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
