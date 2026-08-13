import { v } from "convex/values";
import { Doc, type Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";
import { normalizeCountry } from "../utils/golfers";

/** Upserts one bounded page from DataGolf's complete player directory. */
export const upsertGolfersFromDataGolfPlayerList = internalMutation({
  args: {
    players: v.array(
      v.object({
        dg_id: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let invalid = 0;

    for (const player of args.players) {
      const apiId = player.dg_id;
      const playerName = normalizePlayerNameFromDataGolf(player.player_name);
      if (!Number.isSafeInteger(apiId) || apiId <= 0 || !playerName) {
        invalid += 1;
        continue;
      }
      const country = normalizeCountry(player.country);
      const existing = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
        .first();
      if (!existing) {
        await ctx.db.insert("golfers", {
          apiId,
          playerName,
          ...(country ? { country } : {}),
          updatedAt: Date.now(),
        });
        inserted += 1;
        continue;
      }

      const patch: Partial<Doc<"golfers">> = {};
      if (existing.playerName !== playerName) patch.playerName = playerName;
      if (country && existing.country !== country) patch.country = country;
      if (Object.keys(patch).length === 0) {
        unchanged += 1;
        continue;
      }
      await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
      updated += 1;
    }

    return {
      ok: true,
      processed: args.players.length,
      inserted,
      updated,
      unchanged,
      invalid,
    } as const;
  },
});

/**
 * Applies country + OWGR (and normalized player name) updates to `golfers` from an input ranking array.
 *
 * This is intentionally a mutation-only write path (no DataGolf calls), so it can be used by other
 * server-side jobs that already fetched rankings.
 *
 * @param args.rankings Ranking rows from DataGolf (dg_id/owgr_rank/player_name/country).
 * @returns Summary counts of matched/updated golfers.
 */
export const applyGolfersWorldRankFromDataGolfInput = internalMutation({
  args: {
    rankings: v.array(
      v.object({
        dg_id: v.number(),
        owgr_rank: v.number(),
        player_name: v.string(),
        country: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const r of args.rankings) {
      if (!Number.isFinite(r.dg_id) || !Number.isFinite(r.owgr_rank)) continue;
      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", r.dg_id))
        .first();
      if (!golfer) continue;
      golfersMatched += 1;

      const normalizedName = normalizePlayerNameFromDataGolf(r.player_name);
      const patch: Partial<Doc<"golfers">> & { updatedAt: number } = {
        updatedAt: Date.now(),
      };
      if (normalizedName && normalizedName !== golfer.playerName) {
        patch.playerName = normalizedName;
      }
      if (r.owgr_rank && r.owgr_rank !== golfer.worldRank) {
        patch.worldRank = r.owgr_rank;
      }

      const nextCountry = r.country.trim();
      if (nextCountry.length > 0 && nextCountry !== golfer.country) {
        patch.country = nextCountry;
      }

      const keys = Object.keys(patch);
      if (keys.length > 1) {
        await ctx.db.patch(golfer._id, patch);
        const tournamentRows = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer", (q) => q.eq("golferId", golfer._id))
          .take(100);
        for (const row of tournamentRows) {
          await ctx.db.patch(row._id, {
            golferApiId: golfer.apiId,
            playerName: patch.playerName ?? golfer.playerName,
            country: patch.country ?? golfer.country,
          });
        }
        golfersUpdated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      golfersMatched,
      golfersUpdated,
      rankingsProcessed: args.rankings.length,
    } as const;
  },
});
/**
 * Creates the full set of `tournamentGolfers` for a tournament from grouped DataGolf inputs.
 *
 * Notes:
 * - Skips if the tournament already has at least one tournament golfer.
 * - Ensures `golfers` records exist (creates missing), and inserts `tournamentGolfers` for each.
 *
 * @param args.tournamentId Tournament id.
 * @param args.groups Group list with a `groupNumber` and golfer entries.
 * @returns A small status object indicating whether inserts were skipped or performed.
 */
export const createTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    groups: v.array(
      v.object({
        groupNumber: v.number(),
        golfers: v.array(
          v.object({
            dgId: v.number(),
            playerName: v.string(),
            country: v.optional(v.string()),
            r1TeeTime: v.optional(v.number()),
            r2TeeTime: v.optional(v.number()),
            worldRank: v.optional(v.number()),
            skillEstimate: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();
    if (existing) {
      return {
        ok: true,
        skipped: true,
        reason: "already_has_golfers",
        tournamentId: args.tournamentId,
      } as const;
    }

    let inserted = 0;
    for (const group of args.groups) {
      for (const g of group.golfers) {
        const existingGolfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", g.dgId))
          .first();

        const golferId = existingGolfer
          ? existingGolfer._id
          : await ctx.db.insert("golfers", {
              apiId: g.dgId,
              playerName: normalizePlayerNameFromDataGolf(g.playerName),
              ...(g.country ? { country: g.country } : {}),
              ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
              updatedAt: Date.now(),
            });
        const existingTG = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer_tournament", (q) =>
            q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
          )
          .first();
        const rating = normalizeDgSkillEstimateToPgcRating(
          g.skillEstimate ?? -1.875,
        );

        if (!existingTG) {
          const playerName =
            existingGolfer?.playerName ??
            normalizePlayerNameFromDataGolf(g.playerName);
          await ctx.db.insert("tournamentGolfers", {
            golferId,
            tournamentId: args.tournamentId,
            golferApiId: g.dgId,
            playerName,
            country: g.country ?? existingGolfer?.country,
            group: group.groupNumber,
            worldRank: g.worldRank ?? 501,
            rating,
            ...(typeof g.r1TeeTime === "string"
              ? { roundOneTeeTime: g.r1TeeTime }
              : {}),
            ...(typeof g.r2TeeTime === "string"
              ? { roundTwoTeeTime: g.r2TeeTime }
              : {}),
            updatedAt: Date.now(),
          });
          inserted += 1;
        }
      }
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
      groupsCreated: args.groups.filter((g) => g.golfers.length > 0).length,
    } as const;
  },
});
export const createMissingTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    golfers: v.array(
      v.object({
        dg_id: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
        dg_skill_estimate: v.optional(v.number()),
        r1_teetime: v.optional(v.number()),
        r2_teetime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const g of args.golfers) {
      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", g.dg_id))
        .first();

      const golferId = existingGolfer
        ? existingGolfer._id
        : await ctx.db.insert("golfers", {
            apiId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            ...(g.country ? { country: g.country } : {}),
            ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
            updatedAt: Date.now(),
          });
      const existingTG = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTG) {
        const playerName =
          existingGolfer?.playerName ??
          normalizePlayerNameFromDataGolf(g.player_name);
        await ctx.db.insert("tournamentGolfers", {
          golferId,
          tournamentId: args.tournamentId,
          golferApiId: g.dg_id,
          playerName,
          country: g.country ?? existingGolfer?.country,
          worldRank: g.worldRank ?? existingGolfer?.worldRank ?? 501,
          group: 0,
          usage: 0,
          round: 0,
          rating: normalizeDgSkillEstimateToPgcRating(
            g.dg_skill_estimate ?? -1.875,
          ),
          ...(typeof g.r1_teetime === "number"
            ? { roundOneTeeTime: g.r1_teetime }
            : {}),
          ...(typeof g.r2_teetime === "number"
            ? { roundTwoTeeTime: g.r2_teetime }
            : {}),
          updatedAt: Date.now(),
        });
        inserted += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
    } as const;
  },
});

const tournamentGolferUpdateValidator = v.object({
  _id: v.id("tournamentGolfers"),
  golferId: v.id("golfers"),
  tournamentId: v.id("tournaments"),
  position: v.optional(v.string()),
  posChange: v.optional(v.number()),
  score: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  topTen: v.optional(v.number()),
  win: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  group: v.optional(v.number()),
  endHole: v.optional(v.number()),
  round: v.optional(v.number()),
  roundOne: v.optional(v.number()),
  roundTwo: v.optional(v.number()),
  roundThree: v.optional(v.number()),
  roundFour: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.number()),
  roundTwoTeeTime: v.optional(v.number()),
  roundThreeTeeTime: v.optional(v.number()),
  roundFourTeeTime: v.optional(v.number()),
  rating: v.optional(v.number()),
  worldRank: v.optional(v.number()),
  usage: v.optional(v.number()),
});

export type TournamentGolferUpdate = {
  _id: Id<"tournamentGolfers">;
  golferId: Id<"golfers">;
  tournamentId: Id<"tournaments">;
  [key: string]: unknown;
};

async function applyTournamentGolferUpdate(
  ctx: MutationCtx,
  tournamentGolfer: TournamentGolferUpdate,
) {
  const existing = await ctx.db.get(tournamentGolfer._id);
  if (!existing) return false;
  const {
    _id,
    golferId: _golferId,
    tournamentId: _tournamentId,
    ...candidate
  } = tournamentGolfer;
  const patch = Object.fromEntries(
    Object.entries(candidate).filter(
      ([key, value]) => existing[key as keyof typeof existing] !== value,
    ),
  );
  if (Object.keys(patch).length === 0) return false;
  await ctx.db.patch(_id, { ...patch, updatedAt: Date.now() });
  return true;
}

export const updateTournamentGolfer = internalMutation({
  args: { tournamentGolfer: tournamentGolferUpdateValidator },
  handler: async (ctx, args) => {
    const changed = await applyTournamentGolferUpdate(
      ctx,
      args.tournamentGolfer,
    );
    return { changed } as const;
  },
});

export const applyTournamentGolferUpdatesBatch = internalMutation({
  args: { updates: v.array(tournamentGolferUpdateValidator) },
  handler: async (ctx, args) => {
    if (args.updates.length > 25) throw new Error("Batch limit is 25 golfers");
    let changed = 0;
    for (const update of args.updates) {
      if (await applyTournamentGolferUpdate(ctx, update)) changed += 1;
    }
    return { seen: args.updates.length, changed };
  },
});
