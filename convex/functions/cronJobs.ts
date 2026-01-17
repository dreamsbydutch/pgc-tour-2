import { v } from "convex/values";

import { internalAction, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type {
  FieldPlayer,
  LiveModelPlayer,
  RankedPlayer,
} from "../types/datagolf";

function normalizeEventTokens(name: string): string[] {
  const STOP = new Set([
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
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !STOP.has(w));
}

function eventNameLooksCompatible(
  expectedTournamentName: string,
  dataGolfEventName: string,
): {
  ok: boolean;
  score: number;
  intersection: string[];
  expectedTokens: string[];
  actualTokens: string[];
} {
  const expectedTokens = normalizeEventTokens(expectedTournamentName);
  const actualTokens = normalizeEventTokens(dataGolfEventName);

  const expectedNorm = expectedTournamentName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const actualNorm = dataGolfEventName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
      };
    }
  }

  const expectedSet = new Set(expectedTokens);
  const actualSet = new Set(actualTokens);
  const intersection = [...expectedSet].filter((t) => actualSet.has(t));
  const denom = Math.max(expectedSet.size, actualSet.size, 1);
  const score = intersection.length / denom;
  const ok = score >= 0.6 || (intersection.length >= 2 && score >= 0.5);

  return { ok, score, intersection, expectedTokens, actualTokens };
}

function parsePositionNumber(position?: string | null): number | null {
  if (!position) return null;
  const stripped = String(position).trim().replace(/^T/i, "");
  const num = Number.parseInt(stripped, 10);
  return Number.isFinite(num) ? num : null;
}

/** Explicit annotations avoid TS7022/TS7023 during Convex codegen. */
export const runDataGolfLiveSync: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    handler: async (ctx, args) => {
      const tournamentId =
        args.tournamentId ??
        (await ctx.runQuery(
          internal.functions.cronJobsInternal.getActiveTournamentIdForCron,
          {},
        ));

      if (!tournamentId) {
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const tour = "pga" as const;

      const tournamentName = await ctx.runQuery(
        internal.functions.cronJobsInternal.getTournamentNameForCron,
        { tournamentId },
      );

      const [fieldUpdates, rankings, inPlay] = await Promise.all([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          options: { tour },
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
        ctx.runAction(api.functions.datagolf.fetchLiveModelPredictions, {
          options: { tour },
        }),
      ]);

      const field = Array.isArray(fieldUpdates.field)
        ? (fieldUpdates.field as FieldPlayer[])
        : [];
      const rankingsList = Array.isArray(rankings.rankings)
        ? (rankings.rankings as RankedPlayer[])
        : [];
      const live = Array.isArray(inPlay.data)
        ? (inPlay.data as LiveModelPlayer[])
        : [];

      const dataGolfEventName =
        typeof inPlay.info?.event_name === "string"
          ? inPlay.info.event_name
          : typeof (fieldUpdates as { event_name?: unknown }).event_name ===
              "string"
            ? (fieldUpdates as { event_name: string }).event_name
            : undefined;

      if (tournamentName && dataGolfEventName) {
        const compatible = eventNameLooksCompatible(
          tournamentName,
          dataGolfEventName,
        );

        if (!compatible.ok) {
          return {
            ok: true,
            skipped: true,
            reason: "event_name_mismatch",
            tournamentId,
            tournamentName,
            dataGolfEventName,
            score: compatible.score,
            intersection: compatible.intersection,
            expectedTokens: compatible.expectedTokens,
            actualTokens: compatible.actualTokens,
          } as const;
        }
      }

      return await ctx.runMutation(
        internal.functions.cronJobsInternal.applyDataGolfLiveSync,
        {
          tournamentId,
          currentRound:
            typeof fieldUpdates.current_round === "number"
              ? fieldUpdates.current_round
              : undefined,
          field,
          rankings: rankingsList,
          liveStats: live,
          eventName:
            typeof dataGolfEventName === "string"
              ? dataGolfEventName
              : undefined,
        },
      );
    },
  });

export const recomputeStandingsForCurrentSeason = internalMutation({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();

    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .collect();

    if (seasons.length === 0) {
      return { ok: true, skipped: true, reason: "no_current_season" } as const;
    }

    const season = seasons.reduce((best, s) =>
      s.number > best.number ? s : best,
    );

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    if (tourCards.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_tour_cards",
        seasonId: season._id,
      } as const;
    }

    const calculations = await Promise.all(
      tourCards.map(async (tc) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
          .collect();

        const completed = teams.filter((t) => (t.round ?? 0) > 4);

        const win = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum === 1;
        }).length;

        const topTen = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum !== null && posNum <= 10;
        }).length;

        const madeCut = completed.filter((t) => t.position !== "CUT").length;

        const appearances = completed.length;

        const earnings = completed.reduce(
          (sum, t) => sum + (t.earnings ?? 0),
          0,
        );
        const points = completed.reduce(
          (sum, t) => sum + Math.round(t.points ?? 0),
          0,
        );

        return {
          tourCardId: tc._id,
          tourId: tc.tourId,
          win,
          topTen,
          madeCut,
          appearances,
          earnings,
          points,
        };
      }),
    );

    const byTour = new Map<Id<"tours">, typeof calculations>();
    for (const calc of calculations) {
      const list = byTour.get(calc.tourId) ?? [];
      list.push(calc);
      byTour.set(calc.tourId, list);
    }

    let updated = 0;

    for (const list of byTour.values()) {
      for (const calc of list) {
        const samePointsCount = list.filter(
          (a) => a.points === calc.points,
        ).length;
        const betterPointsCount = list.filter(
          (a) => a.points > calc.points,
        ).length;
        const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

        const playoff =
          betterPointsCount < 15 ? 1 : betterPointsCount < 35 ? 2 : 0;

        await ctx.db.patch(calc.tourCardId, {
          points: calc.points,
          earnings: calc.earnings,
          wins: calc.win,
          topTen: calc.topTen,
          madeCut: calc.madeCut,
          appearances: calc.appearances,
          currentPosition: position,
          playoff,
          updatedAt: Date.now(),
        });

        updated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      seasonId: season._id,
      tourCardsUpdated: updated,
    } as const;
  },
});
