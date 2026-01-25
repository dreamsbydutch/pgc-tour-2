import { v } from "convex/values";

import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

type GolferSnap = {
  apiId: number;
  position: string | null;
  score: number | null;
  today: number | null;
  thru: number | null;
  roundOneTeeTime: string | null;
  roundOne: number | null;
  roundTwoTeeTime: string | null;
  roundTwo: number | null;
  roundThreeTeeTime: string | null;
  roundThree: number | null;
  roundFourTeeTime: string | null;
  roundFour: number | null;
};

type TournamentSnap = {
  tournamentId: Id<"tournaments">;
  seasonId: Id<"seasons">;
  startDate: number;
  currentRound: number;
  livePlay: boolean;
  par: number;
  tierPoints: number[];
  tierPayouts: number[];
  isPlayoff: boolean;
  teams: Doc<"teams">[];
  tourCards: Doc<"tourCards">[];
  golfers: GolferSnap[];
};

type PlayoffContext =
  | {
      isPlayoff: false;
      eventIndex: 0;
      carryInByTourCardId: Record<string, number>;
    }
  | {
      isPlayoff: true;
      eventIndex: 1 | 2 | 3;
      carryInByTourCardId: Record<string, number>;
    };

function roundDecimal(n: number | null | undefined, places = 1): number | null {
  if (n == null) return null;
  return Math.round(n * 10 ** places) / 10 ** places;
}

export const getActiveTournamentIdForTeamsCron = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"tournaments"> | null> => {
    const active = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (active) return active._id;

    const live = await ctx.db
      .query("tournaments")
      .filter((q) => q.eq(q.field("livePlay"), true))
      .first();
    if (live) return live._id;

    const now = Date.now();
    const overlapping = await ctx.db
      .query("tournaments")
      .withIndex("by_dates", (q) => q.lte("startDate", now))
      .filter((q) => q.gte(q.field("endDate"), now))
      .first();

    return overlapping?._id ?? null;
  },
});

function isPlayoffTierName(name?: string | null): boolean {
  return (name ?? "").toLowerCase().includes("playoff");
}

export const getTournamentSnapshotForTeamsCron = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args): Promise<TournamentSnap> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const course = await ctx.db.get(tournament.courseId);
    if (!course) throw new Error("Course not found");

    const tier = await ctx.db.get(tournament.tierId);
    if (!tier) throw new Error("Tier not found");

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const tgs = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const golfers: GolferSnap[] = [];
    for (const tg of tgs) {
      const g = await ctx.db.get(tg.golferId);
      if (!g) continue;
      golfers.push({
        apiId: g.apiId,
        position: tg.position ?? null,
        score: tg.score ?? null,
        today: tg.today ?? null,
        thru: tg.thru ?? null,
        roundOneTeeTime: tg.roundOneTeeTime ?? null,
        roundOne: tg.roundOne ?? null,
        roundTwoTeeTime: tg.roundTwoTeeTime ?? null,
        roundTwo: tg.roundTwo ?? null,
        roundThreeTeeTime: tg.roundThreeTeeTime ?? null,
        roundThree: tg.roundThree ?? null,
        roundFourTeeTime: tg.roundFourTeeTime ?? null,
        roundFour: tg.roundFour ?? null,
      });
    }

    const isPlayoff = isPlayoffTierName(
      (tier.name as string | undefined) ?? null,
    );

    return {
      tournamentId: args.tournamentId,
      seasonId: tournament.seasonId,
      startDate: tournament.startDate,
      currentRound: tournament.currentRound ?? 1,
      livePlay: tournament.livePlay ?? false,
      par: course.par,
      tierPoints: tier.points ?? [],
      tierPayouts: tier.payouts ?? [],
      isPlayoff,
      teams,
      tourCards,
      golfers,
    };
  },
});

export const computePlayoffContext = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTierName(
      (tier?.name as string | undefined) ?? null,
    );

    if (!isPlayoff) {
      return {
        isPlayoff: false as const,
        eventIndex: 0 as const,
        carryInByTourCardId: {},
      };
    }

    const playoffEvents = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const playoffSorted = [] as Array<{
      id: Id<"tournaments">;
      startDate: number;
    }>;
    for (const t of playoffEvents) {
      const tTier = await ctx.db.get(t.tierId);
      if (!isPlayoffTierName((tTier?.name as string | undefined) ?? null))
        continue;
      playoffSorted.push({ id: t._id, startDate: t.startDate });
    }

    playoffSorted.sort((a, b) => a.startDate - b.startDate);
    const idx = playoffSorted.findIndex((t) => t.id === args.tournamentId);
    const eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);

    const prevId =
      eventIndex >= 2 ? playoffSorted[eventIndex - 2]?.id : undefined;
    if (!prevId) {
      return {
        isPlayoff: true as const,
        eventIndex,
        carryInByTourCardId: {},
      };
    }

    const prevTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", prevId))
      .collect();

    const carryInByTourCardId: Record<string, number> = {};
    for (const t of prevTeams) {
      carryInByTourCardId[String(t.tourCardId)] = t.score ?? 0;
    }

    return {
      isPlayoff: true as const,
      eventIndex,
      carryInByTourCardId,
    };
  },
});

export const applyTeamsUpdate = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    updates: v.array(
      v.object({
        teamId: v.id("teams"),
        round: v.number(),
        roundOne: v.optional(v.number()),
        roundTwo: v.optional(v.number()),
        roundThree: v.optional(v.number()),
        roundFour: v.optional(v.number()),
        today: v.optional(v.number()),
        thru: v.optional(v.number()),
        score: v.optional(v.number()),
        position: v.optional(v.string()),
        pastPosition: v.optional(v.string()),
        points: v.optional(v.number()),
        earnings: v.optional(v.number()),
        roundOneTeeTime: v.optional(v.string()),
        roundTwoTeeTime: v.optional(v.string()),
        roundThreeTeeTime: v.optional(v.string()),
        roundFourTeeTime: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let updated = 0;

    for (const u of args.updates) {
      const existing = await ctx.db.get(u.teamId);
      if (!existing) continue;

      if (existing.tournamentId !== args.tournamentId) continue;

      await ctx.db.patch(u.teamId, {
        round: u.round,
        roundOne: u.roundOne,
        roundTwo: u.roundTwo,
        roundThree: u.roundThree,
        roundFour: u.roundFour,
        today: u.today,
        thru: u.thru,
        score: u.score,
        position: u.position,
        pastPosition: u.pastPosition,
        points: u.points,
        earnings: u.earnings,
        roundOneTeeTime: u.roundOneTeeTime,
        roundTwoTeeTime: u.roundTwoTeeTime,
        roundThreeTeeTime: u.roundThreeTeeTime,
        roundFourTeeTime: u.roundFourTeeTime,
      });

      updated += 1;
    }

    return { updated };
  },
});

export const runUpdateTeamsForActiveTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    type Update = {
      teamId: Id<"teams">;
      round: 1 | 2 | 3 | 4 | 5;
      roundOne?: number;
      roundTwo?: number;
      roundThree?: number;
      roundFour?: number;
      today?: number;
      thru?: number;
      score?: number;
      position?: string;
      pastPosition?: string;
      points?: number;
      earnings?: number;
      roundOneTeeTime?: string;
      roundTwoTeeTime?: string;
      roundThreeTeeTime?: string;
      roundFourTeeTime?: string;
      _isCut: boolean;
    };

    const tournamentId =
      args.tournamentId ??
      (await ctx.runQuery(
        (internal.functions as any).cronTeams.getActiveTournamentIdForTeamsCron,
        {},
      ));

    if (!tournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_active_tournament",
      } as const;
    }

    const snap = (await ctx.runQuery(
      (internal.functions as any).cronTeams.getTournamentSnapshotForTeamsCron,
      { tournamentId },
    )) as TournamentSnap;

    type SnapGolfer = (typeof snap.golfers)[number];

    if (!snap.teams || snap.teams.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_teams",
        tournamentId,
      } as const;
    }

    const playoff = (await ctx.runQuery(
      (internal.functions as any).cronTeams.computePlayoffContext,
      { tournamentId },
    )) as PlayoffContext;

    const eventIndex = (playoff.isPlayoff ? playoff.eventIndex : 0) as
      | 0
      | 1
      | 2
      | 3;
    const carryInByTourCardId: Record<string, number> = playoff.isPlayoff
      ? playoff.carryInByTourCardId
      : {};
    const par: number = snap.par;
    const live: boolean = Boolean(snap.livePlay);
    const currentRound: number = snap.currentRound ?? 1;

    const updates: Update[] = [];
    for (const team of snap.teams) {
      const teamGolfers = snap.golfers.filter((g) =>
        team.golferIds.includes(g.apiId),
      );
      const active = teamGolfers.filter(
        (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
      );
      const r1Times = teamGolfers.map((g) => g.roundOneTeeTime);
      const r2Times = teamGolfers.map((g) => g.roundTwoTeeTime);
      const r3Times = teamGolfers.map((g) => g.roundThreeTeeTime);
      const r4Times = teamGolfers.map((g) => g.roundFourTeeTime);

      const earliestTimeStr = (
        times: Array<string | null | undefined>,
        position = 1,
      ) => {
        const valid = times.filter((t): t is string =>
          Boolean(t && t.trim().length),
        );
        if (!valid.length) return undefined;
        const pos = Math.max(1, Math.floor(position));
        try {
          const parsed = valid
            .map((t) => ({ t, d: new Date(t).getTime() }))
            .filter(({ d }) => !Number.isNaN(d));
          if (parsed.length === valid.length && parsed.length > 0) {
            parsed.sort((a, b) => a.d - b.d);
            return parsed[pos - 1]?.t;
          }
        } catch (err) {
          void err;
        }
        const sorted = [...valid].sort();
        return sorted[pos - 1];
      };

      const r = Math.min(5, Math.max(1, Math.floor(currentRound))) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      const tee1 = earliestTimeStr(r1Times, 1);
      const tee2 = earliestTimeStr(r2Times, 1);
      const tee3 = r >= 3 ? earliestTimeStr(r3Times, 6) : undefined;
      const tee4 = r >= 4 ? earliestTimeStr(r4Times, 6) : undefined;
      let base = 0;
      if (eventIndex !== 0) {
        if (eventIndex === 1) {
          const bracket = (() => {
            const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
            const p = tc?.playoff ?? 0;
            return p === 2 ? "silver" : p === 1 ? "gold" : null;
          })();

          if (bracket) {
            const participantIds = new Set(snap.teams.map((t) => t.tourCardId));
            const bracketFlag = bracket === "gold" ? 1 : 2;
            const group = snap.tourCards.filter(
              (c) =>
                participantIds.has(c._id) && (c.playoff ?? 0) === bracketFlag,
            );
            const sorted = [...group].sort(
              (a, b) => (b.points ?? 0) - (a.points ?? 0),
            );
            const me = sorted.find((c) => c._id === team.tourCardId);
            if (me) {
              const myPts = me.points ?? 0;
              const better = sorted.filter(
                (c) => (c.points ?? 0) > myPts,
              ).length;
              const tied = sorted.filter(
                (c) => (c.points ?? 0) === myPts,
              ).length;
              const strokes =
                bracket === "gold"
                  ? (snap.tierPoints ?? []).slice(0, 30)
                  : (snap.tierPoints ?? []).slice(0, 40);
              if (tied > 1) {
                const slice = strokes.slice(better, better + tied);
                const sum = slice.reduce(
                  (a: number, b: number) => a + (b ?? 0),
                  0,
                );
                base += tied > 0 ? Math.round((sum / tied) * 10) / 10 : 0;
              } else {
                base += strokes[better] ?? 0;
              }
            }
          }
        }

        if (eventIndex >= 2) {
          base += carryInByTourCardId[String(team.tourCardId)] ?? 0;
        }
      }

      const getRound = (g: SnapGolfer, n: 1 | 2 | 3 | 4) =>
        n === 1
          ? g.roundOne
          : n === 2
            ? g.roundTwo
            : n === 3
              ? g.roundThree
              : g.roundFour;

      const rankForRound = (
        golfers: SnapGolfer[],
        round: 1 | 2 | 3 | 4,
        liveMode: boolean,
      ) => {
        return [...golfers].sort((a, b) => {
          const va = liveMode
            ? (a.today ?? 0)
            : (getRound(a, round) ?? 0) - par;
          const vb = liveMode
            ? (b.today ?? 0)
            : (getRound(b, round) ?? 0) - par;
          if (va !== vb) return va - vb;
          const sa = a.score ?? 0;
          const sb = b.score ?? 0;
          if (sa !== sb) return sa - sb;
          return (a.apiId ?? 0) - (b.apiId ?? 0);
        });
      };

      const selectionCountFor = (ev: 0 | 1 | 2 | 3, round: 1 | 2 | 3 | 4) => {
        if (ev <= 1) return round <= 2 ? 10 : 5;
        if (ev === 2) return 5;
        return 3;
      };

      const pickTopN = (
        golfers: SnapGolfer[],
        round: 1 | 2 | 3 | 4,
        liveMode: boolean,
        n: number,
      ) => rankForRound(golfers, round, liveMode).slice(0, n);

      const avg = (nums: number[]) => {
        const list = nums.filter((n) => Number.isFinite(n));
        if (!list.length) return 0;
        return list.reduce((a, b) => a + b, 0) / list.length;
      };

      const avgOverPar = (golfers: SnapGolfer[], round: 1 | 2 | 3 | 4) => {
        const vals = golfers.map((g) => (getRound(g, round) ?? 0) - par);
        return avg(vals);
      };

      const avgToday = (golfers: SnapGolfer[]) =>
        avg(golfers.map((g) => g.today ?? 0));
      const avgThru = (golfers: SnapGolfer[]) =>
        avg(golfers.map((g) => g.thru ?? 0));

      const contrib = (round: 1 | 2 | 3 | 4, liveMode: boolean) => {
        const required = selectionCountFor(eventIndex, round);
        const eligible = team.golferIds.length > 0 && active.length >= required;
        if (!eligible) {
          const bracket = (() => {
            const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
            const p = tc?.playoff ?? 0;
            return p === 2 ? "silver" : p === 1 ? "gold" : "silver";
          })();
          const worst = { value: 0, thru: liveMode ? undefined : 18 };
          for (const t2 of snap.teams) {
            const tc2 = snap.tourCards.find((c) => c._id === t2.tourCardId);
            const p2 = tc2?.playoff ?? 0;
            const bracket2 = p2 === 2 ? "silver" : p2 === 1 ? "gold" : "silver";
            if (bracket2 !== bracket) continue;

            const tg2 = snap.golfers.filter((g) =>
              t2.golferIds.includes(g.apiId),
            );
            const active2 = tg2.filter(
              (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
            );
            const eligible2 =
              t2.golferIds.length > 0 && active2.length >= required;
            if (!eligible2) continue;

            const pool2 =
              required >= 10
                ? tg2
                : pickTopN(active2, round, liveMode, required);
            const today2 = liveMode
              ? avgToday(pool2)
              : avgOverPar(pool2, round);
            const thru2 = liveMode ? avgThru(pool2) : 18;
            if (today2 > worst.value) {
              worst.value = today2;
              worst.thru = thru2;
            }
          }

          return { today: worst.value, thru: worst.thru, overPar: worst.value };
        }

        const pool =
          required >= 10
            ? teamGolfers
            : pickTopN(active, round, liveMode, required);
        if (liveMode) {
          const today = avgToday(pool);
          const thru = avgThru(pool);
          return { today, thru, overPar: today };
        }
        const overPar = avgOverPar(pool, round);
        return { today: overPar, thru: 18, overPar };
      };

      const rawRoundPost = (round: 1 | 2 | 3 | 4) => {
        const required = selectionCountFor(eventIndex, round);
        const eligible = team.golferIds.length > 0 && active.length >= required;
        if (!eligible) {
          const fallback = contrib(round, false);
          return fallback.overPar + par;
        }
        const pool =
          required >= 10
            ? teamGolfers
            : pickTopN(active, round, false, required);
        return avg(pool.map((g) => getRound(g, round) ?? 0));
      };

      const r1Raw = rawRoundPost(1);
      const r2Raw = rawRoundPost(2);
      const r3Raw = rawRoundPost(3);
      const r4Raw = rawRoundPost(4);

      const r1Post = contrib(1, false);
      const r2Post = contrib(2, false);
      const r3Post = contrib(3, false);
      const r4Post = contrib(4, false);
      const isCut = eventIndex === 0 && r >= 3 && active.length < 5;

      let roundOne: number | undefined;
      let roundTwo: number | undefined;
      let roundThree: number | undefined;
      let roundFour: number | undefined;
      let today: number | undefined;
      let thru: number | undefined;
      let score: number | undefined;

      if (isCut) {
        roundOne = roundDecimal(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimal(r2Raw, 1) ?? undefined;
      } else if (r === 1) {
        if (live) {
          const liveC = contrib(1, true);
          today = roundDecimal(liveC.today, 1) ?? undefined;
          thru = roundDecimal(liveC.thru ?? null, 1) ?? undefined;
          score =
            eventIndex === 0
              ? (roundDecimal(avg(teamGolfers.map((g) => g.score ?? 0)), 1) ??
                undefined)
              : (roundDecimal(base + liveC.today, 1) ?? undefined);
        }
      } else if (r === 2) {
        roundOne = roundDecimal(r1Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(2, true);
          today = roundDecimal(liveC.today, 1) ?? undefined;
          thru = roundDecimal(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimal(base + (r1Post.overPar ?? 0) + liveC.today, 1) ??
            undefined;
        } else {
          today = roundDecimal(r1Post.overPar, 1) ?? undefined;
          thru = 18;
          score = roundDecimal(base + (r1Post.overPar ?? 0), 1) ?? undefined;
        }
      } else if (r === 3) {
        roundOne = roundDecimal(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimal(r2Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(3, true);
          today = roundDecimal(liveC.today, 1) ?? undefined;
          thru = roundDecimal(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimal(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                liveC.today,
              1,
            ) ?? undefined;
        } else {
          today = roundDecimal(r2Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimal(
              base + (r1Post.overPar ?? 0) + (r2Post.overPar ?? 0),
              1,
            ) ?? undefined;
        }
      } else if (r === 4) {
        roundOne = roundDecimal(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimal(r2Raw, 1) ?? undefined;
        roundThree = roundDecimal(r3Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(4, true);
          today = roundDecimal(liveC.today, 1) ?? undefined;
          thru = roundDecimal(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimal(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                (r3Post.overPar ?? 0) +
                liveC.today,
              1,
            ) ?? undefined;
        } else {
          today = roundDecimal(r3Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimal(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                (r3Post.overPar ?? 0),
              1,
            ) ?? undefined;
        }
      } else if (r === 5) {
        roundOne = roundDecimal(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimal(r2Raw, 1) ?? undefined;
        roundThree = roundDecimal(r3Raw, 1) ?? undefined;
        roundFour = roundDecimal(r4Raw, 1) ?? undefined;
        today = roundDecimal(r4Post.overPar, 1) ?? undefined;
        thru = 18;
        score =
          roundDecimal(
            base +
              (r1Post.overPar ?? 0) +
              (r2Post.overPar ?? 0) +
              (r3Post.overPar ?? 0) +
              (r4Post.overPar ?? 0),
            1,
          ) ?? undefined;
      }

      updates.push({
        teamId: team._id,
        round: r,
        roundOne,
        roundTwo,
        roundThree,
        roundFour,
        today,
        thru,
        score,
        roundOneTeeTime: tee1,
        roundTwoTeeTime: tee2,
        roundThreeTeeTime: tee3,
        roundFourTeeTime: tee4,
        _isCut: isCut,
      });
    }
    if (eventIndex === 0) {
      const labels = (() => {
        const withScore = updates
          .filter((u) => typeof u.score === "number")
          .sort((a, b) => (a.score as number) - (b.score as number));
        const map = new Map<string, string>();
        let i = 0;
        while (i < withScore.length) {
          const score = withScore[i]!.score as number;
          let j = i + 1;
          while (
            j < withScore.length &&
            (withScore[j]!.score as number) === score
          )
            j++;
          const tieCount = j - i;
          const label = (tieCount > 1 ? "T" : "") + (i + 1);
          for (let k = i; k < j; k++)
            map.set(String(withScore[k]!.teamId), label);
          i = j;
        }
        for (const u of updates) {
          if (u._isCut) map.set(String(u.teamId), "CUT");
        }
        return map;
      })();

      for (const u of updates) u.position = labels.get(String(u.teamId));
    } else {
      const playoffByTeamId = new Map<string, number>();
      for (const team of snap.teams) {
        const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
        playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
      }

      const assignBracket = (bracketFlag: 1 | 2) => {
        const bracketTeams = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === bracketFlag,
        );
        const withScore = bracketTeams
          .filter((u) => typeof u.score === "number")
          .sort((a, b) => (a.score as number) - (b.score as number));

        let i = 0;
        while (i < withScore.length) {
          const score = withScore[i]!.score as number;
          let j = i + 1;
          while (
            j < withScore.length &&
            (withScore[j]!.score as number) === score
          )
            j++;
          const tieCount = j - i;
          const label = (tieCount > 1 ? "T" : "") + (i + 1);
          for (let k = i; k < j; k++) withScore[k]!.position = label;
          i = j;
        }
      };

      assignBracket(1);
      assignBracket(2);
    }
    const parsePosNum = (pos?: string) => {
      const m = pos ? /\d+/.exec(pos) : null;
      return m ? parseInt(m[0], 10) : null;
    };

    const avgAwards = (arr: number[], start: number, count: number) => {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += arr[start + i] ?? 0;
      return count > 0 ? sum / count : 0;
    };

    const awardPointsAndEarnings = (group: Update[], offset: number) => {
      const byPos = new Map<number, Update[]>();
      for (const t of group) {
        const n = parsePosNum(t.position);
        if (!n || n <= 0) continue;
        const arr = byPos.get(n) ?? [];
        arr.push(t);
        byPos.set(n, arr);
      }
      const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
      for (const p of positions) {
        const tied = byPos.get(p)!;
        const count = tied.length;
        const baseIdx = p - 1 + offset;
        const pts = avgAwards(snap.tierPoints ?? [], baseIdx, count);
        const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
        for (const t of tied) {
          t.points = Math.round(pts);
          t.earnings = Math.round(pay);
        }
      }
    };

    const awardEarningsOnly = (group: Update[], offset: number) => {
      const byPos = new Map<number, Update[]>();
      for (const t of group) {
        const n = parsePosNum(t.position);
        if (!n || n <= 0) continue;
        const arr = byPos.get(n) ?? [];
        arr.push(t);
        byPos.set(n, arr);
      }
      const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
      for (const p of positions) {
        const tied = byPos.get(p)!;
        const count = tied.length;
        const baseIdx = p - 1 + offset;
        const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
        for (const t of tied) {
          t.points = 0;
          t.earnings = Math.round(pay);
        }
      }
    };

    if (eventIndex !== 0) {
      for (const u of updates) u.points = 0;

      const isFinalPlayoff = eventIndex === 3 && currentRound === 5;
      if (isFinalPlayoff) {
        const playoffByTeamId = new Map<string, number>();
        for (const team of snap.teams) {
          const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
          playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
        }
        const bracket1 = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === 1,
        );
        const bracket2 = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === 2,
        );
        awardEarningsOnly(bracket1, 0);
        awardEarningsOnly(bracket2, 75);
      } else {
        for (const u of updates) u.earnings = 0;
      }
    } else {
      awardPointsAndEarnings(updates, 0);
    }
    const cleanUpdates = updates.map(({ _isCut, ...rest }) => rest);

    return await ctx.runMutation(
      (internal.functions as any).cronTeams.applyTeamsUpdate,
      { tournamentId, updates: cleanUpdates },
    );
  },
});
