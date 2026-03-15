import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type {
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
} from "../types/datagolf";

const BASE_URL = "https://feeds.datagolf.com";
const NEXT_TOURNAMENT_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;
const EXCLUDED_GOLFER_IDS = new Set<number>([18417]);
const GROUP_LIMITS = {
  GROUP_1: { percentage: 0.1, maxCount: 10 },
  GROUP_2: { percentage: 0.175, maxCount: 16 },
  GROUP_3: { percentage: 0.225, maxCount: 22 },
  GROUP_4: { percentage: 0.25, maxCount: 30 },
} as const;

type RankedFieldPlayer = DataGolfFieldPlayer & {
  ranking?: DataGolfRankedPlayer;
};

type GroupLimits = typeof GROUP_LIMITS;

type NextTournamentForGroupsResult = {
  tournament: Doc<"tournaments"> | null;
  isWithinSixDayWindow: boolean;
  isPlayoff: boolean;
  playoffEventIndex: number;
  isNonFirstPlayoffTournament: boolean;
  firstPlayoffEventId: Id<"tournaments"> | null;
  previousPlayoffEventId: Id<"tournaments"> | null;
};

type GroupAssignmentInput = {
  dgId: number;
  playerName: string;
  country?: string;
  worldRank?: number;
  rating: number;
  group: number;
  roundOneTeeTime?: number;
  roundTwoTeeTime?: number;
};

/**
 * Resolves the next upcoming tournament together with the playoff metadata the
 * grouping cron needs.
 *
 * @returns Next-tournament selection plus six-day window and playoff flags.
 */
export const getNextTournamentForGroups = internalQuery({
  handler: async (ctx): Promise<NextTournamentForGroupsResult> => {
    const tournament = await findNextTournament(ctx);
    const playoffState = await getTournamentPlayoffState(ctx, tournament);

    return {
      tournament,
      isWithinSixDayWindow: isWithinNextTournamentWindow(tournament),
      ...playoffState,
    };
  },
});

/**
 * Creates missing golfers and upserts tournament-group assignments for the
 * selected tournament in one mutation.
 *
 * @param args.tournamentId Tournament receiving the grouped field.
 * @param args.golfers Grouped DataGolf players keyed by DataGolf id.
 * @returns Counts describing created and updated golfer records.
 */
export const upsertTournamentGroups = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    golfers: v.array(
      v.object({
        dgId: v.number(),
        playerName: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
        rating: v.number(),
        group: v.number(),
        roundOneTeeTime: v.optional(v.number()),
        roundTwoTeeTime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      return {
        ok: false,
        skipped: true,
        reason: "tournament_not_found",
        tournamentId: args.tournamentId,
      } as const;
    }

    const now = Date.now();
    const uniqueApiIds = [
      ...new Set(args.golfers.map((golfer) => golfer.dgId)),
    ];
    const existingGolfers = await Promise.all(
      uniqueApiIds.map((apiId) =>
        ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
          .first(),
      ),
    );
    const golferByApiId = new Map(
      existingGolfers
        .filter(
          (golfer): golfer is NonNullable<typeof golfer> => golfer !== null,
        )
        .map((golfer) => [golfer.apiId, golfer] as const),
    );

    const existingTournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const tournamentGolferByGolferId = new Map(
      existingTournamentGolfers.map(
        (tournamentGolfer) =>
          [tournamentGolfer.golferId, tournamentGolfer] as const,
      ),
    );

    let golfersCreated = 0;
    let golfersUpdated = 0;
    let tournamentGolfersCreated = 0;
    let tournamentGolfersUpdated = 0;

    for (const golferInput of args.golfers) {
      let golfer = golferByApiId.get(golferInput.dgId) ?? null;
      const normalizedCountry = normalizeCountry(golferInput.country);

      if (!golfer) {
        const golferInsert = {
          apiId: golferInput.dgId,
          playerName: golferInput.playerName,
          updatedAt: now,
          ...(normalizedCountry ? { country: normalizedCountry } : {}),
          ...(golferInput.worldRank !== undefined
            ? { worldRank: golferInput.worldRank }
            : {}),
        };
        const golferId = await ctx.db.insert("golfers", golferInsert);

        golfer = {
          _id: golferId,
          _creationTime: now,
          apiId: golferInput.dgId,
          playerName: golferInput.playerName,
          country: normalizedCountry,
          worldRank: golferInput.worldRank,
          updatedAt: now,
        };
        golferByApiId.set(golferInput.dgId, golfer);
        golfersCreated += 1;
      } else {
        const golferPatch: {
          playerName?: string;
          country?: string;
          worldRank?: number;
          updatedAt: number;
        } = {
          updatedAt: now,
        };
        let golferChanged = false;

        if (golfer.playerName !== golferInput.playerName) {
          golferPatch.playerName = golferInput.playerName;
          golferChanged = true;
        }
        if (normalizedCountry !== golfer.country) {
          golferPatch.country = normalizedCountry;
          golferChanged = true;
        }
        if (
          golferInput.worldRank !== undefined &&
          golferInput.worldRank !== golfer.worldRank
        ) {
          golferPatch.worldRank = golferInput.worldRank;
          golferChanged = true;
        }

        if (golferChanged) {
          await ctx.db.patch(golfer._id, golferPatch);
          golfer = {
            ...golfer,
            ...golferPatch,
          };
          golferByApiId.set(golferInput.dgId, golfer);
          golfersUpdated += 1;
        }
      }

      const existingTournamentGolfer = tournamentGolferByGolferId.get(
        golfer._id,
      );
      const nextTournamentGolferData = {
        group: golferInput.group,
        worldRank: golferInput.worldRank ?? existingTournamentGolfer?.worldRank,
        round: 0,
        usage: 0,
        rating: golferInput.rating,
        updatedAt: now,
        ...(golferInput.roundOneTeeTime !== undefined
          ? { roundOneTeeTime: golferInput.roundOneTeeTime }
          : existingTournamentGolfer?.roundOneTeeTime !== undefined
            ? { roundOneTeeTime: existingTournamentGolfer.roundOneTeeTime }
            : {}),
        ...(golferInput.roundTwoTeeTime !== undefined
          ? { roundTwoTeeTime: golferInput.roundTwoTeeTime }
          : existingTournamentGolfer?.roundTwoTeeTime !== undefined
            ? { roundTwoTeeTime: existingTournamentGolfer.roundTwoTeeTime }
            : {}),
      };

      if (!existingTournamentGolfer) {
        const tournamentGolferId = await ctx.db.insert("tournamentGolfers", {
          golferId: golfer._id,
          tournamentId: args.tournamentId,
          ...nextTournamentGolferData,
        });

        tournamentGolferByGolferId.set(golfer._id, {
          _id: tournamentGolferId,
          _creationTime: now,
          golferId: golfer._id,
          tournamentId: args.tournamentId,
          ...nextTournamentGolferData,
        });
        tournamentGolfersCreated += 1;
        continue;
      }

      await ctx.db.patch(
        existingTournamentGolfer._id,
        nextTournamentGolferData,
      );
      tournamentGolferByGolferId.set(golfer._id, {
        ...existingTournamentGolfer,
        ...nextTournamentGolferData,
      });
      tournamentGolfersUpdated += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersCreated,
      golfersUpdated,
      tournamentGolfersCreated,
      tournamentGolfersUpdated,
    } as const;
  },
});

/**
 * Builds the next tournament's groups without dispatching through tournament,
 * golfer, or datagolf function modules.
 *
 * @returns Skip metadata, copied playoff data, or grouped-field sync counts.
 */
export const runCreateGroupsForNextTournament = internalAction({
  handler: async (ctx): Promise<unknown> => {
    const nextTournament = await ctx.runQuery(
      internal.crons.groups.getNextTournamentForGroups,
      {},
    );
    if (!nextTournament.tournament) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_next_tournament)",
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_next_tournament",
      } as const;
    }
    if (!nextTournament.isWithinSixDayWindow) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (not_within_six_day_window)",
        {
          tournamentId: nextTournament.tournament._id,
          tournamentName: nextTournament.tournament.name,
        },
      );
      return {
        ok: true,
        skipped: true,
        reason: "not_within_six_day_window",
        tournamentId: nextTournament.tournament._id,
        tournamentName: nextTournament.tournament.name,
      } as const;
    }

    const tournament = nextTournament.tournament;

    if (
      nextTournament.isNonFirstPlayoffTournament &&
      nextTournament.previousPlayoffEventId
    ) {
      const duplicateResult = await ctx.runMutation(
        internal.crons.groups.duplicateFromPreviousPlayoff,
        {
          currentTournamentId: tournament._id,
          previousPlayoffTournamentId: nextTournament.previousPlayoffEventId,
        },
      );

      return {
        ok: true,
        tournamentId: tournament._id,
        createGroups: duplicateResult,
      };
    }

    if (nextTournament.isNonFirstPlayoffTournament) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_previous_playoff_tournament",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      } as const;
    }

    let fieldUpdates: DataGolfFieldUpdatesResponse;
    let rankings: DataGolfRankingsResponse | undefined;
    try {
      [fieldUpdates, rankings] = await Promise.all([
        fetchFieldUpdatesForTournament(),
        fetchDataGolfRankings(),
      ]);
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        tournamentId: tournament._id,
        error: error instanceof Error ? error.message : String(error),
      } as const;
    }

    if (!fieldUpdates.event_name) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      } as const;
    }

    const compatible = checkCompatabilityOfEventNames(
      tournament.name,
      fieldUpdates.event_name,
    );
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        dataGolfEventName: fieldUpdates.event_name,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      } as const;
    }

    const processedField = buildRankedFieldPlayers(
      fieldUpdates.field,
      rankings?.rankings ?? [],
    );
    if (processedField.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "empty_field",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        dataGolfEventName: fieldUpdates.event_name,
      } as const;
    }

    const createGroups = await ctx.runMutation(
      internal.crons.groups.upsertTournamentGroups,
      {
        tournamentId: tournament._id,
        golfers: buildGroupAssignments(processedField),
      },
    );

    return {
      ok: true,
      tournamentId: tournament._id,
      createGroups,
    } as const;
  },
});

/**
 * Copies grouped golfer and team state from the prior playoff event to the
 * current playoff event.
 *
 * @param args.currentTournamentId Destination playoff tournament.
 * @param args.previousPlayoffTournamentId Source playoff tournament.
 * @returns Counts describing copied golfers, teams, and unique groups.
 */
export const duplicateFromPreviousPlayoff = internalMutation({
  args: {
    currentTournamentId: v.id("tournaments"),
    previousPlayoffTournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const previousTournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();
    const previousTournamentTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tournamentGolfer of previousTournamentGolfers) {
      if (tournamentGolfer.group) {
        groupSet.add(tournamentGolfer.group);
      }

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", tournamentGolfer.golferId)
            .eq("tournamentId", args.currentTournamentId),
        )
        .first();
      if (existingTournamentGolfer) {
        continue;
      }

      await ctx.db.insert("tournamentGolfers", {
        golferId: tournamentGolfer.golferId,
        tournamentId: args.currentTournamentId,
        group: tournamentGolfer.group,
        rating: tournamentGolfer.rating,
        worldRank: tournamentGolfer.worldRank,
        updatedAt: Date.now(),
        ...(numberOrUndefined(tournamentGolfer.roundOneTeeTime) !== undefined
          ? {
              roundOneTeeTime: numberOrUndefined(
                tournamentGolfer.roundOneTeeTime,
              ),
            }
          : {}),
        ...(numberOrUndefined(tournamentGolfer.roundTwoTeeTime) !== undefined
          ? {
              roundTwoTeeTime: numberOrUndefined(
                tournamentGolfer.roundTwoTeeTime,
              ),
            }
          : {}),
      });
      golfersCopied += 1;
    }

    for (const team of previousTournamentTeams) {
      const existingTeam = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.currentTournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();
      if (existingTeam) {
        continue;
      }

      await ctx.db.insert("teams", {
        tournamentId: args.currentTournamentId,
        tourCardId: team.tourCardId,
        golferIds: team.golferIds,
        updatedAt: Date.now(),
        ...(team.score !== undefined ? { score: team.score } : {}),
        ...(team.position !== undefined ? { position: team.position } : {}),
        ...(team.pastPosition !== undefined
          ? { pastPosition: team.pastPosition }
          : {}),
      });
      teamsCopied += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.currentTournamentId,
      copiedFromTournamentId: args.previousPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});

/**
 * Finds the earliest tournament whose start date is still in the future.
 */
async function findNextTournament(ctx: QueryCtx) {
  const now = Date.now();
  const tournaments = await ctx.db.query("tournaments").collect();

  return (
    tournaments
      .filter((tournament) => tournament.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0] ?? null
  );
}

/**
 * Computes playoff sequencing for a tournament within its season.
 */
async function getTournamentPlayoffState(
  ctx: QueryCtx,
  tournament: Doc<"tournaments"> | null,
) {
  if (!tournament) {
    return {
      isPlayoff: false,
      playoffEventIndex: 0,
      isNonFirstPlayoffTournament: false,
      firstPlayoffEventId: null,
      previousPlayoffEventId: null,
    } as const;
  }

  const [seasonTournaments, seasonTiers] = await Promise.all([
    ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
    ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
  ]);

  const playoffTierIds = new Set(
    seasonTiers
      .filter((tier) => isPlayoffTierName(tier.name))
      .map((tier) => tier._id),
  );
  const playoffTournaments = seasonTournaments
    .filter((seasonTournament) => playoffTierIds.has(seasonTournament.tierId))
    .sort((a, b) => a.startDate - b.startDate);
  const playoffIndex = playoffTournaments.findIndex(
    (playoffTournament) => playoffTournament._id === tournament._id,
  );
  const playoffEventIndex = playoffIndex === -1 ? 0 : playoffIndex + 1;

  return {
    isPlayoff: playoffIndex !== -1,
    playoffEventIndex,
    isNonFirstPlayoffTournament: playoffEventIndex > 1,
    firstPlayoffEventId: playoffTournaments[0]?._id ?? null,
    previousPlayoffEventId:
      playoffIndex > 0
        ? (playoffTournaments[playoffIndex - 1]?._id ?? null)
        : null,
  } as const;
}

/**
 * Indicates whether a tournament begins inside the six-day pre-grouping
 * window.
 */
function isWithinNextTournamentWindow(
  tournament: Doc<"tournaments"> | null,
  now: number = Date.now(),
) {
  if (!tournament) {
    return false;
  }

  return tournament.startDate - now <= NEXT_TOURNAMENT_WINDOW_MS;
}

/**
 * Loads DataGolf field updates directly from the upstream API.
 */
async function fetchFieldUpdatesForTournament(): Promise<DataGolfFieldUpdatesResponse> {
  const data = await fetchFromDataGolf<Record<string, unknown>>(
    "/field-updates?tour=pga&file_format=json",
  );
  const field = Array.isArray(data.field)
    ? data.field.filter(isDataGolfFieldPlayer)
    : [];

  return {
    tour: String(data.tour ?? "pga"),
    event_name: String(data.event_name ?? ""),
    event_id: Number(data.event_id ?? 0),
    date_end: String(data.date_end ?? ""),
    date_start: String(data.date_start ?? ""),
    course_name: String(data.course_name ?? ""),
    multi_course: String(data.multi_course ?? ""),
    tz_offset: Number(data.tz_offset ?? 0),
    current_round: Number(data.current_round ?? 0),
    field,
  };
}

/**
 * Loads DataGolf rankings directly from the upstream API.
 */
async function fetchDataGolfRankings(): Promise<
  DataGolfRankingsResponse | undefined
> {
  const data = await fetchFromDataGolf<Record<string, unknown>>(
    "/preds/get-dg-rankings?file_format=json",
  );
  const rankings = Array.isArray(data.rankings)
    ? data.rankings.filter(isDataGolfRankedPlayer)
    : [];

  if (!rankings.length) {
    return undefined;
  }

  return {
    last_updated: String(data.last_updated ?? ""),
    notes: String(data.notes ?? ""),
    rankings,
  };
}

/**
 * Performs an authenticated DataGolf request with retry handling.
 */
async function fetchFromDataGolf<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DataGolf API key not found. Please set DATAGOLF_API_KEY in Convex environment variables.",
    );
  }

  const joiner = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${joiner}key=${apiKey}`;
  const result = await fetchJsonWithRetry<T>(url, {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
  });

  if (!result.ok) {
    if (result.error.includes("401") || result.error.includes("403")) {
      throw new Error(
        "DataGolf API authentication failed. Please verify DATAGOLF_API_KEY is correct and active.",
      );
    }

    throw new Error(`DataGolf API error: ${result.error}`);
  }

  return result.data;
}

/**
 * Retries JSON fetches for transient upstream failures.
 */
async function fetchJsonWithRetry<T>(
  url: string,
  config: { timeout: number; retries: number; retryDelay: number },
) {
  let lastError = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    attempts += 1;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter
            ? Number.parseInt(retryAfter, 10) * 1000
            : config.retryDelay * 2 ** attempt * 2;

          if (attempt < config.retries) {
            await sleep(waitMs);
            continue;
          }

          lastError = `Rate limited (429) after ${attempts} attempts`;
          continue;
        }

        if (response.status >= 500) {
          const errorText = await response.text().catch(() => "");
          lastError = `Server error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;

          if (attempt < config.retries) {
            await sleep(config.retryDelay * 2 ** attempt);
            continue;
          }

          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
            attempts,
          } as const;
        }

        const data = (await response.json()) as T;
        return {
          ok: true,
          data,
          attempts,
        } as const;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError =
          error instanceof Error && error.name === "AbortError"
            ? `Request timeout after ${config.timeout}ms`
            : `Network error: ${error instanceof Error ? error.message : String(error)}`;

        if (attempt < config.retries) {
          await sleep(config.retryDelay * 2 ** attempt);
          continue;
        }
      }
    } catch (error) {
      lastError = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;

      if (attempt < config.retries) {
        await sleep(config.retryDelay * 2 ** attempt);
        continue;
      }
    }
  }

  return {
    ok: false,
    error: lastError || "Request failed after all retries",
    attempts,
  } as const;
}

/**
 * Filters, ranks, and sorts the field for grouping.
 */
function buildRankedFieldPlayers(
  field: DataGolfFieldPlayer[],
  rankings: DataGolfRankedPlayer[],
) {
  const rankingByDgId = new Map(
    rankings.map((ranking) => [ranking.dg_id, ranking] as const),
  );

  return field
    .filter((golfer) => !EXCLUDED_GOLFER_IDS.has(golfer.dg_id))
    .map((golfer) => ({
      ...golfer,
      ranking: rankingByDgId.get(golfer.dg_id),
    }))
    .sort(
      (a, b) =>
        (b.ranking?.dg_skill_estimate ?? -50) -
        (a.ranking?.dg_skill_estimate ?? -50),
    );
}

/**
 * Converts ranked field players into the local mutation payload expected by the
 * upsert mutation.
 */
function buildGroupAssignments(players: RankedFieldPlayer[]) {
  const groups: RankedFieldPlayer[][] = [[], [], [], [], []];

  players.forEach((golfer, index) => {
    const groupIndex = determineGroupIndex(
      index,
      players.length,
      groups,
      GROUP_LIMITS,
    );
    groups[groupIndex]?.push(golfer);
  });

  return groups.flatMap((group, groupIndex) =>
    group.map(
      (golfer): GroupAssignmentInput => ({
        dgId: golfer.dg_id,
        playerName: normalizePlayerNameFromDataGolf(golfer.player_name),
        country: normalizeCountry(golfer.country),
        worldRank: golfer.ranking?.owgr_rank,
        rating: normalizeDgSkillEstimateToPgcRating(
          golfer.ranking?.dg_skill_estimate ?? -1.875,
        ),
        group: groupIndex + 1,
        roundOneTeeTime: getTeeTimeForRound(golfer, 1),
        roundTwoTeeTime: getTeeTimeForRound(golfer, 2),
      }),
    ),
  );
}

/**
 * Replicates the existing group-allocation algorithm.
 */
function determineGroupIndex<T>(
  currentIndex: number,
  totalGolfers: number,
  groups: T[][],
  groupLimits: GroupLimits,
) {
  const remainingGolfers = totalGolfers - currentIndex;

  if (
    groups[0].length < totalGolfers * groupLimits.GROUP_1.percentage &&
    groups[0].length < groupLimits.GROUP_1.maxCount
  ) {
    return 0;
  }

  if (
    groups[1].length < totalGolfers * groupLimits.GROUP_2.percentage &&
    groups[1].length < groupLimits.GROUP_2.maxCount
  ) {
    return 1;
  }

  if (
    groups[2].length < totalGolfers * groupLimits.GROUP_3.percentage &&
    groups[2].length < groupLimits.GROUP_3.maxCount
  ) {
    return 2;
  }

  if (
    groups[3].length < totalGolfers * groupLimits.GROUP_4.percentage &&
    groups[3].length < groupLimits.GROUP_4.maxCount
  ) {
    return 3;
  }

  if (
    remainingGolfers <= groups[3].length + groups[4].length * 0.5 ||
    remainingGolfers === 1
  ) {
    return 4;
  }

  return currentIndex % 2 ? 3 : 4;
}

/**
 * Normalizes DataGolf player names from "Last, First" to "First Last".
 */
function normalizePlayerNameFromDataGolf(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.includes(",")) {
    return trimmed.replace(/\s+/g, " ").trim();
  }

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return trimmed.replace(/\s+/g, " ").trim();
  }

  const last = parts[0] ?? trimmed;
  const first = parts.slice(1).join(", ").trim();
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

/**
 * Converts DataGolf skill estimates into the app's rating scale.
 */
function normalizeDgSkillEstimateToPgcRating(dgSkillEstimate: number) {
  if (!Number.isFinite(dgSkillEstimate)) {
    return 0;
  }

  if (dgSkillEstimate < -1.5) {
    const raw = 5 + ((dgSkillEstimate + 1.5) / 1.5) * 5;
    return Math.max(0, Math.min(5, Math.round(raw * 100) / 100));
  }

  if (dgSkillEstimate <= 2) {
    const raw = 5 + ((dgSkillEstimate + 1.5) / 3.5) * 95;
    return Math.max(0, Math.round(raw * 100) / 100);
  }

  const extra = 20 * Math.sqrt((dgSkillEstimate - 2) / 1.5);
  const raw = 100 + extra;
  return Math.min(150, Math.round(raw * 100) / 100);
}

/**
 * Checks whether the upstream event name matches the intended tournament.
 */
function checkCompatabilityOfEventNames(
  expectedTournamentName: string,
  dataGolfEventName: string,
) {
  let comparableEventName = dataGolfEventName;
  if (comparableEventName.startsWith("WM")) {
    comparableEventName = `Waste Management ${comparableEventName}`;
  }

  const expectedTokens = normalizeEventTokens(expectedTournamentName);
  const actualTokens = normalizeEventTokens(comparableEventName);
  const expectedNorm = normalizeNameForComparison(expectedTournamentName);
  const actualNorm = normalizeNameForComparison(comparableEventName);

  if (expectedNorm && actualNorm) {
    if (
      expectedNorm.includes(actualNorm) ||
      actualNorm.includes(expectedNorm)
    ) {
      return {
        ok: true,
        score: 1,
        intersection: [],
        expectedTokens,
        actualTokens,
      } as const;
    }
  }

  const actualSet = new Set(actualTokens);
  const intersection = expectedTokens.filter((token) => actualSet.has(token));
  const denominator = Math.max(expectedTokens.length, actualTokens.length, 1);
  const score = intersection.length / denominator;

  return {
    ok: score >= 0.5,
    score,
    intersection,
    expectedTokens,
    actualTokens,
  } as const;
}

/**
 * Extracts a numeric tee time for a specific round when available.
 */
function getTeeTimeForRound(player: DataGolfFieldPlayer, roundNumber: number) {
  const teeTime = player.teetimes.find(
    (candidate) => candidate.round_num === roundNumber,
  )?.teetime;

  return typeof teeTime === "number" ? teeTime : undefined;
}

/**
 * Normalizes optional country values before persistence.
 */
function normalizeCountry(country?: string) {
  const trimmed = country?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.toLowerCase() === "unknown" ? undefined : trimmed;
}

/**
 * Converts optional numeric-or-string tee times into numbers.
 */
function numberOrUndefined(value: number | string | undefined) {
  return typeof value === "number" ? value : undefined;
}

/**
 * Identifies playoff tier names.
 */
function isPlayoffTierName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "playoff" || normalized === "playoffs";
}

/**
 * Normalizes tournament names into comparison tokens.
 */
function normalizeEventTokens(name: string) {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "at",
    "in",
    "on",
    "for",
    "to",
    "by",
    "presented",
    "championship",
    "tournament",
    "cup",
    "classic",
  ]);

  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) =>
      token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token,
    )
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !stopWords.has(token));
}

/**
 * Builds a relaxed normalized string for substring name matching.
 */
function normalizeNameForComparison(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates the minimum shape needed from DataGolf field rows.
 */
function isDataGolfFieldPlayer(value: unknown): value is DataGolfFieldPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DataGolfFieldPlayer>;
  return (
    typeof candidate.dg_id === "number" &&
    typeof candidate.player_name === "string" &&
    Array.isArray(candidate.teetimes)
  );
}

/**
 * Validates the minimum shape needed from DataGolf ranking rows.
 */
function isDataGolfRankedPlayer(value: unknown): value is DataGolfRankedPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DataGolfRankedPlayer>;
  return (
    typeof candidate.dg_id === "number" &&
    typeof candidate.dg_skill_estimate === "number" &&
    typeof candidate.player_name === "string"
  );
}

/**
 * Promise-based delay used by the retry helper.
 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
