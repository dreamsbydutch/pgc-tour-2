import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SeasonDoc, TourDoc } from "../../../convex/types/types";
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

export function ToursSection({
  seasons,
  seasonFilter,
}: {
  seasons: SeasonDoc[];
  seasonFilter: Id<"seasons"> | "";
}) {
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

  const isEditing = !!form.tourId;

  function resetForm() {
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
  }

  function loadTour(t: TourDoc) {
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
  }

  async function onDelete(t: TourDoc) {
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
  }

  async function onSubmit(e: React.FormEvent) {
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
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Update Tour" : "Create Tour"}</CardTitle>
          <CardDescription>Buy-in is in cents.</CardDescription>
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

              <Field label="Short form">
                <input
                  value={form.shortForm}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, shortForm: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
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

              <Field label="Logo URL">
                <input
                  value={form.logoUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, logoUrl: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Buy-in (cents)">
                <input
                  inputMode="numeric"
                  value={form.buyInCents}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, buyInCents: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="10000 = $100.00"
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

              <Field label="Playoff spots (comma separated)">
                <input
                  value={form.playoffSpots}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      playoffSpots: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="8, 4, 2"
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
          <CardTitle>Existing Tours</CardTitle>
          <CardDescription>
            {seasonFilter ? "Filtered by season." : "All seasons."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<TourDoc>
            rows={tours}
            emptyMessage="No tours found."
            columns={[
              { id: "name", header: "Name", cell: (t) => t.name },
              { id: "tour", header: "Tour", cell: (t) => t.shortForm },
              {
                id: "season",
                header: "Season",
                cell: (t) => {
                  const s = seasonsById.get(t.seasonId);
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
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (t) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadTour(t)}
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
