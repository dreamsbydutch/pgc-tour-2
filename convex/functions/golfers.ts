/**
 * Golfers
 *
 * Simple CRUD operations for the `golfers` and `tournamentGolfers` tables.
 *
 * Read operations use an `options` object to keep the call surface small:
 * - `options.filter` narrows results (supports common fields).
 * - `options.sort` controls ordering.
 * - `options.pagination` supports `limit` + `offset`.
 *
 * Note: some filters/sorts are applied in-memory (after `collect()`), which is fine for admin tools
 * and small datasets but not ideal for large tables or hot paths.
 *
 * The three internal tournament/world-rank functions at the bottom of this file are kept as-is.
 */

import { internalMutation, mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireModerator } from "../utils/auth";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";

/**
 * Creates a golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - Enforces `apiId` uniqueness (via the `by_api_id` index).
 * - Trims `playerName` and optional `country`.
 * - Sets `updatedAt`.
 */
export const createGolfers = mutation({
  args: {
    data: v.object({
      apiId: v.number(),
      playerName: v.string(),
      country: v.optional(v.string()),
      worldRank: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const apiId = args.data.apiId;
    const playerName = args.data.playerName.trim();
    const country = args.data.country?.trim();
    const worldRank = args.data.worldRank;

    if (!Number.isFinite(apiId) || apiId <= 0) {
      throw new Error("API ID must be a positive number");
    }
    if (!playerName) {
      throw new Error("Player name is required");
    }

    const existing = await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
      .first();
    if (existing) {
      throw new Error(`Golfer with apiId ${apiId} already exists`);
    }

    const golferId = await ctx.db.insert("golfers", {
      apiId,
      playerName,
      ...(country ? { country } : {}),
      ...(typeof worldRank === "number" ? { worldRank } : {}),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(golferId);
  },
});

/**
 * Reads golfers.
 *
 * Inputs:
 * - `options.id`: fetch a single golfer by `_id`.
 * - `options.ids`: fetch many golfers by `_id` (returned in the same order as `ids`).
 * - `options.apiId`: fetch a single golfer by DataGolf id (`apiId`).
 * - `options.filter`: in-memory filtering when no direct lookup is provided.
 * - `options.sort`: in-memory sort of the resulting list.
 * - `options.pagination`: `offset` + `limit` slicing.
 *
 * Filter support (via `options.filter`):
 * - `apiId`, `playerName`, `country`, `worldRank`
 * - `minWorldRank`, `maxWorldRank`
 * - `searchTerm` (matches name/country/apiId)
 * - `createdAfter`, `createdBefore` (uses `_creationTime`)
 * - `updatedAfter`, `updatedBefore` (uses `updatedAt`)
 */
export const getGolfers = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("golfers")),
        ids: v.optional(v.array(v.id("golfers"))),
        apiId: v.optional(v.number()),
        filter: v.optional(
          v.object({
            apiId: v.optional(v.number()),
            playerName: v.optional(v.string()),
            country: v.optional(v.string()),
            worldRank: v.optional(v.number()),
            minWorldRank: v.optional(v.number()),
            maxWorldRank: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
            createdAfter: v.optional(v.number()),
            createdBefore: v.optional(v.number()),
            updatedAfter: v.optional(v.number()),
            updatedBefore: v.optional(v.number()),
          }),
        ),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("playerName"),
                v.literal("country"),
                v.literal("worldRank"),
                v.literal("apiId"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      if (options.ids.length === 0) return [];
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter((d): d is NonNullable<typeof d> => Boolean(d));
    }

    if (typeof options.apiId === "number") {
      return await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", options.apiId!))
        .first();
    }

    const filter = options.filter || {};
    const sort = options.sort || {};
    const pagination = options.pagination || {};

    let golfers = await ctx.db.query("golfers").collect();

    if (filter.apiId !== undefined) {
      golfers = golfers.filter((g) => g.apiId === filter.apiId);
    }
    if (typeof filter.playerName === "string" && filter.playerName.trim()) {
      const target = filter.playerName.trim().toLowerCase();
      golfers = golfers.filter((g) => g.playerName.toLowerCase() === target);
    }
    if (typeof filter.country === "string" && filter.country.trim()) {
      const target = filter.country.trim();
      golfers = golfers.filter((g) => (g.country ?? "") === target);
    }
    if (typeof filter.worldRank === "number") {
      golfers = golfers.filter((g) => g.worldRank === filter.worldRank);
    }
    if (typeof filter.minWorldRank === "number") {
      golfers = golfers.filter(
        (g) =>
          typeof g.worldRank === "number" &&
          g.worldRank >= filter.minWorldRank!,
      );
    }
    if (typeof filter.maxWorldRank === "number") {
      golfers = golfers.filter(
        (g) =>
          typeof g.worldRank === "number" &&
          g.worldRank <= filter.maxWorldRank!,
      );
    }
    if (typeof filter.searchTerm === "string" && filter.searchTerm.trim()) {
      const term = filter.searchTerm.trim().toLowerCase();
      golfers = golfers.filter((g) => {
        const haystack =
          `${g.playerName} ${g.country ?? ""} ${g.apiId}`.toLowerCase();
        return haystack.includes(term);
      });
    }
    if (typeof filter.createdAfter === "number") {
      golfers = golfers.filter((g) => g._creationTime >= filter.createdAfter!);
    }
    if (typeof filter.createdBefore === "number") {
      golfers = golfers.filter((g) => g._creationTime <= filter.createdBefore!);
    }
    if (typeof filter.updatedAfter === "number") {
      golfers = golfers.filter(
        (g) =>
          typeof g.updatedAt === "number" &&
          g.updatedAt >= filter.updatedAfter!,
      );
    }
    if (typeof filter.updatedBefore === "number") {
      golfers = golfers.filter(
        (g) =>
          typeof g.updatedAt === "number" &&
          g.updatedAt <= filter.updatedBefore!,
      );
    }

    const sortBy = sort.sortBy;
    const sortOrder = sort.sortOrder === "desc" ? "desc" : "asc";
    if (sortBy) {
      golfers = [...golfers].sort((a, b) => {
        const dir = sortOrder === "desc" ? -1 : 1;
        if (sortBy === "playerName") {
          return dir * a.playerName.localeCompare(b.playerName);
        }
        if (sortBy === "country") {
          return dir * (a.country ?? "").localeCompare(b.country ?? "");
        }
        if (sortBy === "worldRank") {
          return (
            dir *
            ((a.worldRank ?? Number.POSITIVE_INFINITY) -
              (b.worldRank ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "apiId") {
          return dir * (a.apiId - b.apiId);
        }
        if (sortBy === "createdAt") {
          return dir * (a._creationTime - b._creationTime);
        }
        if (sortBy === "updatedAt") {
          return dir * ((a.updatedAt ?? 0) - (b.updatedAt ?? 0));
        }
        return 0;
      });
    }

    const offset =
      typeof pagination.offset === "number" ? pagination.offset : 0;
    const limit =
      typeof pagination.limit === "number" ? pagination.limit : undefined;
    if (offset > 0 || limit !== undefined) {
      const start = Math.max(0, offset);
      const end = limit !== undefined ? start + Math.max(0, limit) : undefined;
      golfers = golfers.slice(start, end);
    }

    return golfers;
  },
});

/**
 * Gets golfers using cursor-based pagination.
 *
 * Purpose:
 * - This is the query used by the Admin golfers screen.
 *
 * Inputs:
 * - `paginationOpts`: Convex cursor pagination.
 * - `options.filter.apiId`: indexed lookup path (`by_api_id`).
 * - `options.filter.country` and `options.filter.searchTerm`: applied in-memory to the returned page.
 */
export const getGolfersPage = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
    options: v.optional(
      v.object({
        filter: v.optional(
          v.object({
            apiId: v.optional(v.number()),
            country: v.optional(v.string()),
            searchTerm: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const filter = args.options?.filter;

    if (typeof filter?.apiId === "number") {
      return await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", filter.apiId!))
        .paginate(args.paginationOpts);
    }

    const result = await ctx.db.query("golfers").paginate(args.paginationOpts);

    const country = filter?.country?.trim();
    const searchTerm = filter?.searchTerm?.trim().toLowerCase();
    if (!country && !searchTerm) return result;

    const filtered = result.page.filter((g) => {
      if (country && g.country !== country) return false;
      if (searchTerm) {
        const haystack = `${g.playerName} ${g.country ?? ""}`.toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });

    return { ...result, page: filtered };
  },
});

/**
 * Updates a golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - Applies only provided fields.
 * - Trims `playerName` / `country` when present.
 * - Always updates `updatedAt` when a change is applied.
 */
export const updateGolfers = mutation({
  args: {
    golferId: v.id("golfers"),
    data: v.object({
      playerName: v.optional(v.string()),
      country: v.optional(v.string()),
      worldRank: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db.get(args.golferId);
    if (!existing) {
      throw new Error("Golfer not found");
    }

    const patch: Partial<Doc<"golfers">> & { updatedAt: number } = {
      updatedAt: Date.now(),
    };

    if (typeof args.data.playerName === "string") {
      const playerName = args.data.playerName.trim();
      if (!playerName) throw new Error("Player name cannot be empty");
      patch.playerName = playerName;
    }
    if (typeof args.data.country === "string") {
      const country = args.data.country.trim();
      patch.country = country || undefined;
    }
    if (typeof args.data.worldRank === "number") {
      patch.worldRank = args.data.worldRank;
    }

    const keys = Object.keys(patch);
    if (keys.length === 1) {
      return existing;
    }

    await ctx.db.patch(args.golferId, patch);
    return await ctx.db.get(args.golferId);
  },
});

/**
 * Deletes a golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - If the golfer does not exist, returns `{ success: true, deleted: false }`.
 * - Does not currently cascade into `tournamentGolfers`.
 */
export const deleteGolfers = mutation({
  args: {
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db.get(args.golferId);
    if (!existing) {
      return { success: true, deleted: false } as const;
    }

    await ctx.db.delete(args.golferId);
    return { success: true, deleted: true } as const;
  },
});

/**
 * Creates a tournament golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - Enforces uniqueness per (`golferId`, `tournamentId`) using the `by_golfer_tournament` index.
 * - Sets `updatedAt`.
 */
export const createTournamentGolfers = mutation({
  args: {
    data: v.object({
      golferId: v.id("golfers"),
      tournamentId: v.id("tournaments"),
      group: v.optional(v.number()),
      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_golfer_tournament", (q) =>
        q
          .eq("golferId", args.data.golferId)
          .eq("tournamentId", args.data.tournamentId),
      )
      .first();
    if (existing) {
      throw new Error("Tournament golfer already exists for this golfer");
    }

    const id = await ctx.db.insert("tournamentGolfers", {
      ...args.data,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

/**
 * Reads tournament golfers.
 *
 * This is the main “get” query for the `tournamentGolfers` table.
 *
 * @param args.options.id Fetch a single tournament golfer by `_id`.
 * @param args.options.ids Fetch many tournament golfers by `_id` (returned in the same order as `ids`).
 * @param args.options.filter In-memory filtering when no direct lookup is provided.
 * @param args.options.sort In-memory sort of the resulting list.
 * @param args.options.pagination Offset/limit slicing.
 * @returns A single doc, an array of docs, or an empty array depending on input.
 */
export const getTournamentGolfers = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tournamentGolfers")),
        ids: v.optional(v.array(v.id("tournamentGolfers"))),
        filter: v.optional(
          v.object({
            tournamentId: v.optional(v.id("tournaments")),
            golferId: v.optional(v.id("golfers")),
            position: v.optional(v.string()),
            group: v.optional(v.number()),
            round: v.optional(v.number()),
            thru: v.optional(v.number()),
            endHole: v.optional(v.number()),
            worldRank: v.optional(v.number()),
            rating: v.optional(v.number()),
            usage: v.optional(v.number()),
            minScore: v.optional(v.number()),
            maxScore: v.optional(v.number()),
            updatedAfter: v.optional(v.number()),
            updatedBefore: v.optional(v.number()),
          }),
        ),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("position"),
                v.literal("score"),
                v.literal("today"),
                v.literal("worldRank"),
                v.literal("rating"),
                v.literal("group"),
                v.literal("round"),
                v.literal("updatedAt"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      if (options.ids.length === 0) return [];
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter((d): d is NonNullable<typeof d> => Boolean(d));
    }

    const filter = options.filter || {};
    const sort = options.sort || {};
    const pagination = options.pagination || {};

    let rows = await ctx.db.query("tournamentGolfers").collect();

    if (filter.tournamentId) {
      rows = rows.filter((r) => r.tournamentId === filter.tournamentId);
    }
    if (filter.golferId) {
      rows = rows.filter((r) => r.golferId === filter.golferId);
    }
    if (typeof filter.position === "string" && filter.position.trim()) {
      const target = filter.position.trim();
      rows = rows.filter((r) => r.position === target);
    }
    if (typeof filter.group === "number") {
      rows = rows.filter((r) => r.group === filter.group);
    }
    if (typeof filter.round === "number") {
      rows = rows.filter((r) => r.round === filter.round);
    }
    if (typeof filter.thru === "number") {
      rows = rows.filter((r) => r.thru === filter.thru);
    }
    if (typeof filter.endHole === "number") {
      rows = rows.filter((r) => r.endHole === filter.endHole);
    }
    if (typeof filter.worldRank === "number") {
      rows = rows.filter((r) => r.worldRank === filter.worldRank);
    }
    if (typeof filter.rating === "number") {
      rows = rows.filter((r) => r.rating === filter.rating);
    }
    if (typeof filter.usage === "number") {
      rows = rows.filter((r) => r.usage === filter.usage);
    }
    if (typeof filter.minScore === "number") {
      rows = rows.filter(
        (r) => typeof r.score === "number" && r.score >= filter.minScore!,
      );
    }
    if (typeof filter.maxScore === "number") {
      rows = rows.filter(
        (r) => typeof r.score === "number" && r.score <= filter.maxScore!,
      );
    }
    if (typeof filter.updatedAfter === "number") {
      rows = rows.filter(
        (r) =>
          typeof r.updatedAt === "number" &&
          r.updatedAt >= filter.updatedAfter!,
      );
    }
    if (typeof filter.updatedBefore === "number") {
      rows = rows.filter(
        (r) =>
          typeof r.updatedAt === "number" &&
          r.updatedAt <= filter.updatedBefore!,
      );
    }

    const sortBy = sort.sortBy;
    const sortOrder = sort.sortOrder === "desc" ? "desc" : "asc";
    if (sortBy) {
      rows = [...rows].sort((a, b) => {
        const dir = sortOrder === "desc" ? -1 : 1;
        if (sortBy === "position") {
          return dir * (a.position ?? "").localeCompare(b.position ?? "");
        }
        if (sortBy === "score") {
          return (
            dir *
            ((a.score ?? Number.POSITIVE_INFINITY) -
              (b.score ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "today") {
          return (
            dir *
            ((a.today ?? Number.POSITIVE_INFINITY) -
              (b.today ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "worldRank") {
          return (
            dir *
            ((a.worldRank ?? Number.POSITIVE_INFINITY) -
              (b.worldRank ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "rating") {
          return (
            dir *
            ((a.rating ?? Number.NEGATIVE_INFINITY) -
              (b.rating ?? Number.NEGATIVE_INFINITY))
          );
        }
        if (sortBy === "group") {
          return dir * ((a.group ?? 0) - (b.group ?? 0));
        }
        if (sortBy === "round") {
          return dir * ((a.round ?? 0) - (b.round ?? 0));
        }
        if (sortBy === "updatedAt") {
          return dir * ((a.updatedAt ?? 0) - (b.updatedAt ?? 0));
        }
        return 0;
      });
    }

    const offset =
      typeof pagination.offset === "number" ? pagination.offset : 0;
    const limit =
      typeof pagination.limit === "number" ? pagination.limit : undefined;
    if (offset > 0 || limit !== undefined) {
      const start = Math.max(0, offset);
      const end = limit !== undefined ? start + Math.max(0, limit) : undefined;
      rows = rows.slice(start, end);
    }

    return rows;
  },
});

/**
 * Reads “enhanced golfers” for a given tournament.
 *
 * An enhanced golfer is a single object that merges:
 * - the base `golfers` fields (identity, name, country, OWGR), and
 * - the per-tournament `tournamentGolfers` fields (position/score/live stats/group/etc).
 *
 * This query is tournament-scoped: it starts from `tournamentGolfers` rows for `tournamentId`
 * and joins the referenced `golfers` docs.
 *
 * Options:
 * - `options.filter`: same fields as `getGolfers` filtering.
 * - `options.tournamentFilter`: common `tournamentGolfers` filters.
 * - `options.sort`: sort by golfer fields or tournament fields.
 * - `options.pagination`: `offset` + `limit`.
 *
 * Notes:
 * - `tournamentWorldRank` and `tournamentUpdatedAt` are provided to avoid name collisions with
 *   `golfers.worldRank` and `golfers.updatedAt`.
 */
export const getEnhancedGolfers = query({
  args: {
    options: v.object({
      tournamentId: v.id("tournaments"),
      filter: v.optional(
        v.object({
          apiId: v.optional(v.number()),
          playerName: v.optional(v.string()),
          country: v.optional(v.string()),
          worldRank: v.optional(v.number()),
          minWorldRank: v.optional(v.number()),
          maxWorldRank: v.optional(v.number()),
          searchTerm: v.optional(v.string()),
          createdAfter: v.optional(v.number()),
          createdBefore: v.optional(v.number()),
          updatedAfter: v.optional(v.number()),
          updatedBefore: v.optional(v.number()),
        }),
      ),
      tournamentFilter: v.optional(
        v.object({
          position: v.optional(v.string()),
          group: v.optional(v.number()),
          round: v.optional(v.number()),
          thru: v.optional(v.number()),
          endHole: v.optional(v.number()),
          rating: v.optional(v.number()),
          usage: v.optional(v.number()),
          minScore: v.optional(v.number()),
          maxScore: v.optional(v.number()),
          updatedAfter: v.optional(v.number()),
          updatedBefore: v.optional(v.number()),
        }),
      ),
      sort: v.optional(
        v.object({
          sortBy: v.optional(
            v.union(
              v.literal("playerName"),
              v.literal("country"),
              v.literal("worldRank"),
              v.literal("apiId"),
              v.literal("createdAt"),
              v.literal("updatedAt"),
              v.literal("position"),
              v.literal("score"),
              v.literal("today"),
              v.literal("rating"),
              v.literal("group"),
              v.literal("round"),
              v.literal("tournamentUpdatedAt"),
            ),
          ),
          sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
        }),
      ),
      pagination: v.optional(
        v.object({
          limit: v.optional(v.number()),
          offset: v.optional(v.number()),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const options = args.options;
    const tournamentId = options.tournamentId;

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    const uniqueGolferIds = Array.from(
      new Set(tournamentGolfers.map((tg) => tg.golferId)),
    );
    const golferDocs = await Promise.all(
      uniqueGolferIds.map((id) => ctx.db.get(id)),
    );

    const golfersById = new Map(
      golferDocs
        .filter((g): g is NonNullable<typeof g> => Boolean(g))
        .map((g) => [g._id, g] as const),
    );

    const enhanced = tournamentGolfers
      .map((tg) => {
        const golfer = golfersById.get(tg.golferId);
        if (!golfer) return null;

        const {
          _id: tournamentGolferId,
          worldRank: tournamentWorldRank,
          updatedAt: tournamentUpdatedAt,
          ...tgRest
        } = tg;

        return {
          ...golfer,
          ...tgRest,
          tournamentGolferId,
          ...(typeof tournamentWorldRank === "number"
            ? { tournamentWorldRank }
            : {}),
          ...(typeof tournamentUpdatedAt === "number"
            ? { tournamentUpdatedAt }
            : {}),
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    const golferFilter = options.filter;
    const tgFilter = options.tournamentFilter;
    let rows = enhanced;

    if (golferFilter) {
      if (typeof golferFilter.apiId === "number") {
        rows = rows.filter((r) => r.apiId === golferFilter.apiId);
      }
      if (
        typeof golferFilter.playerName === "string" &&
        golferFilter.playerName.trim()
      ) {
        const target = golferFilter.playerName.trim().toLowerCase();
        rows = rows.filter((r) => r.playerName.toLowerCase() === target);
      }
      if (
        typeof golferFilter.country === "string" &&
        golferFilter.country.trim()
      ) {
        const target = golferFilter.country.trim();
        rows = rows.filter((r) => (r.country ?? "") === target);
      }
      if (typeof golferFilter.worldRank === "number") {
        rows = rows.filter((r) => r.worldRank === golferFilter.worldRank);
      }
      if (typeof golferFilter.minWorldRank === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.worldRank === "number" &&
            r.worldRank >= golferFilter.minWorldRank!,
        );
      }
      if (typeof golferFilter.maxWorldRank === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.worldRank === "number" &&
            r.worldRank <= golferFilter.maxWorldRank!,
        );
      }
      if (
        typeof golferFilter.searchTerm === "string" &&
        golferFilter.searchTerm.trim()
      ) {
        const term = golferFilter.searchTerm.trim().toLowerCase();
        rows = rows.filter((r) => {
          const haystack =
            `${r.playerName} ${r.country ?? ""} ${r.apiId}`.toLowerCase();
          return haystack.includes(term);
        });
      }
      if (typeof golferFilter.createdAfter === "number") {
        rows = rows.filter(
          (r) => r._creationTime >= golferFilter.createdAfter!,
        );
      }
      if (typeof golferFilter.createdBefore === "number") {
        rows = rows.filter(
          (r) => r._creationTime <= golferFilter.createdBefore!,
        );
      }
      if (typeof golferFilter.updatedAfter === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.updatedAt === "number" &&
            r.updatedAt >= golferFilter.updatedAfter!,
        );
      }
      if (typeof golferFilter.updatedBefore === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.updatedAt === "number" &&
            r.updatedAt <= golferFilter.updatedBefore!,
        );
      }
    }

    if (tgFilter) {
      if (typeof tgFilter.position === "string" && tgFilter.position.trim()) {
        const target = tgFilter.position.trim();
        rows = rows.filter((r) => r.position === target);
      }
      if (typeof tgFilter.group === "number") {
        rows = rows.filter((r) => r.group === tgFilter.group);
      }
      if (typeof tgFilter.round === "number") {
        rows = rows.filter((r) => r.round === tgFilter.round);
      }
      if (typeof tgFilter.thru === "number") {
        rows = rows.filter((r) => r.thru === tgFilter.thru);
      }
      if (typeof tgFilter.endHole === "number") {
        rows = rows.filter((r) => r.endHole === tgFilter.endHole);
      }
      if (typeof tgFilter.rating === "number") {
        rows = rows.filter((r) => r.rating === tgFilter.rating);
      }
      if (typeof tgFilter.usage === "number") {
        rows = rows.filter((r) => r.usage === tgFilter.usage);
      }
      if (typeof tgFilter.minScore === "number") {
        rows = rows.filter(
          (r) => typeof r.score === "number" && r.score >= tgFilter.minScore!,
        );
      }
      if (typeof tgFilter.maxScore === "number") {
        rows = rows.filter(
          (r) => typeof r.score === "number" && r.score <= tgFilter.maxScore!,
        );
      }
      if (typeof tgFilter.updatedAfter === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.tournamentUpdatedAt === "number" &&
            r.tournamentUpdatedAt >= tgFilter.updatedAfter!,
        );
      }
      if (typeof tgFilter.updatedBefore === "number") {
        rows = rows.filter(
          (r) =>
            typeof r.tournamentUpdatedAt === "number" &&
            r.tournamentUpdatedAt <= tgFilter.updatedBefore!,
        );
      }
    }

    const sortBy = options.sort?.sortBy;
    const sortOrder = options.sort?.sortOrder === "desc" ? "desc" : "asc";
    if (sortBy) {
      rows = [...rows].sort((a, b) => {
        const dir = sortOrder === "desc" ? -1 : 1;
        if (sortBy === "playerName")
          return dir * a.playerName.localeCompare(b.playerName);
        if (sortBy === "country")
          return dir * (a.country ?? "").localeCompare(b.country ?? "");
        if (sortBy === "worldRank") {
          return (
            dir *
            ((a.worldRank ?? Number.POSITIVE_INFINITY) -
              (b.worldRank ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "apiId") return dir * (a.apiId - b.apiId);
        if (sortBy === "createdAt")
          return dir * (a._creationTime - b._creationTime);
        if (sortBy === "updatedAt")
          return dir * ((a.updatedAt ?? 0) - (b.updatedAt ?? 0));
        if (sortBy === "position")
          return dir * (a.position ?? "").localeCompare(b.position ?? "");
        if (sortBy === "score") {
          return (
            dir *
            ((a.score ?? Number.POSITIVE_INFINITY) -
              (b.score ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "today") {
          return (
            dir *
            ((a.today ?? Number.POSITIVE_INFINITY) -
              (b.today ?? Number.POSITIVE_INFINITY))
          );
        }
        if (sortBy === "rating") {
          return (
            dir *
            ((a.rating ?? Number.NEGATIVE_INFINITY) -
              (b.rating ?? Number.NEGATIVE_INFINITY))
          );
        }
        if (sortBy === "group") return dir * ((a.group ?? 0) - (b.group ?? 0));
        if (sortBy === "round") return dir * ((a.round ?? 0) - (b.round ?? 0));
        if (sortBy === "tournamentUpdatedAt") {
          return (
            dir * ((a.tournamentUpdatedAt ?? 0) - (b.tournamentUpdatedAt ?? 0))
          );
        }
        return 0;
      });
    }

    const offset =
      typeof options.pagination?.offset === "number"
        ? options.pagination.offset
        : 0;
    const limit =
      typeof options.pagination?.limit === "number"
        ? options.pagination.limit
        : undefined;
    if (offset > 0 || limit !== undefined) {
      const start = Math.max(0, offset);
      const end = limit !== undefined ? start + Math.max(0, limit) : undefined;
      rows = rows.slice(start, end);
    }

    return rows;
  },
});

/**
 * Updates a tournament golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - Applies only provided fields.
 * - Always sets `updatedAt`.
 */
export const updateTournamentGolfers = mutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
    data: v.object({
      position: v.optional(v.string()),
      score: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      endHole: v.optional(v.number()),
      group: v.optional(v.number()),
      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.string()),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.string()),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.string()),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.string()),
      roundFour: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db.get(args.tournamentGolferId);
    if (!existing) throw new Error("Tournament golfer not found");

    await ctx.db.patch(args.tournamentGolferId, {
      ...args.data,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.tournamentGolferId);
  },
});

/**
 * Deletes a tournament golfer.
 *
 * Access:
 * - Requires moderator/admin.
 *
 * Behavior:
 * - If the doc does not exist, returns `{ success: true, deleted: false }`.
 */
export const deleteTournamentGolfers = mutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db.get(args.tournamentGolferId);
    if (!existing) {
      return { success: true, deleted: false } as const;
    }
    await ctx.db.delete(args.tournamentGolferId);
    return { success: true, deleted: true } as const;
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
export const createTournamentGolfersForTournament = internalMutation({
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
            r1TeeTime: v.optional(v.string()),
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

        if (existingGolfer) {
          const normalized = normalizePlayerNameFromDataGolf(
            existingGolfer.playerName,
          );
          if (normalized !== existingGolfer.playerName) {
            await ctx.db.patch(existingGolfer._id, {
              playerName: normalized,
              updatedAt: Date.now(),
            });
          }
        }

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
          await ctx.db.insert("tournamentGolfers", {
            golferId,
            tournamentId: args.tournamentId,
            group: group.groupNumber,
            worldRank: g.worldRank ?? 501,
            rating,
            ...(typeof g.r1TeeTime === "string"
              ? { roundOneTeeTime: g.r1TeeTime }
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

/**
 * Finalizes `tournamentGolfers` for a completed tournament by applying the provided scorecard updates.
 *
 * Behavior:
 * - Requires the tournament to exist and have `status === "completed"`.
 * - Looks up each golfer by `golferApiId` (matches `golfers.apiId`), then patches the matching
 *   (`golferId`, `tournamentId`) row in `tournamentGolfers`.
 * - Marks the row as finished (`thru: 18`, `endHole: 18`, `round: 5`).
 *
 * @param args.tournamentId Tournament id.
 * @param args.updates Update list keyed by golfer API id.
 * @returns `{ updated }` count.
 */
export const finalizeTournamentGolfersForCompletedTournament = internalMutation(
  {
    args: v.object({
      tournamentId: v.id("tournaments"),
      updates: v.array(
        v.object({
          golferApiId: v.number(),
          position: v.union(v.null(), v.string()),
          roundOne: v.union(v.null(), v.number()),
          roundTwo: v.union(v.null(), v.number()),
          roundThree: v.union(v.null(), v.number()),
          roundFour: v.union(v.null(), v.number()),
          score: v.union(v.null(), v.number()),
          today: v.union(v.null(), v.number()),
        }),
      ),
    }),
    handler: async (ctx, args) => {
      const tournament = await ctx.db.get(args.tournamentId);
      if (!tournament) {
        throw new Error("Tournament not found for updating tournament golfers");
      }
      if (tournament.status !== "completed") {
        throw new Error(
          "Tournament must be completed to finalize tournament golfers",
        );
      }
      let updated = 0;

      for (const u of args.updates) {
        const golfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", u.golferApiId))
          .first();
        if (!golfer) continue;

        const tg = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer_tournament", (q) =>
            q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
          )
          .first();
        if (!tg) continue;

        await ctx.db.patch(tg._id, {
          ...(u.position ? { position: u.position } : {}),
          ...(typeof u.roundOne === "number" ? { roundOne: u.roundOne } : {}),
          ...(typeof u.roundTwo === "number" ? { roundTwo: u.roundTwo } : {}),
          ...(typeof u.roundThree === "number"
            ? { roundThree: u.roundThree }
            : {}),
          ...(typeof u.roundFour === "number"
            ? { roundFour: u.roundFour }
            : {}),
          ...(typeof u.score === "number" ? { score: u.score } : {}),
          ...(typeof u.today === "number" ? { today: u.today } : {}),
          thru: 18,
          endHole: 18,
          round: 5,
          updatedAt: Date.now(),
        });

        updated += 1;
      }

      return { updated };
    },
  },
);

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
