import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { getCurrentMember, requireAdmin } from "../utils/auth";
import { omitUndefined } from "../utils/_shared/object";
import {
  findCurrentSeason,
  getCurrentSeasonId,
  listSeasons,
} from "../utils/seasons";
import type {
  TeamCreatePayload,
  TeamImportRow,
  TeamPaginationOptions,
  TeamQueryOptions,
  TeamSortOptions,
  TeamUpdatePayload,
} from "../types/teams";

type TeamFunctionContext = MutationCtx | QueryCtx;

const teamCreateDataValidator = v.object({
  tournamentId: v.id("tournaments"),
  tourCardId: v.id("tourCards"),
  golferIds: v.array(v.number()),
  earnings: v.optional(v.number()),
  points: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  position: v.optional(v.string()),
  pastPosition: v.optional(v.string()),
  score: v.optional(v.number()),
  topTen: v.optional(v.number()),
  topFive: v.optional(v.number()),
  topThree: v.optional(v.number()),
  win: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  round: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
  roundOne: v.optional(v.number()),
  roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
  roundTwo: v.optional(v.number()),
  roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
  roundThree: v.optional(v.number()),
  roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
  roundFour: v.optional(v.number()),
});

const teamUpdateObjectValidator = v.object({
  _id: v.id("teams"),
  tournamentId: v.optional(v.id("tournaments")),
  tourCardId: v.optional(v.id("tourCards")),
  golferIds: v.optional(v.array(v.number())),
  earnings: v.optional(v.number()),
  points: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  position: v.optional(v.string()),
  pastPosition: v.optional(v.string()),
  score: v.optional(v.number()),
  topTen: v.optional(v.number()),
  topFive: v.optional(v.number()),
  topThree: v.optional(v.number()),
  win: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  round: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
  roundOne: v.optional(v.number()),
  roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
  roundTwo: v.optional(v.number()),
  roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
  roundThree: v.optional(v.number()),
  roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
  roundFour: v.optional(v.number()),
});

const getTeamsOptionsValidator = v.optional(
  v.object({
    filter: v.optional(
      v.object({
        tournamentId: v.optional(v.id("tournaments")),
        tourCardId: v.optional(v.id("tourCards")),
        seasonId: v.optional(v.id("seasons")),
      }),
    ),
    sort: v.optional(
      v.object({
        sortBy: v.optional(
          v.union(
            v.literal("createdAt"),
            v.literal("points"),
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
);

const USER_CREATE_ALLOWED_FIELDS = new Set([
  "tournamentId",
  "tourCardId",
  "golferIds",
]);
const USER_UPDATE_ALLOWED_FIELDS = new Set(["_id", "golferIds"]);

// Level 1: read and validation helpers

/** Returns whether the current caller is authenticated. */
async function isSignedIn(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return Boolean(identity?.subject);
}

/** Normalizes golfer ids and rejects duplicate roster entries. */
function normalizeGolferIds(golferIds: number[]) {
  const uniqueGolferIds = [...new Set(golferIds)];

  if (uniqueGolferIds.length !== golferIds.length) {
    throw new Error("Team golferIds must be unique");
  }

  return uniqueGolferIds;
}

/** Returns whether a payload only contains the allowed fields for the current caller. */
function hasOnlyAllowedFields(
  data: Record<string, unknown>,
  allowedFields: Set<string>,
) {
  return Object.keys(data).every((field) => allowedFields.has(field));
}

/** Loads all teams for a list of tournament ids. */
async function listTeamsByTournamentIds(
  ctx: QueryCtx,
  tournamentIds: Id<"tournaments">[],
) {
  const teamLists = await Promise.all(
    tournamentIds.map((tournamentId) =>
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .collect(),
    ),
  );

  return teamLists.flat();
}

/** Filters teams down to one season by looking up their tournament rows. */
async function filterTeamsBySeason(
  ctx: TeamFunctionContext,
  teams: Doc<"teams">[],
  seasonId: Id<"seasons">,
) {
  const tournamentIds = [...new Set(teams.map((team) => team.tournamentId))];
  const tournaments = await Promise.all(
    tournamentIds.map((tournamentId) => ctx.db.get(tournamentId)),
  );
  const seasonByTournamentId = new Map<Id<"tournaments">, Id<"seasons">>();

  for (const tournament of tournaments) {
    if (tournament) {
      seasonByTournamentId.set(tournament._id, tournament.seasonId);
    }
  }

  return teams.filter(
    (team) => seasonByTournamentId.get(team.tournamentId) === seasonId,
  );
}

/** Sorts teams by creation time, points, or update time. */
function sortTeams(teams: Doc<"teams">[], sort: TeamSortOptions = {}) {
  const sortBy = sort.sortBy ?? "updatedAt";
  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  return [...teams].sort((a, b) => {
    if (sortBy === "createdAt") {
      return (a._creationTime - b._creationTime) * sortOrder;
    }

    if (sortBy === "points") {
      return ((a.points ?? 0) - (b.points ?? 0)) * sortOrder;
    }

    return ((a.updatedAt ?? 0) - (b.updatedAt ?? 0)) * sortOrder;
  });
}

/** Applies offset and limit pagination to a team list. */
function paginateTeams(
  teams: Doc<"teams">[],
  pagination: TeamPaginationOptions = {},
) {
  const offset = Math.max(0, pagination.offset ?? 0);
  const limit =
    pagination.limit && pagination.limit > 0 ? pagination.limit : teams.length;

  return teams.slice(offset, offset + limit);
}

/** Returns one team or throws when it does not exist. */
async function getTeamOrThrow(ctx: TeamFunctionContext, teamId: Id<"teams">) {
  const team = await ctx.db.get(teamId);

  if (!team) {
    throw new Error("Team not found");
  }

  return team;
}

/** Returns whether a team belongs to a season that the current caller may read. */
async function canReadTeam(ctx: QueryCtx, teamId: Id<"teams">) {
  if (await isSignedIn(ctx)) {
    return true;
  }

  const currentSeasonId = await getCurrentSeasonId(ctx);
  if (!currentSeasonId) {
    return false;
  }

  const team = await ctx.db.get(teamId);
  if (!team) {
    return false;
  }

  const tournament = await ctx.db.get(team.tournamentId);
  return tournament?.seasonId === currentSeasonId;
}

/** Resolves the teams visible to the current caller under the requested filters. */
async function getTeamsForOptions(
  ctx: QueryCtx,
  options: TeamQueryOptions = {},
) {
  const filter = options.filter ?? {};
  const sort = options.sort ?? {};
  const pagination = options.pagination ?? {};
  const signedIn = await isSignedIn(ctx);
  const currentSeasonId = signedIn ? null : await getCurrentSeasonId(ctx);

  if (!signedIn && !currentSeasonId) {
    return [];
  }

  if (!signedIn && filter.seasonId && filter.seasonId !== currentSeasonId) {
    return [];
  }

  if (!signedIn && filter.tournamentId) {
    const tournament = await ctx.db.get(filter.tournamentId);
    if (!tournament || tournament.seasonId !== currentSeasonId) {
      return [];
    }
  }

  if (!signedIn && filter.tourCardId) {
    const tourCard = await ctx.db.get(filter.tourCardId);
    if (!tourCard || tourCard.seasonId !== currentSeasonId) {
      return [];
    }
  }

  let teams: Doc<"teams">[];

  if (filter.tournamentId) {
    teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", filter.tournamentId!),
      )
      .collect();
  } else if (filter.tourCardId) {
    teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", filter.tourCardId!))
      .collect();
  } else {
    const effectiveSeasonId = signedIn
      ? filter.seasonId
      : (currentSeasonId ?? undefined);

    if (effectiveSeasonId) {
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", effectiveSeasonId))
        .collect();
      teams = await listTeamsByTournamentIds(
        ctx,
        tournaments.map((tournament) => tournament._id),
      );
    } else {
      teams = await ctx.db.query("teams").collect();
    }
  }

  if (filter.tournamentId && filter.tourCardId) {
    teams = teams.filter((team) => team.tourCardId === filter.tourCardId);
  }

  if (filter.seasonId && !filter.tournamentId) {
    teams = await filterTeamsBySeason(ctx, teams, filter.seasonId);
  }

  const sortedTeams = sortTeams(teams, sort);
  return paginateTeams(sortedTeams, pagination);
}

// Level 2: write helpers

/** Validates that a tournament and tour card belong to the same season and remain unique as a team pair. */
async function validateTeamLinks(
  ctx: MutationCtx,
  args: {
    tournamentId: Id<"tournaments">;
    tourCardId: Id<"tourCards">;
    excludeTeamId?: Id<"teams">;
  },
) {
  const [tournament, tourCard] = await Promise.all([
    ctx.db.get(args.tournamentId),
    ctx.db.get(args.tourCardId),
  ]);

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (!tourCard) {
    throw new Error("Tour card not found");
  }

  if (tournament.seasonId !== tourCard.seasonId) {
    throw new Error("Tournament and tour card must belong to the same season");
  }

  const existingTeam = await ctx.db
    .query("teams")
    .withIndex("by_tournament_tour_card", (q) =>
      q.eq("tournamentId", args.tournamentId).eq("tourCardId", args.tourCardId),
    )
    .first();

  if (existingTeam && existingTeam._id !== args.excludeTeamId) {
    throw new Error("Only one team is allowed per tour card per tournament");
  }

  return {
    tournament,
    tourCard,
    existingTeam,
  };
}

/** Enforces owner-or-admin write access for a team. */
async function requireTeamWriteAccess(ctx: MutationCtx, team: Doc<"teams">) {
  const actingMember = await getCurrentMember(ctx);
  const tourCard = await ctx.db.get(team.tourCardId);

  if (!tourCard) {
    throw new Error("Tour card not found");
  }

  const isAdmin = actingMember.role === "admin";

  if (!isAdmin && tourCard.memberId !== actingMember._id) {
    throw new Error("Forbidden: You can only manage your own team");
  }

  return {
    isAdmin,
    tourCard,
  };
}

/** Creates one team after validating its tournament, tour card, and roster state. */
async function createTeamRecord(ctx: MutationCtx, data: TeamCreatePayload) {
  const normalizedGolferIds = normalizeGolferIds(data.golferIds);
  const now = Date.now();

  const teamId = await ctx.db.insert("teams", {
    tournamentId: data.tournamentId,
    tourCardId: data.tourCardId,
    golferIds: normalizedGolferIds,
    ...omitUndefined({
      earnings: data.earnings,
      points: data.points,
      makeCut: data.makeCut,
      position: data.position,
      pastPosition: data.pastPosition,
      score: data.score,
      topTen: data.topTen,
      topFive: data.topFive,
      topThree: data.topThree,
      win: data.win,
      today: data.today,
      thru: data.thru,
      round: data.round,
      roundOneTeeTime: data.roundOneTeeTime,
      roundOne: data.roundOne,
      roundTwoTeeTime: data.roundTwoTeeTime,
      roundTwo: data.roundTwo,
      roundThreeTeeTime: data.roundThreeTeeTime,
      roundThree: data.roundThree,
      roundFourTeeTime: data.roundFourTeeTime,
      roundFour: data.roundFour,
      updatedAt: now,
      updatedRosterAt: now,
    }),
  });

  return await ctx.db.get(teamId);
}

/** Updates one team with either owner-safe roster changes or admin-safe full patches. */
async function updateTeamRecord(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  data: TeamUpdatePayload,
  options: { allowRestrictedFields: boolean },
) {
  const existingTeam = await getTeamOrThrow(ctx, teamId);
  const now = Date.now();
  const patch: Partial<Doc<"teams">> = {
    updatedAt: now,
  };

  if (data.golferIds !== undefined) {
    patch.golferIds = normalizeGolferIds(data.golferIds);
    patch.updatedRosterAt = now;
  }

  if (options.allowRestrictedFields) {
    Object.assign(
      patch,
      omitUndefined({
        tournamentId: data.tournamentId,
        tourCardId: data.tourCardId,
        earnings: data.earnings,
        points: data.points,
        makeCut: data.makeCut,
        position: data.position,
        pastPosition: data.pastPosition,
        score: data.score,
        topTen: data.topTen,
        topFive: data.topFive,
        topThree: data.topThree,
        win: data.win,
        today: data.today,
        thru: data.thru,
        round: data.round,
        roundOneTeeTime: data.roundOneTeeTime,
        roundOne: data.roundOne,
        roundTwoTeeTime: data.roundTwoTeeTime,
        roundTwo: data.roundTwo,
        roundThreeTeeTime: data.roundThreeTeeTime,
        roundThree: data.roundThree,
        roundFourTeeTime: data.roundFourTeeTime,
        roundFour: data.roundFour,
      }),
    );
  }

  const nextTournamentId = patch.tournamentId ?? existingTeam.tournamentId;
  const nextTourCardId = patch.tourCardId ?? existingTeam.tourCardId;

  if (
    nextTournamentId !== existingTeam.tournamentId ||
    nextTourCardId !== existingTeam.tourCardId
  ) {
    await validateTeamLinks(ctx, {
      tournamentId: nextTournamentId,
      tourCardId: nextTourCardId,
      excludeTeamId: existingTeam._id,
    });
  }

  await ctx.db.patch(teamId, omitUndefined(patch));

  return await ctx.db.get(teamId);
}

/** Updates only the roster fields for one team. */
async function updateTeamRosterRecord(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  golferIds: number[],
) {
  return await updateTeamRecord(
    ctx,
    teamId,
    { golferIds },
    { allowRestrictedFields: false },
  );
}

/** Upserts one team for trusted admin import and bulk-create flows. */
async function upsertTeamRecord(ctx: MutationCtx, data: TeamCreatePayload) {
  const validated = await validateTeamLinks(ctx, {
    tournamentId: data.tournamentId,
    tourCardId: data.tourCardId,
  });

  if (validated.existingTeam) {
    return {
      team: await updateTeamRecord(ctx, validated.existingTeam._id, data, {
        allowRestrictedFields: true,
      }),
      operation: "updated" as const,
    };
  }

  return {
    team: await createTeamRecord(ctx, data),
    operation: "created" as const,
  };
}

/** Parses a bulk import JSON payload into normalized team rows. */
function parseTeamImportRows(teamsJson: string) {
  const parsed = JSON.parse(teamsJson) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("teamsJson must be a JSON array");
  }

  return parsed.map((row) => {
    if (!row || typeof row !== "object") {
      throw new Error("Each imported team row must be an object");
    }

    const candidate = row as TeamImportRow;
    if (!Array.isArray(candidate.golferIds)) {
      throw new Error("Each imported team row must include golferIds");
    }

    const golferIds = candidate.golferIds.map((value) => {
      if (typeof value !== "number") {
        throw new Error("Each imported golfer id must be a number");
      }

      return value;
    });

    return {
      tournamentId: candidate.tournamentId,
      tourCardId: candidate.tourCardId,
      golferIds,
    };
  });
}

// Level 3: public read queries

/** Returns one team by id when the caller may read its season. */
export const getTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    if (!(await canReadTeam(ctx, args.teamId))) {
      return null;
    }

    return await ctx.db.get(args.teamId);
  },
});

/** Returns teams under the requested filters with public current-season gating for signed-out users. */
export const getTeams = query({
  args: {
    options: getTeamsOptionsValidator,
  },
  handler: async (ctx, args) => {
    return await getTeamsForOptions(ctx, args.options ?? {});
  },
});

/** Returns all teams for one tournament when the caller may read that tournament's season. */
export const getTeamsForTournament = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    return await getTeamsForOptions(ctx, {
      filter: {
        tournamentId: args.tournamentId,
      },
    });
  },
});

// Level 4: public write mutations

/** Creates one team for a tour card and tournament when the caller owns that tour card or is an admin. */
export const createTeam = mutation({
  args: {
    data: teamCreateDataValidator,
  },
  handler: async (ctx, args) => {
    const actingMember = await getCurrentMember(ctx);
    const isAdmin = actingMember.role === "admin";

    if (
      !isAdmin &&
      !hasOnlyAllowedFields(
        args.data as unknown as Record<string, unknown>,
        USER_CREATE_ALLOWED_FIELDS,
      )
    ) {
      throw new Error(
        "Forbidden: You can only create your own roster selections",
      );
    }

    const validated = await validateTeamLinks(ctx, {
      tournamentId: args.data.tournamentId,
      tourCardId: args.data.tourCardId,
    });

    if (!isAdmin && validated.tourCard.memberId !== actingMember._id) {
      throw new Error("Forbidden: You can only create your own team");
    }

    if (validated.existingTeam) {
      throw new Error("Only one team is allowed per tour card per tournament");
    }

    return await createTeamRecord(ctx, args.data);
  },
});

/** Updates one team while restricting non-admin callers to their own roster changes. */
export const updateTeam = mutation({
  args: {
    team: teamUpdateObjectValidator,
  },
  handler: async (ctx, args) => {
    const existingTeam = await getTeamOrThrow(ctx, args.team._id);
    const { isAdmin } = await requireTeamWriteAccess(ctx, existingTeam);

    if (
      !isAdmin &&
      !hasOnlyAllowedFields(
        args.team as unknown as Record<string, unknown>,
        USER_UPDATE_ALLOWED_FIELDS,
      )
    ) {
      throw new Error(
        "Forbidden: You can only update your own roster selections",
      );
    }

    const { _id, ...data } = args.team;
    return await updateTeamRecord(ctx, _id, data, {
      allowRestrictedFields: isAdmin,
    });
  },
});

/** Replaces one team's roster through the direct roster endpoint for admins only. */
export const updateTeamRoster = mutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTeamRosterRecord(ctx, args.teamId, args.apiIds);
  },
});

/** Deletes one team for admins. */
export const deleteTeam = mutation({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const team = await getTeamOrThrow(ctx, args.teamId);
    await ctx.db.delete(team._id);

    return {
      ok: true,
      teamId: team._id,
    } as const;
  },
});

/** Upserts a batch of teams for admins. */
export const createTeams = mutation({
  args: {
    teams: v.array(teamCreateDataValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const results: Array<Doc<"teams"> | null> = [];
    for (const teamData of args.teams) {
      const result = await upsertTeamRecord(ctx, teamData);
      results.push(result.team ?? null);
    }

    return results;
  },
});

/** Imports team JSON for admins and upserts rows by tour-card and tournament pair. */
export const importTeamsFromJson = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    teamsJson: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const rows = parseTeamImportRows(args.teamsJson);
    const tournament = await ctx.db.get(args.tournamentId);

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const seasonTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    let created = 0;
    let updated = 0;
    const teamIds: Id<"teams">[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const fallbackTourCard = seasonTourCards[index];
      const tourCardId =
        (row.tourCardId as Id<"tourCards"> | undefined) ??
        fallbackTourCard?._id;

      if (!tourCardId) {
        continue;
      }

      const result = await upsertTeamRecord(ctx, {
        tournamentId:
          (row.tournamentId as Id<"tournaments"> | undefined) ??
          args.tournamentId,
        tourCardId,
        golferIds: row.golferIds,
      });

      if (result.operation === "created") {
        created += 1;
      } else {
        updated += 1;
      }

      if (result.team?._id) {
        teamIds.push(result.team._id);
      }
    }

    return {
      ok: true,
      tournamentId: args.tournamentId,
      processed: rows.length,
      created,
      updated,
      teamIds,
    } as const;
  },
});

// Level 5: internal sync mutations

/** Updates one team with a trusted full patch for backend sync flows. */
export const updateTeamInternal = internalMutation({
  args: {
    team: teamUpdateObjectValidator,
  },
  handler: async (ctx, args) => {
    const { _id, ...data } = args.team;
    return await updateTeamRecord(ctx, _id, data, {
      allowRestrictedFields: true,
    });
  },
});

/** Replaces one team roster for backend sync flows. */
export const updateTeamRosterInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    return await updateTeamRosterRecord(ctx, args.teamId, args.apiIds);
  },
});
