import { createFileRoute, Link } from "@tanstack/react-router";
import {
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from "@clerk/tanstack-react-start";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function formatDateTime(ms: number | undefined): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

type SortDir = "asc" | "desc";

type SeasonId = Id<"seasons">;
type TourCardId = Id<"tourCards">;

type MemberForAccount = Pick<
  Doc<"members">,
  "_id" | "firstname" | "lastname" | "account"
>;

type SeasonForLabel = Pick<Doc<"seasons">, "_id" | "year" | "number">;

type TournamentHistoryRow = {
  teamId: Id<"teams">;
  tournamentId: Id<"tournaments">;
  tournamentName: string;
  tournamentStartDate: number | undefined;
  tournamentEndDate: number | undefined;
  seasonId: SeasonId;
  tourCardId: TourCardId;
  tourCardDisplayName: string;
  teamName: string | undefined;
  points: number | undefined;
  position: number | undefined;
  earnings: number | undefined;
  updatedAt: number | undefined;
};

function isMemberForAccount(value: unknown): value is MemberForAccount {
  if (!value || typeof value !== "object") return false;
  if (!("_id" in value) || !("account" in value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.account === "number";
}

function isSeasonForLabel(value: unknown): value is SeasonForLabel {
  if (!value || typeof value !== "object") return false;
  if (!("_id" in value) || !("year" in value) || !("number" in value))
    return false;
  const record = value as Record<string, unknown>;
  return typeof record.year === "number" && typeof record.number === "number";
}

function toggleSort<T extends string>(
  current: { key: T; dir: SortDir } | null,
  nextKey: T,
): { key: T; dir: SortDir } {
  if (!current || current.key !== nextKey) return { key: nextKey, dir: "desc" };
  return { key: nextKey, dir: current.dir === "desc" ? "asc" : "desc" };
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function AccountPage() {
  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();

  const member = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const updateMember = useMutation(api.functions.members.updateMembers);

  const memberForAccount = useMemo<MemberForAccount | null>(() => {
    return isMemberForAccount(member) ? member : null;
  }, [member]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!memberForAccount) return;
    setFirstName(memberForAccount.firstname ?? "");
    setLastName(memberForAccount.lastname ?? "");
  }, [memberForAccount]);

  const memberAccountCents = memberForAccount?.account;

  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: {
      sort: { sortBy: "year", sortOrder: "desc" },
      pagination: { limit: 200 },
    },
  });

  const seasonLabelById = useMemo(() => {
    const map = new Map<SeasonId, string>();
    if (!Array.isArray(seasons)) return map;
    for (const s of seasons) {
      if (!isSeasonForLabel(s)) continue;
      map.set(s._id, `${s.year} #${s.number}`);
    }
    return map;
  }, [seasons]);

  const tournamentHistory = useQuery(
    api.functions.members.getMyTournamentHistory,
    clerkUser ? {} : "skip",
  );

  const [tSeasonFilter, setTSeasonFilter] = useState<SeasonId | "all">("all");
  const [tTourCardFilter, setTTourCardFilter] = useState<TourCardId | "all">(
    "all",
  );
  const [tSort, setTSort] = useState<{
    key: "start" | "season" | "tournament" | "points" | "earnings" | "position";
    dir: SortDir;
  } | null>({ key: "start", dir: "desc" });

  async function onSaveProfile() {
    if (!memberForAccount) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await updateMember({
        memberId: memberForAccount._id,
        data: {
          firstname: firstName,
          lastname: lastName,
        },
        options: {
          returnEnhanced: false,
        },
      });
      setSaveSuccess("Saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Account</h1>
            <p className="text-sm text-muted-foreground">
              Update your profile and review your history.
            </p>
          </div>

          <SignedIn>
            <Button
              variant="destructive"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              Log out
            </Button>
          </SignedIn>
        </div>

        <SignedOut>
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => openSignIn()}>Sign In</Button>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={onSaveProfile} disabled={saving || !member}>
                  {saving ? "Saving…" : "Save"}
                </Button>

                {memberAccountCents !== undefined ? (
                  <div className="text-sm text-muted-foreground">
                    Balance:{" "}
                    <span className="font-medium">
                      {formatMoney(memberAccountCents)}
                    </span>
                  </div>
                ) : null}

                {saveError ? (
                  <div className="text-sm text-red-600">{saveError}</div>
                ) : null}
                {saveSuccess ? (
                  <div className="text-sm text-green-700">{saveSuccess}</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Season
                  </div>
                  <select
                    value={tSeasonFilter}
                    onChange={(e) =>
                      setTSeasonFilter(e.target.value as SeasonId | "all")
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="all">All seasons</option>
                    {Array.from(seasonLabelById.entries()).map(
                      ([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Tour card
                  </div>
                  <select
                    value={tTourCardFilter}
                    onChange={(e) =>
                      setTTourCardFilter(e.target.value as TourCardId | "all")
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="all">All tour cards</option>
                    {Array.isArray(tournamentHistory)
                      ? Array.from(
                          new Set(tournamentHistory.map((r) => r.tourCardId)),
                        )
                          .map((id) => {
                            const row = tournamentHistory.find(
                              (r) => r.tourCardId === id,
                            );
                            return {
                              id,
                              label: row?.tourCardDisplayName ?? String(id),
                            };
                          })
                          .sort((a, b) => a.label.localeCompare(b.label))
                          .map((tc) => (
                            <option key={tc.id} value={tc.id}>
                              {tc.label}
                            </option>
                          ))
                      : null}
                  </select>
                </div>
              </div>

              {tournamentHistory === undefined ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : !Array.isArray(tournamentHistory) ||
                tournamentHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No tournament history found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {(() => {
                    const rows = tournamentHistory as TournamentHistoryRow[];
                    const filtered = rows
                      .filter((r) => {
                        if (tSeasonFilter !== "all") {
                          if (r.seasonId !== tSeasonFilter) return false;
                        }
                        if (tTourCardFilter !== "all") {
                          if (r.tourCardId !== tTourCardFilter) return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        if (!tSort) return 0;
                        const dir = tSort.dir === "asc" ? 1 : -1;
                        switch (tSort.key) {
                          case "start":
                            return (
                              dir *
                              cmp(a.tournamentStartDate, b.tournamentStartDate)
                            );
                          case "season": {
                            const aLabel =
                              seasonLabelById.get(a.seasonId) ?? "";
                            const bLabel =
                              seasonLabelById.get(b.seasonId) ?? "";
                            return dir * cmp(aLabel, bLabel);
                          }
                          case "tournament":
                            return (
                              dir * cmp(a.tournamentName, b.tournamentName)
                            );
                          case "points":
                            return dir * cmp(a.points, b.points);
                          case "earnings":
                            return dir * cmp(a.earnings, b.earnings);
                          case "position":
                            return dir * cmp(a.position, b.position);
                        }
                      });

                    const sortIndicator = (key: string) => {
                      if (!tSort || tSort.key !== key) return "";
                      return tSort.dir === "asc" ? " ▲" : " ▼";
                    };

                    return (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) => toggleSort(prev, "start"))
                                }
                              >
                                Start{sortIndicator("start")}
                              </button>
                            </th>
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) => toggleSort(prev, "season"))
                                }
                              >
                                Season{sortIndicator("season")}
                              </button>
                            </th>
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) =>
                                    toggleSort(prev, "tournament"),
                                  )
                                }
                              >
                                Tournament{sortIndicator("tournament")}
                              </button>
                            </th>
                            <th className="py-2 pr-4">Tour card</th>
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) =>
                                    toggleSort(prev, "position"),
                                  )
                                }
                              >
                                Pos{sortIndicator("position")}
                              </button>
                            </th>
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) => toggleSort(prev, "points"))
                                }
                              >
                                Pts{sortIndicator("points")}
                              </button>
                            </th>
                            <th className="py-2 pr-4">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setTSort((prev) =>
                                    toggleSort(prev, "earnings"),
                                  )
                                }
                              >
                                Earnings{sortIndicator("earnings")}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((row) => (
                            <tr
                              key={row.teamId}
                              className="border-b last:border-b-0"
                            >
                              <td className="py-2 pr-4">
                                {formatDateTime(row.tournamentStartDate)}
                              </td>
                              <td className="py-2 pr-4">
                                {seasonLabelById.get(row.seasonId) ?? "—"}
                              </td>
                              <td className="py-2 pr-4 font-medium">
                                <Link
                                  to="/tournament"
                                  search={{
                                    tournamentId: row.tournamentId,
                                    tourId: row.tourCardId,
                                    variant: "regular",
                                  }}
                                  className="hover:underline"
                                >
                                  {row.tournamentName}
                                </Link>
                              </td>
                              <td className="py-2 pr-4">
                                {row.tourCardDisplayName}
                              </td>
                              <td className="py-2 pr-4">
                                {row.position ?? "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {typeof row.points === "number"
                                  ? row.points
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {typeof row.earnings === "number"
                                  ? formatMoney(row.earnings)
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </SignedIn>
      </div>
    </div>
  );
}
