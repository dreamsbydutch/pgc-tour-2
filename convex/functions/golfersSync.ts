/**
 * Golfers Sync - Actions to rebuild golfers from DataGolf
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { normalize } from "./_utils";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { Player } from "../types/datagolf";
import { fetchWithRetry } from "./_externalFetch";

type UpsertResult = {
  total: number;
  inserted: number;
  updated: number;
  dryRun: boolean;
};

type SyncResult = {
  fetched: number;
  upserted: UpsertResult;
};

function normalizeCountry(country?: string): string | undefined {
  const trimmed = country?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "unknown") return undefined;
  return trimmed;
}

function normalizeStoredCountry(
  country: string | null | undefined,
): string | null {
  const trimmed = country?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "unknown") return null;
  return trimmed;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

function normalizeSuffixToken(token: string): string {
  const raw = token.trim();
  if (!raw) return "";

  const stripped = raw.replace(/\./g, "").trim();
  const lower = stripped.toLowerCase();

  if (lower === "jr") return "Jr.";
  if (lower === "sr") return "Sr.";
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(stripped)) {
    return stripped.toUpperCase();
  }

  return raw;
}

function normalizePlayerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.includes(",")) return trimmed;

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    const [last, first] = parts;
    if (!last || !first) return trimmed;
    return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }

  if (parts.length >= 3) {
    const last = parts[0];
    const first = parts[parts.length - 1];
    const suffixTokens = parts.slice(1, parts.length - 1);
    const suffix = suffixTokens
      .map(normalizeSuffixToken)
      .filter(Boolean)
      .join(" ");

    if (!last || !first) return trimmed;
    return (suffix ? `${first} ${last} ${suffix}` : `${first} ${last}`)
      .replace(/\s+/g, " ")
      .trim();
  }

  return trimmed;
}

function countCommas(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ",") count++;
  }
  return count;
}

async function fetchDataGolfPlayerList(): Promise<Player[]> {
  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DataGolf API key not found. Please set DATAGOLF_API_KEY in Convex environment variables.",
    );
  }

  const url = `https://feeds.datagolf.com/get-player-list?file_format=json&key=${apiKey}`;

  const result = await fetchWithRetry<Player[]>(
    url,
    {},
    {
      timeout: 30000,
      retries: 3,
      validateResponse: (json): json is Player[] =>
        Array.isArray(json) &&
        (json.length === 0 ||
          json.every(
            (p) =>
              p && typeof p === "object" && "player_name" in p && "dg_id" in p,
          )),
      logPrefix: "DataGolf Sync",
    },
  );

  if (!result.ok) {
    if (result.error.includes("401") || result.error.includes("403")) {
      throw new Error(
        "DataGolf API authentication failed. Please verify DATAGOLF_API_KEY is correct and active.",
      );
    }

    throw new Error(`Failed to fetch DataGolf player list: ${result.error}`);
  }

  return result.data;
}

export const syncGolfersFromDataGolf = action({
  args: {
    clerkId: v.string(),
    options: v.optional(
      v.object({
        dryRun: v.optional(v.boolean()),
        limit: v.optional(v.number()),
      }),
    ),
  },
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

    const dgByApiId = new Map<number, (typeof payload)[number]>();
    const dgByNameKey = new Map<string, Array<(typeof payload)[number]>>();
    for (const g of payload) {
      dgByApiId.set(g.apiId, g);
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
