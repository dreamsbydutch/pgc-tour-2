import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { DataGolfRankedPlayer } from "../types/datagolf";

const DATAGOLF_BASE_URL = "https://feeds.datagolf.com";
const FETCH_TIMEOUT_MS = 30000;
const FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 1000;

type WorldRankSyncInput = {
  apiId: number;
  playerName: string;
  country?: string;
  worldRank: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePlayerNameFromDataGolf(raw: string): string {
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

function isDataGolfRankedPlayer(value: unknown): value is DataGolfRankedPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.player_name === "string" &&
    typeof candidate.country === "string" &&
    typeof candidate.dg_id === "number" &&
    typeof candidate.owgr_rank === "number"
  );
}

async function fetchDataGolfRankings(): Promise<DataGolfRankedPlayer[]> {
  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DataGolf API key not found. Please set DATAGOLF_API_KEY in Convex environment variables.",
    );
  }

  const url = `${DATAGOLF_BASE_URL}/preds/get-dg-rankings?file_format=json&key=${apiKey}`;
  let lastError = "Request failed after all retries";

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : FETCH_RETRY_DELAY_MS * 2 ** attempt * 2;

        lastError = `Rate limited (429) after attempt ${attempt + 1}`;
        if (attempt < FETCH_RETRIES) {
          await sleep(waitMs);
          continue;
        }

        break;
      }

      if (response.status >= 500) {
        const errorText = await response.text().catch(() => "");
        lastError = `Server error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;

        if (attempt < FETCH_RETRIES) {
          await sleep(FETCH_RETRY_DELAY_MS * 2 ** attempt);
          continue;
        }

        break;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "DataGolf API authentication failed. Please verify DATAGOLF_API_KEY is correct and active.",
          );
        }

        throw new Error(
          `HTTP error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        );
      }

      const json = (await response.json()) as { rankings?: unknown };
      if (!Array.isArray(json.rankings)) {
        return [];
      }

      return json.rankings.filter(isDataGolfRankedPlayer);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Request timeout after ${FETCH_TIMEOUT_MS}ms`;
      } else {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < FETCH_RETRIES) {
        await sleep(FETCH_RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }

      break;
    }
  }

  throw new Error(lastError);
}

/**
 * Applies a DataGolf ranking snapshot to existing golfer rows in one mutation.
 *
 * @param args.rankings Normalized rankings keyed by golfer api id.
 * @returns Counts of matched and updated golfer rows.
 */
export const syncGolfersWorldRankSnapshot = internalMutation({
  args: {
    rankings: v.array(
      v.object({
        apiId: v.number(),
        playerName: v.string(),
        country: v.optional(v.string()),
        worldRank: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const uniqueApiIds = [
      ...new Set(args.rankings.map((ranking) => ranking.apiId)),
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

    const now = Date.now();
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const ranking of args.rankings) {
      const golfer = golferByApiId.get(ranking.apiId);
      if (!golfer) {
        continue;
      }

      golfersMatched += 1;
      const patch = buildGolferWorldRankPatch(golfer, ranking, now);
      if (!patch) {
        continue;
      }

      await ctx.db.patch(golfer._id, patch);
      golfersUpdated += 1;
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

export const updateGolfersWorldRankFromDataGolfInput: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx) => {
    let rankingsList: DataGolfRankedPlayer[];
    try {
      rankingsList = await fetchDataGolfRankings();
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }

    if (rankingsList.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_rankings",
        rankingsFetched: 0,
      } as const;
    }
    const rankingsSnapshot = rankingsList
      .filter(
        (ranking) =>
          Number.isFinite(ranking.dg_id) && Number.isFinite(ranking.owgr_rank),
      )
      .map(
        (ranking): WorldRankSyncInput => ({
          apiId: ranking.dg_id,
          playerName: normalizePlayerNameFromDataGolf(ranking.player_name),
          country: normalizeCountry(ranking.country),
          worldRank: ranking.owgr_rank,
        }),
      );

    if (rankingsSnapshot.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_valid_rankings",
        rankingsFetched: rankingsList.length,
        rankingsProcessed: 0,
      } as const;
    }

    const syncResult = await ctx.runMutation(
      internal.crons.golfers.syncGolfersWorldRankSnapshot,
      {
        rankings: rankingsSnapshot,
      },
    );

    return {
      ...syncResult,
      rankingsFetched: rankingsList.length,
    } as const;
  },
});

/**
 * Builds a golfer patch for a world-rank sync when the upstream snapshot
 * differs from the stored golfer row.
 *
 * @param golfer Stored golfer document.
 * @param ranking Normalized ranking snapshot row.
 * @param updatedAt Batch timestamp.
 * @returns A patch object when changes are needed, otherwise null.
 */
function buildGolferWorldRankPatch(
  golfer: {
    _id: Id<"golfers">;
    apiId: number;
    playerName: string;
    country?: string;
    worldRank?: number;
  },
  ranking: WorldRankSyncInput,
  updatedAt: number,
) {
  const patch: {
    updatedAt: number;
    playerName?: string;
    country?: string;
    worldRank?: number;
  } = {
    updatedAt,
  };
  let changed = false;

  if (ranking.playerName && ranking.playerName !== golfer.playerName) {
    patch.playerName = ranking.playerName;
    changed = true;
  }
  if (ranking.worldRank !== golfer.worldRank) {
    patch.worldRank = ranking.worldRank;
    changed = true;
  }
  if (ranking.country !== undefined && ranking.country !== golfer.country) {
    patch.country = ranking.country;
    changed = true;
  }

  return changed ? patch : null;
}

/**
 * Normalizes optional country values before persistence.
 */
function normalizeCountry(country: string) {
  const trimmed = country.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
