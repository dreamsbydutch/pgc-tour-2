import { v } from "convex/values";

import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

function formatMemberName(member: Doc<"members">): string | undefined {
  const first = (member.firstname ?? "").trim();
  const last = (member.lastname ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : undefined;
}

function formatScoreToPar(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function calculateScoreForSorting(
  position: string | null | undefined,
  score: number | null | undefined,
): number {
  if (position === "DQ") return 999 + (score ?? 999);
  if (position === "WD") return 888 + (score ?? 999);
  if (position === "CUT") return 444 + (score ?? 999);
  return score ?? 999;
}

type LeaderboardTopRow = {
  tourCardId: Id<"tourCards">;
  position: string;
  displayName: string;
  tourShortForm: string;
  scoreText: string;
  isChampion: boolean;
};

function escapeEmailText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNameListWithAnd(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

async function getLeaderboardRowsForTournament(args: {
  ctx: QueryCtx;
  tournamentId: Id<"tournaments">;
}): Promise<LeaderboardTopRow[]> {
  const teams = await args.ctx.db
    .query("teams")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", args.tournamentId))
    .collect();

  if (teams.length === 0) return [];

  const championTourCardIdSet = new Set(
    teams
      .filter((t) => t.position === "1" || t.position === "T1")
      .map((t) => t.tourCardId),
  );

  const tourCardIds = Array.from(new Set(teams.map((t) => t.tourCardId)));
  const tourCards = await Promise.all(
    tourCardIds.map((id) => args.ctx.db.get(id)),
  );
  const tourCardById = new Map(
    tourCards.filter(Boolean).map((tc) => [tc!._id, tc!]),
  );

  const tourIds = Array.from(
    new Set(tourCards.filter(Boolean).map((tc) => tc!.tourId)),
  );
  const tours = await Promise.all(tourIds.map((id) => args.ctx.db.get(id)));
  const tourShortById = new Map(
    tours.filter(Boolean).map((t) => [t!._id, t!.shortForm] as const),
  );

  const sortable = teams
    .map((team) => {
      const tc = tourCardById.get(team.tourCardId);
      if (!tc) return null;

      const position = team.position ?? "";
      const scoreValue = team.score ?? null;

      return {
        tourCardId: team.tourCardId,
        position: position || "—",
        displayName: tc.displayName,
        tourShortForm: tourShortById.get(tc.tourId) ?? "",
        scoreText: formatScoreToPar(scoreValue ?? undefined),
        scoreForSorting: calculateScoreForSorting(position, scoreValue),
        thru: team.thru ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  sortable.sort((a, b) => {
    if (a.scoreForSorting !== b.scoreForSorting)
      return a.scoreForSorting - b.scoreForSorting;
    if (a.thru !== b.thru) return a.thru - b.thru;
    return a.displayName.localeCompare(b.displayName);
  });

  return sortable.map((r) => ({
    tourCardId: r.tourCardId,
    position: escapeEmailText(r.position),
    displayName: escapeEmailText(r.displayName),
    tourShortForm: escapeEmailText(r.tourShortForm),
    scoreText: escapeEmailText(r.scoreText),
    isChampion: championTourCardIdSet.has(r.tourCardId),
  }));
}

async function getPreviousCompletedTournamentName(args: {
  ctx: QueryCtx;
  tournament: Doc<"tournaments">;
}): Promise<string> {
  const now = Date.now();
  const tournaments = await args.ctx.db
    .query("tournaments")
    .withIndex("by_season", (q) => q.eq("seasonId", args.tournament.seasonId))
    .collect();

  const previous = tournaments
    .filter(
      (t) =>
        t.startDate < args.tournament.startDate &&
        (t.status === "completed" || t.endDate <= now),
    )
    .sort((a, b) => b.startDate - a.startDate)[0];

  return previous?.name ?? "";
}

async function getChampionsStringForTournamentId(args: {
  ctx: QueryCtx;
  tournamentId: Id<"tournaments">;
}): Promise<string> {
  const [pos1, posT1] = await Promise.all([
    args.ctx.db
      .query("teams")
      .withIndex("by_tournament_position", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("position", "1"),
      )
      .collect(),
    args.ctx.db
      .query("teams")
      .withIndex("by_tournament_position", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("position", "T1"),
      )
      .collect(),
  ]);

  const winners = [...pos1, ...posT1];
  if (winners.length === 0) return "";

  const tourCardIds = Array.from(new Set(winners.map((t) => t.tourCardId)));
  const tourCards = await Promise.all(
    tourCardIds.map((id) => args.ctx.db.get(id)),
  );

  const tourIdSet = new Set(
    tourCards.filter(Boolean).map((tc) => (tc as Doc<"tourCards">).tourId),
  );
  const tours = await Promise.all(
    [...tourIdSet].map((tourId) => args.ctx.db.get(tourId)),
  );
  const shortFormByTourId = new Map(
    tours
      .filter(Boolean)
      .map(
        (t) =>
          [(t as Doc<"tours">)._id, (t as Doc<"tours">).shortForm] as const,
      ),
  );

  const tourCardById = new Map(
    tourCards
      .filter(Boolean)
      .map(
        (tc) => [(tc as Doc<"tourCards">)._id, tc as Doc<"tourCards">] as const,
      ),
  );

  const entries = winners
    .map((team) => {
      const tc = tourCardById.get(team.tourCardId);
      if (!tc) return null;
      const tourShort = shortFormByTourId.get(tc.tourId) ?? "";
      const scoreToPar = formatScoreToPar(team.score);
      const scorePart = scoreToPar ? ` (${scoreToPar})` : "";
      return {
        tourShort,
        displayName: tc.displayName,
        text: `${tc.displayName}${scorePart}`,
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .sort((a, b) => {
      if (a.tourShort !== b.tourShort)
        return a.tourShort.localeCompare(b.tourShort);
      return a.displayName.localeCompare(b.displayName);
    });

  return formatNameListWithAnd(entries.map((e) => e.text));
}

async function getUpcomingTournament(
  ctx: QueryCtx,
): Promise<Doc<"tournaments"> | null> {
  const now = Date.now();
  const upcoming = await ctx.db
    .query("tournaments")
    .withIndex("by_status", (q) => q.eq("status", "upcoming"))
    .collect();

  const future = upcoming.filter((t) => t.startDate > now);
  future.sort((a, b) => a.startDate - b.startDate);
  return future[0] ?? null;
}

/**
 * Lists unique email recipients for the tournament based on “active” tour cards.
 * In this schema, “active tour card” is interpreted as a tour card in the tournament’s season.
 */
export const getActiveTourCardRecipientsForTournament = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const season = await ctx.db.get(tournament.seasonId);
    const seasonYear = season?.year ?? new Date(Date.now()).getFullYear();

    const now = Date.now();
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const previous = tournaments
      .filter(
        (t) =>
          t.startDate < tournament.startDate &&
          (t.status === "completed" || t.endDate <= now),
      )
      .sort((a, b) => b.startDate - a.startDate)[0];

    const previousTournamentName =
      previous?.name ??
      (await getPreviousCompletedTournamentName({
        ctx,
        tournament,
      }));

    const previousTournamentLogoUrl = (() => {
      if (!previous || typeof previous !== "object") return "";
      const maybeLogoUrl = (previous as Record<string, unknown>)["logoUrl"];
      return typeof maybeLogoUrl === "string" ? maybeLogoUrl : "";
    })();

    const champions = previous
      ? await getChampionsStringForTournamentId({
          ctx,
          tournamentId: previous._id,
        })
      : "";

    const leaderboardRows = previous
      ? await getLeaderboardRowsForTournament({
          ctx,
          tournamentId: previous._id,
        })
      : [];

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const byMemberId = new Map<Id<"members">, Doc<"tourCards">>();
    for (const tc of tourCards) {
      if (!byMemberId.has(tc.memberId)) byMemberId.set(tc.memberId, tc);
    }

    const members = await Promise.all(
      [...byMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
    );

    const recipients = members
      .filter((m): m is Doc<"members"> => Boolean(m))
      .filter((m) => m.isActive !== false)
      .map((member) => {
        const tc = byMemberId.get(member._id);
        return {
          memberId: member._id,
          tourCardId: tc?._id,
          email: member.email,
          name: formatMemberName(member),
        };
      });

    return {
      tournament,
      seasonYear,
      previousTournamentName,
      previousTournamentLogoUrl,
      champions,
      leaderboardRows,
      recipients,
      activeTourCardCount: tourCards.length,
      memberCount: recipients.length,
    };
  },
});

/**
 * Lists unique email recipients for the “missing team” reminder.
 * Targets members with an “active” tour card (same season as tournament) but no team submitted.
 */
export const getMissingTeamReminderRecipientsForUpcomingTournament =
  internalQuery({
    args: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    handler: async (ctx, args) => {
      const tournament = args.tournamentId
        ? await ctx.db.get(args.tournamentId)
        : await getUpcomingTournament(ctx);

      if (!tournament) {
        return {
          ok: true,
          skipped: true,
          reason: "no_upcoming_tournament",
        } as const;
      }

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect();

      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();

      const tourCardsWithTeams = new Set<string>(
        teams.map((t) => t.tourCardId),
      );

      const missingTourCards = tourCards.filter(
        (tc) => !tourCardsWithTeams.has(tc._id),
      );

      const missingByMemberId = new Map<Id<"members">, number>();
      for (const tc of missingTourCards) {
        missingByMemberId.set(
          tc.memberId,
          (missingByMemberId.get(tc.memberId) ?? 0) + 1,
        );
      }

      const members = await Promise.all(
        [...missingByMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
      );

      const recipients = members
        .filter((m): m is Doc<"members"> => Boolean(m))
        .filter((m) => m.isActive !== false)
        .map((member) => ({
          email: member.email,
          name: formatMemberName(member),
          missingTeamCount: missingByMemberId.get(member._id) ?? 1,
        }));

      return {
        ok: true,
        skipped: false,
        tournament,
        recipients,
      } as const;
    },
  });

export const markGroupsEmailSent = internalMutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.tournamentId, { groupsEmailSentAt: now });
    return { tournamentId: args.tournamentId, groupsEmailSentAt: now };
  },
});

/**
 * Lists email recipients for league-wide emails (e.g. season opener).
 * Targets all members where `isActive !== false`.
 */
export const getActiveMemberEmailRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("members").collect();

    const byEmail = new Map<string, { email: string; name?: string }>();

    for (const m of members) {
      if (m.isActive === false) continue;
      const email = (m.email ?? "").trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, { email, name: formatMemberName(m) });
      }
    }

    const recipients = [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );

    return {
      ok: true,
      recipients,
      recipientCount: recipients.length,
    } as const;
  },
});

export const markReminderEmailSent = internalMutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.tournamentId, { reminderEmailSentAt: now });
    return { tournamentId: args.tournamentId, reminderEmailSentAt: now };
  },
});

export const getIsAdminByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
    } as const;
  },
});
