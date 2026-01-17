import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SeasonDoc, TierDoc } from "../../../convex/types/types";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Field,
  formatCentsAsDollars,
  normalizeList,
  parseNumberList,
} from "./shared";

type TierFormState = {
  tierId: Id<"tiers"> | "";
  seasonId: Id<"seasons"> | "";
  name: string;
  payoutsCents: string;
  points: string;
  minParticipants: string;
  maxParticipants: string;
  description: string;
};

export function TiersSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
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
    minParticipants: "",
    maxParticipants: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEditing = !!form.tierId;

  function resetForm() {
    setForm({
      tierId: "",
      seasonId: "",
      name: "",
      payoutsCents: "",
      points: "",
      minParticipants: "",
      maxParticipants: "",
      description: "",
    });
    setError(null);
    setSuccess(null);
  }

  function loadTier(t: TierDoc) {
    const description = (t as unknown as { description?: string }).description;
    setForm({
      tierId: t._id,
      seasonId: t.seasonId,
      name: t.name,
      payoutsCents: (t.payouts ?? []).join(", "),
      points: (t.points ?? []).join(", "),
      minParticipants: `${t.minimumParticipants ?? ""}`,
      maxParticipants: `${t.maximumParticipants ?? ""}`,
      description: description ?? "",
    });
    setError(null);
    setSuccess(null);
  }

  async function onDelete(t: TierDoc) {
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
  }

  async function onSubmit(e: React.FormEvent) {
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

    const minRaw = form.minParticipants.trim();
    const maxRaw = form.maxParticipants.trim();
    const min = minRaw ? Math.trunc(Number(minRaw)) : undefined;
    const max = maxRaw ? Math.trunc(Number(maxRaw)) : undefined;

    if (minRaw && (!Number.isFinite(Number(minRaw)) || (min ?? 0) < 1)) {
      setError("Minimum participants must be >= 1.");
      return;
    }

    if (maxRaw && (!Number.isFinite(Number(maxRaw)) || (max ?? 0) < 1)) {
      setError("Maximum participants must be >= 1.");
      return;
    }

    if (min !== undefined && max !== undefined && min > max) {
      setError("Minimum participants cannot exceed maximum participants.");
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
            ...(min !== undefined ? { minimumParticipants: min } : {}),
            ...(max !== undefined ? { maximumParticipants: max } : {}),
            ...(form.description.trim()
              ? { description: form.description.trim() }
              : { description: "" }),
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
            ...(min !== undefined ? { minimumParticipants: min } : {}),
            ...(max !== undefined ? { maximumParticipants: max } : {}),
            ...(form.description.trim()
              ? { description: form.description.trim() }
              : {}),
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
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Update Tier" : "Create Tier"}</CardTitle>
          <CardDescription>
            Payouts are cents; points are integers. Use comma-separated lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Season">
                <select
                  value={form.seasonId}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      seasonId: e.target.value as Id<"seasons">,
                    }))
                  }
                  disabled={submitting || isEditing}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select season</option>
                  {seasons.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.year} #{s.number} — {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Payouts (cents, comma separated)">
                <input
                  value={form.payoutsCents}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      payoutsCents: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="50000, 25000, 10000"
                />
              </Field>

              <Field label="Points (comma separated)">
                <input
                  value={form.points}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, points: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="500, 300, 250"
                />
              </Field>

              <Field label="Min participants (optional)">
                <input
                  inputMode="numeric"
                  value={form.minParticipants}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      minParticipants: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Max participants (optional)">
                <input
                  inputMode="numeric"
                  value={form.maxParticipants}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      maxParticipants: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Description (optional)">
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
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
                {submitting ? "Saving…" : isEditing ? "Update" : "Create"}
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
          <CardTitle>Existing Tiers</CardTitle>
          <CardDescription>
            {seasonFilter ? "Filtered by season." : "All seasons."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<TierDoc>
            rows={tiers}
            emptyMessage="No tiers found."
            columns={[
              { id: "name", header: "Name", cell: (t) => t.name },
              {
                id: "season",
                header: "Season",
                cell: (t) => {
                  const s = seasonsById.get(t.seasonId);
                  return s ? `${s.year} #${s.number}` : "";
                },
              },
              {
                id: "payouts",
                header: "Payouts",
                cell: (t) =>
                  `${t.payouts.length} (top: ${formatCentsAsDollars(
                    t.payouts[0] ?? 0,
                  )})`,
              },
              {
                id: "points",
                header: "Points",
                cell: (t) => `${t.points.length} (top: ${t.points[0] ?? 0})`,
              },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (t) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadTier(t)}
                      disabled={submitting}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void onDelete(t)}
                      disabled={submitting}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
