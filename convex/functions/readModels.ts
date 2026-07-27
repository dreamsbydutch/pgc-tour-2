import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../utils/auth";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";

const APP_STATE_KEY = "primary" as const;

function chooseCurrentSeason(seasons: Doc<"seasons">[], now: number) {
  const year = new Date(now).getFullYear();
  return (
    seasons.find((season) => season.year === year) ??
    [...seasons].sort((a, b) => b.year - a.year || b.number - a.number)[0] ??
    null
  );
}

function deriveTimeline(
  seasons: Doc<"seasons">[],
  tournaments: Doc<"tournaments">[],
  now: number,
) {
  const currentSeason = chooseCurrentSeason(seasons, now);
  const seasonTournaments = currentSeason
    ? tournaments.filter(
        (tournament) => tournament.seasonId === currentSeason._id,
      )
    : [];
  const activeTournament =
    seasonTournaments.find((tournament) => tournament.status === "active") ??
    seasonTournaments.find(
      (tournament) => tournament.startDate <= now && tournament.endDate >= now,
    ) ??
    null;
  const nextTournament =
    [...seasonTournaments]
      .filter((tournament) => tournament.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0] ?? null;
  const pickWindowTournament =
    seasonTournaments.find(
      (tournament) =>
        tournament.status !== "active" &&
        tournament.status !== "completed" &&
        tournament.status !== "cancelled" &&
        now >= tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS &&
        now < tournament.startDate,
    ) ?? null;
  const seasonPhase = !currentSeason
    ? ("no-season" as const)
    : currentSeason.registrationDeadline &&
        now < currentSeason.registrationDeadline
      ? ("registration" as const)
      : seasonTournaments.length > 0 &&
          seasonTournaments.every(
            (tournament) =>
              tournament.status === "completed" ||
              tournament.status === "cancelled" ||
              tournament.endDate < now,
          )
        ? ("completed" as const)
        : ("in-season" as const);
  return {
    currentSeason,
    activeTournament,
    nextTournament,
    pickWindowTournament,
    seasonPhase,
  };
}

async function loadOrDeriveAppState(ctx: QueryCtx) {
  const stored = await ctx.db
    .query("appState")
    .withIndex("by_key", (q) => q.eq("key", APP_STATE_KEY))
    .unique();
  if (stored) return stored;

  const [seasons, tournaments] = await Promise.all([
    ctx.db.query("seasons").take(100),
    ctx.db.query("tournaments").take(500),
  ]);
  const timeline = deriveTimeline(seasons, tournaments, Date.now());
  return {
    _id: null,
    _creationTime: 0,
    key: APP_STATE_KEY,
    currentSeasonId: timeline.currentSeason?._id,
    activeTournamentId: timeline.activeTournament?._id,
    nextTournamentId: timeline.nextTournament?._id,
    pickWindowTournamentId: timeline.pickWindowTournament?._id,
    pickWindowOpensAt: timeline.pickWindowTournament
      ? timeline.pickWindowTournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS
      : undefined,
    pickWindowClosesAt: timeline.pickWindowTournament?.startDate,
    seasonPhase: timeline.seasonPhase,
    publicVersion: 0,
    updatedAt: 0,
  };
}

export const getViewerBootstrap = query({
  args: {},
  handler: async (ctx) => {
    const appState = await loadOrDeriveAppState(ctx);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { appState, member: null, tourCards: [], badges: [] };
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!member) {
      return { appState, member: null, tourCards: [], badges: [] };
    }

    const [tourCards, badges] = await Promise.all([
      appState.currentSeasonId
        ? ctx.db
            .query("tourCards")
            .withIndex("by_member_season", (q) =>
              q
                .eq("memberId", member._id)
                .eq("seasonId", appState.currentSeasonId!),
            )
            .take(20)
        : Promise.resolve([]),
      appState.currentSeasonId
        ? ctx.db
            .query("majorChampionBadges")
            .withIndex("by_season_member", (q) =>
              q
                .eq("seasonId", appState.currentSeasonId!)
                .eq("memberId", member._id),
            )
            .take(20)
        : Promise.resolve([]),
    ]);
    return { appState, member, tourCards, badges };
  },
});

export const refreshAppState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [seasons, tournaments] = await Promise.all([
      ctx.db.query("seasons").take(100),
      ctx.db.query("tournaments").take(500),
    ]);
    const timeline = deriveTimeline(seasons, tournaments, Date.now());
    const existing = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", APP_STATE_KEY))
      .unique();
    const derived = {
      key: APP_STATE_KEY,
      currentSeasonId: timeline.currentSeason?._id,
      activeTournamentId: timeline.activeTournament?._id,
      nextTournamentId: timeline.nextTournament?._id,
      pickWindowTournamentId: timeline.pickWindowTournament?._id,
      pickWindowOpensAt: timeline.pickWindowTournament
        ? timeline.pickWindowTournament.startDate -
          PRE_TOURNAMENT_PICK_WINDOW_MS
        : undefined,
      pickWindowClosesAt: timeline.pickWindowTournament?.startDate,
      seasonPhase: timeline.seasonPhase,
    };
    if (existing) {
      const stateChanged =
        existing.currentSeasonId !== derived.currentSeasonId ||
        existing.activeTournamentId !== derived.activeTournamentId ||
        existing.nextTournamentId !== derived.nextTournamentId ||
        existing.pickWindowTournamentId !== derived.pickWindowTournamentId ||
        existing.pickWindowOpensAt !== derived.pickWindowOpensAt ||
        existing.pickWindowClosesAt !== derived.pickWindowClosesAt ||
        existing.seasonPhase !== derived.seasonPhase;
      if (stateChanged) {
        await ctx.db.patch(existing._id, {
          ...derived,
          publicVersion: existing.publicVersion + 1,
          updatedAt: Date.now(),
        });
      }
      if (
        timeline.nextTournament &&
        existing.liveSyncScheduledTournamentId !== timeline.nextTournament._id
      ) {
        await ctx.scheduler.runAt(
          timeline.nextTournament.startDate,
          internal.functions.cronJobs.runAdaptiveTournamentSync,
          {
            chainId: `tournament:${timeline.nextTournament._id}`,
            repair: true,
          },
        );
        await ctx.db.patch(existing._id, {
          liveSyncScheduledTournamentId: timeline.nextTournament._id,
        });
      }
      const pickWindowOpensAt = timeline.nextTournament
        ? timeline.nextTournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS
        : null;
      if (
        timeline.nextTournament &&
        pickWindowOpensAt !== null &&
        pickWindowOpensAt > Date.now() &&
        existing.pickWindowScheduledTournamentId !== timeline.nextTournament._id
      ) {
        await ctx.scheduler.runAt(
          pickWindowOpensAt,
          internal.functions.readModels.refreshAppState,
          {},
        );
        await ctx.db.patch(existing._id, {
          pickWindowScheduledTournamentId: timeline.nextTournament._id,
        });
      }
      return existing._id;
    }
    const id = await ctx.db.insert("appState", {
      ...derived,
      publicVersion: 1,
      updatedAt: Date.now(),
    });
    if (timeline.nextTournament) {
      await ctx.scheduler.runAt(
        timeline.nextTournament.startDate,
        internal.functions.cronJobs.runAdaptiveTournamentSync,
        {
          chainId: `tournament:${timeline.nextTournament._id}`,
          repair: true,
        },
      );
      await ctx.db.patch(id, {
        liveSyncScheduledTournamentId: timeline.nextTournament._id,
      });
      const pickWindowOpensAt =
        timeline.nextTournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS;
      if (pickWindowOpensAt > Date.now()) {
        await ctx.scheduler.runAt(
          pickWindowOpensAt,
          internal.functions.readModels.refreshAppState,
          {},
        );
        await ctx.db.patch(id, {
          pickWindowScheduledTournamentId: timeline.nextTournament._id,
        });
      }
    }
    return id;
  },
});

export const claimLiveSyncChain = internalMutation({
  args: {
    chainId: v.string(),
    repair: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", APP_STATE_KEY))
      .unique();
    if (!state) return { claimed: false, reason: "missing_app_state" } as const;
    if (
      args.repair &&
      state.liveSyncLeaseUntil &&
      state.liveSyncLeaseUntil > now
    ) {
      return { claimed: false, reason: "chain_healthy" } as const;
    }
    if (
      !args.repair &&
      state.liveSyncChainId &&
      state.liveSyncChainId !== args.chainId
    ) {
      return { claimed: false, reason: "stale_chain" } as const;
    }
    await ctx.db.patch(state._id, {
      liveSyncChainId: args.chainId,
      liveSyncLeaseUntil: now + 10 * 60_000,
    });
    return {
      claimed: true,
      activeTournamentId: state.activeTournamentId,
    } as const;
  },
});

export const finishLiveSyncChain = internalMutation({
  args: { chainId: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", APP_STATE_KEY))
      .unique();
    if (state?.liveSyncChainId === args.chainId) {
      await ctx.db.patch(state._id, {
        liveSyncChainId: undefined,
        liveSyncLeaseUntil: undefined,
      });
    }
  },
});

export const adminRebuildReadModels = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
    const page = await ctx.db.query("tourCards").paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
      maximumRowsRead: limit,
      maximumBytesRead: 2_000_000,
    });

    for (const card of page.page) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", card._id))
        .take(100);
      for (const team of teams) {
        const snapshot = {
          seasonId: card.seasonId,
          tourId: card.tourId,
          memberId: card.memberId,
          displayName: card.displayName,
          playoff: card.playoff,
        };
        if (
          team.seasonId !== snapshot.seasonId ||
          team.tourId !== snapshot.tourId ||
          team.memberId !== snapshot.memberId ||
          team.displayName !== snapshot.displayName ||
          team.playoff !== snapshot.playoff
        ) {
          await ctx.db.patch(team._id, snapshot);
        }
      }
    }

    if (page.isDone) {
      const tours = await ctx.db.query("tours").take(100);
      for (const tour of tours) {
        const cards = await ctx.db
          .query("tourCards")
          .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
          .take((tour.maxParticipants ?? 500) + 1);
        if (tour.registeredCount !== cards.length) {
          await ctx.db.patch(tour._id, { registeredCount: cards.length });
        }
      }
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
    };
  },
});

export const adminBackfillTournamentGolfers = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
    const page = await ctx.db.query("tournamentGolfers").paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
      maximumRowsRead: limit,
      maximumBytesRead: 2_000_000,
    });
    let changed = 0;
    for (const row of page.page) {
      if (row.golferApiId !== undefined && row.playerName) continue;
      const golfer = await ctx.db.get(row.golferId);
      if (!golfer) continue;
      await ctx.db.patch(row._id, {
        golferApiId: golfer.apiId,
        playerName: golfer.playerName,
        country: golfer.country,
      });
      changed += 1;
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      changed,
    };
  },
});

export const adminRebuildMajorChampionBadges = mutation({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const [tiers, tournaments] = await Promise.all([
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .take(30),
      ctx.db
        .query("tournaments")
        .withIndex("by_season_status", (q) =>
          q.eq("seasonId", args.seasonId).eq("status", "completed"),
        )
        .take(100),
    ]);
    const majorTierIds = new Set(
      tiers
        .filter((tier) => tier.name.trim().toLowerCase() === "major")
        .map((tier) => tier._id),
    );
    let changed = 0;
    for (const tournament of tournaments) {
      const isBadgeTournament =
        majorTierIds.has(tournament.tierId) ||
        tournament.name.toLowerCase().includes("canadian open");
      if (!isBadgeTournament) continue;
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament_position", (q) =>
          q.eq("tournamentId", tournament._id),
        )
        .take(500);
      for (const team of teams) {
        if (Number.parseInt(team.position?.match(/\d+/)?.[0] ?? "", 10) !== 1)
          continue;
        const memberId =
          team.memberId ?? (await ctx.db.get(team.tourCardId))?.memberId;
        if (!memberId) continue;
        const existing = await ctx.db
          .query("majorChampionBadges")
          .withIndex("by_tournament_member", (q) =>
            q.eq("tournamentId", tournament._id).eq("memberId", memberId),
          )
          .unique();
        const value = {
          seasonId: args.seasonId,
          memberId,
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          logoUrl: tournament.logoUrl,
          updatedAt: Date.now(),
        };
        if (existing) await ctx.db.patch(existing._id, value);
        else await ctx.db.insert("majorChampionBadges", value);
        changed += 1;
      }
    }
    return { changed };
  },
});

export const rebuildMajorChampionBadgesForTournament = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament || tournament.status !== "completed") {
      return { changed: 0, skipped: true } as const;
    }
    const tier = await ctx.db.get(tournament.tierId);
    const isBadgeTournament =
      tier?.name.trim().toLowerCase() === "major" ||
      tournament.name.toLowerCase().includes("canadian open");
    if (!isBadgeTournament) {
      return { changed: 0, skipped: true } as const;
    }

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_position", (q) =>
        q.eq("tournamentId", tournament._id),
      )
      .take(500);
    let changed = 0;
    for (const team of teams) {
      if (Number.parseInt(team.position?.match(/\d+/)?.[0] ?? "", 10) !== 1) {
        continue;
      }
      const memberId =
        team.memberId ?? (await ctx.db.get(team.tourCardId))?.memberId;
      if (!memberId) continue;
      const existing = await ctx.db
        .query("majorChampionBadges")
        .withIndex("by_tournament_member", (q) =>
          q.eq("tournamentId", tournament._id).eq("memberId", memberId),
        )
        .unique();
      const value = {
        seasonId: tournament.seasonId,
        memberId,
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        logoUrl: tournament.logoUrl,
        updatedAt: Date.now(),
      };
      if (
        existing &&
        existing.tournamentName === value.tournamentName &&
        existing.logoUrl === value.logoUrl &&
        existing.seasonId === value.seasonId
      ) {
        continue;
      }
      if (existing) await ctx.db.patch(existing._id, value);
      else await ctx.db.insert("majorChampionBadges", value);
      changed += 1;
    }
    return { changed, skipped: false } as const;
  },
});

export const adminGetIoDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const appState = await loadOrDeriveAppState(ctx);
    const metrics = await ctx.meta.getTransactionMetrics();
    return { appState, metrics };
  },
});

export type ViewerBootstrap = {
  appState: {
    currentSeasonId?: Id<"seasons">;
    activeTournamentId?: Id<"tournaments">;
    nextTournamentId?: Id<"tournaments">;
  };
};
