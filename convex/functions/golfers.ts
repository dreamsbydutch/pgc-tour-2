/**
 * Golfer Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { action, mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import { processData } from "../utils/processData";
import { normalize } from "../utils/normalize";
import {
  applyFilters,
  chunkArray,
  countCommas,
  enhanceGolfer,
  fetchDataGolfPlayerList,
  generateDisplayName,
  generateRankDisplay,
  generateAnalytics,
  getOptimizedGolfers,
  getRankingCategory,
  getSortFunction,
  normalizeCommaName,
  normalizeCountry,
  normalizeGolferName,
  normalizePlayerName,
  normalizeStoredCountry,
} from "../utils/golfers";
import { golfersValidators } from "../validators/golfers";
import { requireModeratorOrAdminByClerkId } from "../utils/authByClerkId";
import { requireModerator } from "../auth";
import type { Id } from "../_generated/dataModel";
import type {
  DedupeResult,
  NormalizeNamesResult,
  SyncResult,
  UpsertResult,
} from "../types/golfers";
import type { DeleteResponse, GolferDoc } from "../types/types";

export const listGolfersForSync = query({
  args: golfersValidators.args.listGolfersForSync,
  handler: async (ctx, args) => {
    await requireModeratorOrAdminByClerkId(ctx, args.clerkId);

    const golfers = await ctx.db.query("golfers").collect();
    return golfers.map((g) => ({
      _id: g._id,
      apiId: g.apiId,
      playerName: g.playerName,
      country: g.country ?? null,
      worldRank: g.worldRank ?? null,
    }));
  },
});

export const syncGolfersFromDataGolf = action({
  args: golfersValidators.args.syncGolfersFromDataGolf,
  handler: async (ctx, args): Promise<SyncResult> => {
    const clerkId = args.clerkId.trim();
    if (!clerkId) {
      throw new Error(
        "Unauthorized: Missing clerkId argument (hard refresh the app)",
      );
    }

    const identity = await ctx.auth.getUserIdentity();
    if (identity && identity.subject !== clerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    const member = await ctx.runQuery(api.functions.members.getMembers, {
      options: { clerkId },
    });

    if (!member || typeof member !== "object" || Array.isArray(member)) {
      throw new Error(
        "Member profile not found. Please contact an administrator.",
      );
    }

    const role = (member as { role?: unknown }).role;
    const normalizedRole =
      typeof role === "string" ? role.trim().toLowerCase() : "";
    if (normalizedRole !== "admin" && normalizedRole !== "moderator") {
      throw new Error("Forbidden: Moderator or admin access required");
    }

    const options = args.options || {};
    const players = await fetchDataGolfPlayerList();
    const limited = options.limit ? players.slice(0, options.limit) : players;
    const weirdNameSamples: Array<{
      dgId: number;
      raw: string;
      normalized: string;
      commaCount: number;
    }> = [];

    const payload = limited
      .filter((p) => Number.isFinite(p.dg_id) && p.player_name)
      .map((p) => {
        const raw = p.player_name.trim();
        const normalized = normalizePlayerName(raw);
        const commaCount = countCommas(raw);

        if (
          (commaCount >= 2 || normalized.includes(",")) &&
          weirdNameSamples.length < 200
        ) {
          weirdNameSamples.push({
            dgId: p.dg_id,
            raw,
            normalized,
            commaCount,
          });
        }

        return {
          apiId: p.dg_id,
          playerName: normalized,
          country: normalizeCountry(p.country),
        };
      });
    const nameKey = (s: string) => normalize.name(s);

    const dgByNameKey = new Map<string, Array<(typeof payload)[number]>>();
    for (const g of payload) {
      const key = nameKey(g.playerName);
      const arr = dgByNameKey.get(key);
      if (arr) arr.push(g);
      else dgByNameKey.set(key, [g]);
    }

    const dgCanonicalByNameKey = new Map<
      string,
      { canonical: (typeof payload)[number]; ambiguousCountries: boolean }
    >();

    for (const [key, records] of dgByNameKey) {
      const knownCountries = new Set(
        records.map((r) => r.country).filter((c): c is string => Boolean(c)),
      );
      const ambiguousCountries = knownCountries.size > 1;
      const sorted = [...records].sort((a, b) => {
        const aKnown = a.country ? 1 : 0;
        const bKnown = b.country ? 1 : 0;
        if (aKnown !== bKnown) return bKnown - aKnown;
        return a.apiId - b.apiId;
      });

      dgCanonicalByNameKey.set(key, {
        canonical: sorted[0]!,
        ambiguousCountries,
      });
    }

    const canonicalPayload = [...dgCanonicalByNameKey.values()].map(
      (v) => v.canonical,
    );

    const existing = await ctx.runQuery(
      api.functions.golfers.listGolfersForSync,
      {
        clerkId,
      },
    );

    const byApiId = new Map<number, (typeof existing)[number]>();
    for (const g of existing) byApiId.set(g.apiId, g);

    const byNameKey = new Map<string, Array<(typeof existing)[number]>>();
    for (const g of existing) {
      const key = nameKey(g.playerName);
      const arr = byNameKey.get(key);
      if (arr) arr.push(g);
      else byNameKey.set(key, [g]);
    }

    const inserts: typeof payload = [];
    const patchesByGolferId = new Map<
      string,
      {
        golferId: Id<"golfers">;
        data: { apiId?: number; playerName?: string; country?: string };
      }
    >();

    const patchDebug: Array<{
      apiId: number;
      golferId: string;
      reason: "byApiId" | "byName";
      before: { apiId: number; playerName: string; country: string | null };
      after: { apiId: number; playerName: string; country: string | null };
    }> = [];

    for (const g of canonicalPayload) {
      const found = byApiId.get(g.apiId);
      if (!found) {
        const candidates = byNameKey.get(nameKey(g.playerName)) ?? [];
        if (candidates.length === 1) {
          const candidate = candidates[0]!;

          const dgMeta = dgCanonicalByNameKey.get(nameKey(g.playerName));
          const ambiguousCountries = Boolean(dgMeta?.ambiguousCountries);
          const apiIdOwner = byApiId.get(g.apiId);
          if (!apiIdOwner || apiIdOwner._id === candidate._id) {
            const patch: {
              apiId?: number;
              playerName?: string;
              country?: string;
            } = {
              apiId: g.apiId,
            };
            if (g.playerName && g.playerName !== candidate.playerName) {
              patch.playerName = g.playerName;
            }
            const nextCountry = normalizeStoredCountry(g.country);
            const prevCountry = normalizeStoredCountry(candidate.country);
            if (
              !ambiguousCountries &&
              nextCountry &&
              nextCountry !== prevCountry
            ) {
              patch.country = nextCountry;
            }

            const existingPatch = patchesByGolferId.get(String(candidate._id));
            const merged = {
              ...(existingPatch?.data ?? {}),
              ...patch,
            };
            patchesByGolferId.set(String(candidate._id), {
              golferId: candidate._id,
              data: merged,
            });

            if (patchDebug.length < 50) {
              patchDebug.push({
                apiId: g.apiId,
                golferId: String(candidate._id),
                reason: "byName",
                before: {
                  apiId: candidate.apiId,
                  playerName: candidate.playerName,
                  country: candidate.country,
                },
                after: {
                  apiId: patch.apiId ?? candidate.apiId,
                  playerName: patch.playerName ?? candidate.playerName,
                  country: patch.country ?? candidate.country,
                },
              });
            }
            byApiId.set(g.apiId, candidate);
            continue;
          }
        }

        inserts.push(g);
        continue;
      }

      const nextName = g.playerName;
      const nextCountry = normalizeStoredCountry(g.country);

      const patch: { apiId?: number; playerName?: string; country?: string } =
        {};
      if (nextName && nextName !== found.playerName)
        patch.playerName = nextName;
      const prevCountry = normalizeStoredCountry(found.country);
      if (nextCountry && nextCountry !== prevCountry) {
        patch.country = nextCountry;
      }

      if (Object.keys(patch).length > 0) {
        const existingPatch = patchesByGolferId.get(String(found._id));
        const merged = {
          ...(existingPatch?.data ?? {}),
          ...patch,
        };
        patchesByGolferId.set(String(found._id), {
          golferId: found._id,
          data: merged,
        });

        if (patchDebug.length < 50) {
          patchDebug.push({
            apiId: g.apiId,
            golferId: String(found._id),
            reason: "byApiId",
            before: {
              apiId: found.apiId,
              playerName: found.playerName,
              country: found.country,
            },
            after: {
              apiId: patch.apiId ?? found.apiId,
              playerName: patch.playerName ?? found.playerName,
              country: patch.country ?? found.country,
            },
          });
        }
      }
    }

    const patches = [...patchesByGolferId.values()];

    const dryRun = Boolean(options.dryRun);
    const chunkSize = 300;

    if (!dryRun) {
      for (const chunk of chunkArray(inserts, chunkSize)) {
        if (chunk.length === 0) continue;
        await ctx.runMutation(api.functions.golfers.bulkInsertGolfers, {
          clerkId,
          data: chunk,
        });
      }

      for (const chunk of chunkArray(patches, chunkSize)) {
        if (chunk.length === 0) continue;
        await ctx.runMutation(api.functions.golfers.bulkPatchGolfers, {
          clerkId,
          patches: chunk,
        });
      }
    }

    const upserted: UpsertResult = {
      total: canonicalPayload.length,
      inserted: inserts.length,
      updated: patches.length,
      dryRun,
    };

    return {
      fetched: limited.length,
      upserted,
    };
  },
});

/**
 * Get golfers with cursor-based pagination (for large datasets)
 *
 * Returns cursor-paginated results to handle large golfer tables efficiently.
 * Recommended for all list/search operations on golfers.
 *
 * @example
 * Get first 100 golfers
 * const page = await ctx.runQuery(api.functions.golfers.getGolfersPage, {
 *   paginationOpts: { numItems: 100 }
 * });
 *
 * Get next page
 * if (!page.isDone) {
 *   const nextPage = await ctx.runQuery(api.functions.golfers.getGolfersPage, {
 *     paginationOpts: { numItems: 100, cursor: page.continueCursor }
 *   });
 * }
 */
export const getGolfersPage = query({
  args: golfersValidators.args.getGolfersPage,
  handler: async (ctx, args) => {
    const options = args.options || {};
    const filter = options.filter || {};
    if (filter.apiId !== undefined) {
      return await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", filter.apiId!))
        .paginate(args.paginationOpts);
    }
    const result = await ctx.db.query("golfers").paginate(args.paginationOpts);
    if (filter.country || filter.searchTerm) {
      const filtered = result.page.filter((golfer) => {
        if (filter.country && golfer.country !== filter.country) return false;
        if (filter.searchTerm) {
          const searchLower = filter.searchTerm.toLowerCase();
          const searchableText = [golfer.playerName, golfer.country || ""]
            .join(" ")
            .toLowerCase();
          if (!searchableText.includes(searchLower)) return false;
        }
        return true;
      });

      return {
        ...result,
        page: filtered,
      };
    }

    return result;
  },
});

export const bulkInsertGolfers = mutation({
  args: golfersValidators.args.bulkInsertGolfers,
  handler: async (ctx, args) => {
    await requireModeratorOrAdminByClerkId(ctx, args.clerkId);

    const dryRun = Boolean(args.options?.dryRun);
    let inserted = 0;
    for (const g of args.data) {
      inserted += 1;
      if (dryRun) continue;
      await ctx.db.insert("golfers", {
        apiId: g.apiId,
        playerName: g.playerName,
        ...(g.country ? { country: g.country } : {}),
        ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
        updatedAt: Date.now(),
      });
    }
    return { inserted, dryRun };
  },
});

export const bulkPatchGolfers = mutation({
  args: golfersValidators.args.bulkPatchGolfers,
  handler: async (ctx, args) => {
    await requireModeratorOrAdminByClerkId(ctx, args.clerkId);

    const dryRun = Boolean(args.options?.dryRun);
    let updated = 0;
    for (const p of args.patches) {
      updated += 1;
      if (dryRun) continue;
      await ctx.db.patch(p.golferId, { ...p.data, updatedAt: Date.now() });
    }
    return { updated, dryRun };
  },
});

/**
 * Admin tool: convert golfer names from "Last, First" to "First Last".
 *
 * Run this once after an incorrect sync, then run `adminDedupeGolfersByName`
 * to remove any duplicates that collapse to the same name.
 */
export const adminNormalizeGolferNames = mutation({
  args: golfersValidators.args.adminNormalizeGolferNames,
  handler: async (ctx, args): Promise<NormalizeNamesResult> => {
    await requireModeratorOrAdminByClerkId(ctx, args.clerkId);

    const dryRun = Boolean(args.options?.dryRun);
    const limit = args.options?.limit;

    const golfers = await ctx.db.query("golfers").collect();
    const slice = typeof limit === "number" ? golfers.slice(0, limit) : golfers;

    let changed = 0;
    for (const g of slice) {
      if (!g.playerName.includes(",")) continue;
      const normalized = normalizeCommaName(g.playerName);
      if (normalized === g.playerName) continue;
      changed += 1;
      if (dryRun) continue;
      await ctx.db.patch(g._id, {
        playerName: normalized,
        updatedAt: Date.now(),
      });
    }

    return { scanned: slice.length, changed };
  },
});

export const upsertGolfers = mutation({
  args: golfersValidators.args.upsertGolfers,
  handler: async (ctx, args) => {
    const clerkId = args.clerkId?.trim();
    if (clerkId) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity && identity.subject !== clerkId) {
        throw new Error("Unauthorized: Clerk ID mismatch");
      }

      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
        .first();
      const role = member?.role?.trim().toLowerCase() ?? "";
      if (role !== "admin" && role !== "moderator") {
        throw new Error("Forbidden: Moderator or admin access required");
      }
    } else {
      await requireModerator(ctx);
    }

    const dryRun = Boolean(args.options?.dryRun);
    let inserted = 0;
    let updated = 0;

    for (const g of args.data) {
      const existing = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", g.apiId))
        .first();

      if (!existing) {
        inserted += 1;
        if (!dryRun) {
          await ctx.db.insert("golfers", {
            apiId: g.apiId,
            playerName: g.playerName,
            ...(g.country ? { country: g.country } : {}),
            ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
            updatedAt: Date.now(),
          });
        }
        continue;
      }

      updated += 1;
      if (!dryRun) {
        await ctx.db.patch(existing._id, {
          playerName: g.playerName,
          ...(g.country ? { country: g.country } : {}),
          ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
          updatedAt: Date.now(),
        });
      }
    }

    return {
      total: args.data.length,
      inserted,
      updated,
      dryRun,
    };
  },
});

/**
 * Create golfers with comprehensive options
 *
 * @example
 * Basic golfer creation
 * const golfer = await ctx.runMutation(api.functions.golfers.createGolfers, {
 *   data: {
 *     apiId: 12345,
 *     playerName: "Tiger Woods",
 *     country: "USA",
 *     worldRank: 15
 *   }
 * });
 *
 * With advanced options
 * const golfer = await ctx.runMutation(api.functions.golfers.createGolfers, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const createGolfers = mutation({
  args: golfersValidators.args.createGolfers,
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const options = args.options || {};
    const data = args.data;
    if (!options.skipValidation) {
      const validation = golfersValidators.validateGolferData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
      const existing = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", data.apiId))
        .first();

      if (existing) {
        throw new Error("Golfer with this API ID already exists");
      }
    }
    const golferId = await ctx.db.insert("golfers", {
      apiId: data.apiId,
      playerName: data.playerName,
      country: data.country,
      worldRank: data.worldRank,
      updatedAt: Date.now(),
    });

    const golfer = await ctx.db.get(golferId);
    if (!golfer) throw new Error("Failed to retrieve created golfer");
    if (options.returnEnhanced) {
      return await enhanceGolfer(ctx, golfer, {
        includeTournaments: options.includeTournaments,
        includeStatistics: options.includeStatistics,
      });
    }

    return golfer;
  },
});

/**
 * Get golfers with comprehensive query options
 *
 * @example
 * Get single golfer by ID
 * const golfer = await ctx.runQuery(api.functions.golfers.getGolfers, {
 *   options: { id: "golfer123" }
 * });
 *
 * Get golfer by API ID
 * const golfer = await ctx.runQuery(api.functions.golfers.getGolfers, {
 *   options: {
 *     filter: { apiId: 12345 }
 *   }
 * });
 *
 * Get golfers with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.golfers.getGolfers, {
 *   options: {
 *     filter: {
 *       country: "USA",
 *       maxWorldRank: 50,
 *       searchTerm: "Tiger"
 *     },
 *     sort: {
 *       sortBy: "worldRank",
 *       sortOrder: "asc"
 *     },
 *     pagination: {
 *       limit: 50,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeTournaments: true,
 *       includeStatistics: true,
 *       includeRecentPerformance: true
 *     }
 *   }
 * });
 */
export const getGolfers = query({
  args: golfersValidators.args.getGolfers,
  handler: async (ctx, args) => {
    const options = args.options || {};
    if (options.id) {
      const golfer = await ctx.db.get(options.id);
      if (!golfer) return null;

      return await enhanceGolfer(ctx, golfer, options.enhance || {});
    }
    if (options.apiId) {
      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", options.apiId!))
        .first();
      if (!golfer) return null;

      return await enhanceGolfer(ctx, golfer, options.enhance || {});
    }
    if (options.ids) {
      const golfers = await Promise.all(
        options.ids.map(async (id) => {
          const golfer = await ctx.db.get(id);
          return golfer
            ? await enhanceGolfer(ctx, golfer, options.enhance || {})
            : null;
        }),
      );
      return golfers.filter(Boolean);
    }
    let golfers = await getOptimizedGolfers(ctx, options);
    golfers = applyFilters(golfers, options.filter || {});
    if (options.rankedOnly) {
      golfers = golfers.filter((g) => g.worldRank && g.worldRank > 0);
    }
    if (options.topRankedOnly) {
      golfers = golfers.filter((g) => g.worldRank && g.worldRank <= 100);
    }
    const processedGolfers = processData(golfers, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });
    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedGolfers = await Promise.all(
        processedGolfers.map((golfer) =>
          enhanceGolfer(ctx, golfer, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          golfers: enhancedGolfers,
          analytics: await generateAnalytics(ctx, golfers),
          meta: {
            total: golfers.length,
            filtered: processedGolfers.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedGolfers;
    }
    const basicGolfers = processedGolfers.map((golfer) => ({
      ...golfer,
      displayName: generateDisplayName(golfer.playerName),
      rankDisplay: generateRankDisplay(golfer.worldRank),
      hasRanking: Boolean(golfer.worldRank && golfer.worldRank > 0),
      isRanked: Boolean(golfer.worldRank && golfer.worldRank > 0),
      rankingCategory: getRankingCategory(golfer.worldRank),
    }));

    if (options.includeAnalytics) {
      return {
        golfers: basicGolfers,
        analytics: await generateAnalytics(ctx, golfers),
        meta: {
          total: golfers.length,
          filtered: basicGolfers.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicGolfers;
  },
});

/**
 * Frontend convenience: golfers + tournament-specific leaderboard fields.
 */
export const getTournamentLeaderboardGolfers = query({
  args: golfersValidators.args.getTournamentLeaderboardGolfers,
  handler: async (ctx, args) => {
    const tournamentGolferDocs = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const result = await Promise.all(
      tournamentGolferDocs.map(async (tg) => {
        const golfer = await ctx.db.get(tg.golferId);
        if (!golfer) return null;

        return {
          ...golfer,
          tournamentId: tg.tournamentId,
          tournamentGolferId: tg._id,
          position: tg.position,
          posChange: tg.posChange,
          thru: tg.thru,
          today: tg.today,
          score: tg.score,
          round: tg.round,
          endHole: tg.endHole,
          group: tg.group,
          roundOneTeeTime: tg.roundOneTeeTime,
          roundOne: tg.roundOne,
          roundTwoTeeTime: tg.roundTwoTeeTime,
          roundTwo: tg.roundTwo,
          roundThreeTeeTime: tg.roundThreeTeeTime,
          roundThree: tg.roundThree,
          roundFourTeeTime: tg.roundFourTeeTime,
          roundFour: tg.roundFour,
          updatedAt: tg.updatedAt,
        };
      }),
    );

    return result.filter((x): x is NonNullable<typeof x> => x !== null);
  },
});

/**
 * Update golfers with comprehensive options
 *
 * @example
 * Basic update
 * const updatedGolfer = await ctx.runMutation(api.functions.golfers.updateGolfers, {
 *   golferId: "golfer123",
 *   data: { worldRank: 12, country: "USA" }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.golfers.updateGolfers, {
 *   golferId: "golfer123",
 *   data: { worldRank: 10 },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const updateGolfers = mutation({
  args: golfersValidators.args.updateGolfers,
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const options = args.options || {};
    const golfer = await ctx.db.get(args.golferId);
    if (!golfer) {
      throw new Error("Golfer not found");
    }
    if (!options.skipValidation) {
      const validation = golfersValidators.validateGolferData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }

    const updateData: Partial<GolferDoc> = { ...args.data };
    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.golferId, updateData);

    const updatedGolfer = await ctx.db.get(args.golferId);
    if (!updatedGolfer) throw new Error("Failed to retrieve updated golfer");
    if (options.returnEnhanced) {
      return await enhanceGolfer(ctx, updatedGolfer, {
        includeStatistics: options.includeStatistics,
        includeTournaments: options.includeTournaments,
        includeRecentPerformance: options.includeRecentPerformance,
      });
    }

    return updatedGolfer;
  },
});

/**
 * Delete golfers (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * @example
 * Delete golfer
 * const result = await ctx.runMutation(api.functions.golfers.deleteGolfers, {
 *   golferId: "golfer123"
 * });
 *
 * Delete with cascade cleanup and replacement
 * const result = await ctx.runMutation(api.functions.golfers.deleteGolfers, {
 *   golferId: "golfer123",
 *   options: {
 *     cascadeDelete: true,
 *     replacementGolferId: "newGolfer456"
 *   }
 * });
 */
export const deleteGolfers = mutation({
  args: golfersValidators.args.deleteGolfers,
  handler: async (ctx, args): Promise<DeleteResponse<GolferDoc>> => {
    await requireModerator(ctx);

    const options = args.options || {};
    const golfer = await ctx.db.get(args.golferId);
    if (!golfer) {
      throw new Error("Golfer not found");
    }

    let replacedCount = 0;
    let deletedGolferData: GolferDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedGolferData = golfer;
    }
    if (options.replacementGolferId) {
      const replacementGolfer = await ctx.db.get(options.replacementGolferId);
      if (!replacementGolfer) {
        throw new Error("Replacement golfer not found");
      }
      const tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .filter((q) => q.eq(q.field("golferId"), args.golferId))
        .collect();

      for (const tg of tournamentGolfers) {
        await ctx.db.patch(tg._id, {
          golferId: options.replacementGolferId,
        });
        replacedCount++;
      }
      const teamsPage = await ctx.db
        .query("teams")
        .paginate({ cursor: null, numItems: 5000 });

      if (!teamsPage.isDone) {
        console.warn(
          `[deleteGolfers] Database has >5000 teams. Only scanning first 5000 for golfer replacement. ` +
            `Some teams may still reference golfer ${golfer.apiId}. Consider using batch cleanup tool.`,
        );
      }

      for (const team of teamsPage.page) {
        if (team.golferIds.includes(golfer.apiId)) {
          const updatedGolferIds = team.golferIds.map((id) =>
            id === golfer.apiId ? replacementGolfer.apiId : id,
          );
          await ctx.db.patch(team._id, {
            golferIds: updatedGolferIds,
          });
          replacedCount++;
        }
      }
    }
    if (options.cascadeDelete && !options.replacementGolferId) {
      const tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer", (q) => q.eq("golferId", args.golferId))
        .collect();

      for (const tg of tournamentGolfers) {
        await ctx.db.delete(tg._id);
      }
      const teamsPage = await ctx.db
        .query("teams")
        .paginate({ cursor: null, numItems: 5000 });

      if (!teamsPage.isDone) {
        console.warn(
          `[deleteGolfers] Database has >5000 teams. Only scanning first 5000 for golfer removal. ` +
            `Some teams may still reference golfer ${golfer.apiId}. Consider using batch cleanup tool.`,
        );
      }

      for (const team of teamsPage.page) {
        if (team.golferIds.includes(golfer.apiId)) {
          const updatedGolferIds = team.golferIds.filter(
            (id) => id !== golfer.apiId,
          );
          await ctx.db.patch(team._id, {
            golferIds: updatedGolferIds,
          });
        }
      }
    }
    await ctx.db.delete(args.golferId);
    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: replacedCount > 0 ? replacedCount : undefined,
      deletedData: deletedGolferData,
    };
  },
});

/**
 * Admin tool: ensure golfer names are unique by merging duplicates.
 *
 * - Groups golfers by normalized `playerName` (case/whitespace insensitive)
 * - Picks one golfer per group to keep (prefers most references / completeness)
 * - Rewrites references in `tournamentGolfers.golferId`
 * - Rewrites references in `teams.golferIds` (apiId array)
 * - Deletes the duplicate golfer docs
 */
export const adminDedupeGolfersByName = mutation({
  args: golfersValidators.args.adminDedupeGolfersByName,
  handler: async (ctx, args): Promise<DedupeResult> => {
    const clerkId = args.clerkId.trim();
    if (!clerkId) throw new Error("Unauthorized: You must be signed in");

    const identity = await ctx.auth.getUserIdentity();
    if (identity && identity.subject !== clerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
    const role = member?.role?.trim().toLowerCase() ?? "";
    if (role !== "admin" && role !== "moderator") {
      throw new Error("Forbidden: Moderator or admin access required");
    }

    const golfers = await ctx.db.query("golfers").collect();

    const groups = new Map<string, typeof golfers>();
    for (const g of golfers) {
      const key = normalizeGolferName(g.playerName);
      const existing = groups.get(key);
      if (existing) existing.push(g);
      else groups.set(key, [g]);
    }
    const teamsPage = await ctx.db
      .query("teams")
      .paginate({ cursor: null, numItems: 5000 });

    if (!teamsPage.isDone) {
      console.warn(
        "[golfer analytics] Database has >5000 teams. Usage statistics based on first 5000 only.",
      );
    }

    const teamUsageByApiId = new Map<number, number>();
    for (const team of teamsPage.page) {
      for (const apiId of team.golferIds) {
        teamUsageByApiId.set(apiId, (teamUsageByApiId.get(apiId) ?? 0) + 1);
      }
    }

    let duplicateGroups = 0;
    let kept = 0;
    let removed = 0;
    let updatedTournamentGolfers = 0;
    let updatedTeams = 0;

    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      duplicateGroups++;

      const tgCounts = new Map<Id<"golfers">, number>();
      for (const g of group) {
        const tgs = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer", (q) => q.eq("golferId", g._id))
          .collect();
        tgCounts.set(g._id, tgs.length);
      }

      const scored = group
        .map((g) => {
          const tgCount = tgCounts.get(g._id) ?? 0;
          const teamCount = teamUsageByApiId.get(g.apiId) ?? 0;
          const completeness =
            (g.country ? 1 : 0) + (g.worldRank !== undefined ? 1 : 0);
          const score = tgCount * 1000 + teamCount * 10 + completeness;
          return { g, score };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.g._creationTime !== b.g._creationTime)
            return a.g._creationTime - b.g._creationTime;
          return a.g.apiId - b.g.apiId;
        });

      const keep = scored[0]?.g;
      if (!keep) continue;
      kept++;

      for (const { g: dup } of scored.slice(1)) {
        const tgs = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer", (q) => q.eq("golferId", dup._id))
          .collect();
        for (const tg of tgs) {
          await ctx.db.patch(tg._id, {
            golferId: keep._id,
            updatedAt: Date.now(),
          });
          updatedTournamentGolfers++;
        }
        if (dup.apiId !== keep.apiId) {
          const allTeams = await ctx.db.query("teams").collect();
          for (const team of allTeams) {
            if (!team.golferIds.includes(dup.apiId)) continue;
            const next = team.golferIds
              .map((id: number) => (id === dup.apiId ? keep.apiId : id))
              .filter(
                (id: number, idx: number, arr: number[]) =>
                  arr.indexOf(id) === idx,
              );
            await ctx.db.patch(team._id, {
              golferIds: next,
              updatedAt: Date.now(),
            });
            updatedTeams++;
          }
        }

        await ctx.db.delete(dup._id);
        removed++;
      }
    }

    return {
      scanned: golfers.length,
      duplicateGroups,
      kept,
      removed,
      updatedTournamentGolfers,
      updatedTeams,
    };
  },
});
