import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";
import { useUser } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GolferDoc } from "../../../convex/types/types";
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

export const Route = createFileRoute("/admin/golfers")({
  component: AdminGolfersPage,
});

function AdminGolfersPage() {
  const { isModerator, member, isLoading: isRoleLoading } = useRoleAccess();

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin: Golfers</h1>

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
          ) : !isModerator ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>
                  Moderator or admin access required.
                  {member ? ` (Signed in as ${member.firstname})` : ""}
                  {JSON.stringify(member)}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <GolfersManager />
          )}
        </SignedIn>
      </div>
    </div>
  );
}

type GolferFormState = {
  golferId: Id<"golfers"> | "";
  apiId: string;
  playerName: string;
  country: string;
  worldRank: string;
};

function GolfersManager() {
  const { user } = useUser();
  const createGolfer = useMutation(api.functions.golfers.createGolfers);
  const updateGolfer = useMutation(api.functions.golfers.updateGolfers);
  const syncGolfers = useAction(
    api.functions.golfersSync.syncGolfersFromDataGolf,
  );
  const normalizeGolferNames = useMutation(
    api.functions.golfers.adminNormalizeGolferNames,
  );
  const dedupeGolfersByName = useMutation(
    api.functions.golfers.adminDedupeGolfersByName,
  );

  const golfersResult = useQuery(api.functions.golfers.getGolfers, {
    options: {
      pagination: { limit: 100 },
      sort: { sortBy: "playerName", sortOrder: "asc" },
    },
  });

  const golfers = useMemo(() => {
    const raw = golfersResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<GolferDoc | null>).filter(
          (g): g is GolferDoc => g !== null,
        )
      : [];
    return list;
  }, [golfersResult]);

  const [form, setForm] = useState<GolferFormState>({
    golferId: "",
    apiId: "",
    playerName: "",
    country: "",
    worldRank: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEditing = !!form.golferId;

  function updateField<K extends keyof GolferFormState>(
    key: K,
    value: GolferFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm({
      golferId: "",
      apiId: "",
      playerName: "",
      country: "",
      worldRank: "",
    });
    setError(null);
    setSuccess(null);
  }

  function loadGolfer(g: GolferDoc) {
    setForm({
      golferId: g._id,
      apiId: `${g.apiId}`,
      playerName: g.playerName,
      country: g.country ?? "",
      worldRank: g.worldRank !== undefined ? `${g.worldRank}` : "",
    });
    setError(null);
    setSuccess(null);
  }

  async function onSyncFromDataGolf() {
    setError(null);
    setSuccess(null);

    if (!user) {
      setError("You must be signed in to sync golfers.");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncGolfers({ clerkId: user.id, options: {} });
      const inserted = result?.upserted?.inserted ?? 0;
      const updated = result?.upserted?.updated ?? 0;
      setSuccess(
        `Synced golfers from DataGolf. Inserted ${inserted}, updated ${updated}.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync golfers";
      setError(message);
    } finally {
      setSyncing(false);
    }
  }

  async function onNormalizeNames() {
    setError(null);
    setSuccess(null);

    if (!user) {
      setError("You must be signed in to normalize golfer names.");
      return;
    }

    setNormalizing(true);
    try {
      const result = await normalizeGolferNames({ clerkId: user.id });
      setSuccess(
        `Normalized golfer names. Changed ${result.changed} of ${result.scanned}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to normalize golfer names",
      );
    } finally {
      setNormalizing(false);
    }
  }

  async function onDedupeByName() {
    setError(null);
    setSuccess(null);

    if (!user) {
      setError("You must be signed in to dedupe golfers.");
      return;
    }

    setDeduping(true);
    try {
      const result = await dedupeGolfersByName({ clerkId: user.id });
      setSuccess(
        `Deduped golfers by name. Removed ${result.removed} duplicates across ${result.duplicateGroups} groups. Updated tournament golfers: ${result.updatedTournamentGolfers}. Updated teams: ${result.updatedTeams}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dedupe golfers");
    } finally {
      setDeduping(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.playerName.trim()) {
      setError("Player name is required.");
      return;
    }

    const worldRank = form.worldRank.trim()
      ? Number(form.worldRank)
      : undefined;
    if (form.worldRank.trim() && !Number.isFinite(worldRank)) {
      setError("World rank must be a number.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateGolfer({
          golferId: form.golferId as Id<"golfers">,
          data: {
            playerName: form.playerName.trim(),
            ...(form.country.trim() ? { country: form.country.trim() } : {}),
            ...(worldRank !== undefined ? { worldRank } : {}),
          },
        });
        setSuccess("Golfer updated.");
      } else {
        const apiId = Number(form.apiId);
        if (!Number.isFinite(apiId)) {
          setError("API ID is required and must be a number.");
          return;
        }

        await createGolfer({
          data: {
            apiId,
            playerName: form.playerName.trim(),
            ...(form.country.trim() ? { country: form.country.trim() } : {}),
            ...(worldRank !== undefined ? { worldRank } : {}),
          },
        });
        setSuccess("Golfer created.");
        resetForm();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save golfer";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Update Golfer" : "Create Golfer"}</CardTitle>
          <CardDescription>
            Create or update golfers. Backend requires moderator/admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSyncFromDataGolf}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync golfers from DataGolf"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onNormalizeNames}
              disabled={normalizing}
            >
              {normalizing ? "Normalizing…" : "Normalize 'Last, First' names"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onDedupeByName}
              disabled={deduping}
            >
              {deduping ? "Deduping…" : "Deduplicate golfers by name"}
            </Button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {!isEditing ? (
              <Field label="API ID">
                <input
                  value={form.apiId}
                  onChange={(e) => updateField("apiId", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                  placeholder="e.g. 12345"
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                API ID is immutable.
              </p>
            )}

            <Field label="Player Name">
              <input
                value={form.playerName}
                onChange={(e) => updateField("playerName", e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country (optional)">
                <input
                  value={form.country}
                  onChange={(e) => updateField("country", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="World Rank (optional)">
                <input
                  value={form.worldRank}
                  onChange={(e) => updateField("worldRank", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving…"
                  : isEditing
                    ? "Update Golfer"
                    : "Create Golfer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                {isEditing ? "Cancel" : "Reset"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Golfers</CardTitle>
          <CardDescription>Click “Edit” to load into the form.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<GolferDoc>
            rows={golfers}
            emptyMessage="No golfers found."
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (g) => (
                  <span className="block max-w-[260px] truncate">
                    {g.playerName}
                  </span>
                ),
              },
              { id: "api", header: "API", cell: (g) => g.apiId },
              { id: "rank", header: "Rank", cell: (g) => g.worldRank ?? "" },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (g) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadGolfer(g)}
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
