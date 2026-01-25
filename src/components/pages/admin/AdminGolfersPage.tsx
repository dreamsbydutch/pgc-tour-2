import { useMemo, useState } from "react";
import { api, useAction, useMutation, usePaginatedQuery } from "@/convex";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";
import { useUser } from "@clerk/tanstack-react-start";

import type { Id } from "@/convex";
import type { GolferDoc } from "../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { AdminDataTable, Button, Field } from "@/ui";
import { AdminLoadMore } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Admin page for golfer management.
 *
 * Data sources:
 * - Convex: golfers list + create/update + admin maintenance mutations/actions
 * - Clerk: current user id (passed to admin operations)
 */
export function AdminGolfersPage() {
  const { isModerator, isRoleLoading, member, vm } = useAdminGolfersPage();

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
            AdminGolfersPageSkeleton()
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
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {vm.isEditing ? "Update Golfer" : "Create Golfer"}
                  </CardTitle>
                  <CardDescription>
                    Create or update golfers. Backend requires moderator/admin.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={vm.onSyncFromDataGolf}
                      disabled={vm.syncing}
                    >
                      {vm.syncing ? "Syncing…" : "Sync golfers from DataGolf"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={vm.onNormalizeNames}
                      disabled={vm.normalizing}
                    >
                      {vm.normalizing
                        ? "Normalizing…"
                        : "Normalize 'Last, First' names"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={vm.onDedupeByName}
                      disabled={vm.deduping}
                    >
                      {vm.deduping
                        ? "Deduping…"
                        : "Deduplicate golfers by name"}
                    </Button>
                  </div>

                  <form onSubmit={vm.onSubmit} className="space-y-4">
                    {!vm.isEditing ? (
                      <Field label="API ID">
                        <input
                          value={vm.form.apiId}
                          onChange={(e) =>
                            vm.updateField("apiId", e.target.value)
                          }
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
                        value={vm.form.playerName}
                        onChange={(e) =>
                          vm.updateField("playerName", e.target.value)
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Country (optional)">
                        <input
                          value={vm.form.country}
                          onChange={(e) =>
                            vm.updateField("country", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="World Rank (optional)">
                        <input
                          value={vm.form.worldRank}
                          onChange={(e) =>
                            vm.updateField("worldRank", e.target.value)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>

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
                          : vm.isEditing
                            ? "Update Golfer"
                            : "Create Golfer"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={vm.resetForm}
                        disabled={vm.submitting}
                      >
                        {vm.isEditing ? "Cancel" : "Reset"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Existing Golfers</CardTitle>
                  <CardDescription>
                    Click “Edit” to load into the form.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminDataTable<GolferDoc>
                    rows={vm.golfers}
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
                      {
                        id: "rank",
                        header: "Rank",
                        cell: (g) => g.worldRank ?? "",
                      },
                      {
                        id: "actions",
                        header: "",
                        headClassName: "w-[1%]",
                        cell: (g) => (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => vm.loadGolfer(g)}
                          >
                            Edit
                          </Button>
                        ),
                      },
                    ]}
                  />

                  <div className="pt-4">
                    <AdminLoadMore
                      status={vm.golfersPaginationStatus}
                      onLoadMore={vm.loadMoreGolfers}
                      auto
                    />
                  </div>
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
 * Hook backing the golfers admin page.
 *
 * Owns all list/form state, Convex mutations/actions, and user-provided clerk id.
 */
function useAdminGolfersPage() {
  const { isModerator, member, isLoading: isRoleLoading } = useRoleAccess();
  const { user } = useUser();

  type GolferFormState = {
    golferId: Id<"golfers"> | "";
    apiId: string;
    playerName: string;
    country: string;
    worldRank: string;
  };

  const createGolfer = useMutation(api.functions.golfers.createGolfers);
  const updateGolfer = useMutation(api.functions.golfers.updateGolfers);
  const syncGolfers = useAction(api.functions.golfers.syncGolfersFromDataGolf);
  const normalizeGolferNames = useMutation(
    api.functions.golfers.adminNormalizeGolferNames,
  );
  const dedupeGolfersByName = useMutation(
    api.functions.golfers.adminDedupeGolfersByName,
  );

  const golfersPagination = usePaginatedQuery(
    api.functions.golfers.getGolfersPage,
    {},
    { initialNumItems: 200 },
  );

  const golfers = useMemo(() => {
    return [...golfersPagination.results].sort((a, b) =>
      a.playerName.localeCompare(b.playerName),
    );
  }, [golfersPagination.results]);

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

  return {
    isModerator,
    member,
    isRoleLoading,
    vm: {
      golfers,
      golfersPaginationStatus: golfersPagination.status as
        | "LoadingFirstPage"
        | "CanLoadMore"
        | "LoadingMore"
        | "Exhausted",
      loadMoreGolfers: (pageSize: number) => {
        if (golfersPagination.status !== "CanLoadMore") return;
        golfersPagination.loadMore(pageSize);
      },
      form,
      isEditing,
      updateField,
      resetForm,
      loadGolfer,
      onSyncFromDataGolf,
      onNormalizeNames,
      onDedupeByName,
      onSubmit,
      submitting,
      syncing,
      normalizing,
      deduping,
      error,
      success,
    },
  };
}

/** Admin golfers loading state placeholder. */
function AdminGolfersPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
