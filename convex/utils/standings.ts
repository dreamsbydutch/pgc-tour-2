import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { parsePositionNumber } from "./misc";

type StandingsAggregationTeam = Pick<
  Doc<"teams">,
  "tournamentId" | "points" | "earnings" | "position"
>;

type StandingsAggregationTournament = Pick<
  Doc<"tournaments">,
  "_id" | "tierId" | "name" | "status"
>;

type StandingsAggregationTier = Pick<Doc<"tiers">, "_id" | "name">;

export function includesPlayoffLabel(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.toLowerCase().includes("playoff");
}

/** Canonical standings formula shared by the legacy and materialized paths. */
export function buildTourCardStandingsTotals(args: {
  teams: StandingsAggregationTeam[];
  tournaments: StandingsAggregationTournament[];
  tiers: StandingsAggregationTier[];
}) {
  const tournamentById = new Map(
    args.tournaments.map((tournament) => [tournament._id, tournament] as const),
  );
  const tierNameById = new Map(
    args.tiers.map((tier) => [tier._id, tier.name] as const),
  );
  const completed = args.teams.filter(
    (team) => tournamentById.get(team.tournamentId)?.status === "completed",
  );
  const regularSeasonCompleted = completed.filter((team) => {
    const tournament = tournamentById.get(team.tournamentId);
    if (!tournament) return false;
    const tierName = tierNameById.get(tournament.tierId) ?? null;
    return (
      !includesPlayoffLabel(tierName) && !includesPlayoffLabel(tournament.name)
    );
  });
  const regularSeasonPoints = regularSeasonCompleted.reduce(
    (sum, team) => sum + Math.round(team.points ?? 0),
    0,
  );
  const completedEarnings = completed.reduce(
    (sum, team) => sum + (team.earnings ?? 0),
    0,
  );
  return {
    wins: regularSeasonCompleted.filter((team) => {
      const position = parsePositionNumber(team.position ?? null);
      return position !== null && position === 1;
    }).length,
    topFive: regularSeasonCompleted.filter((team) => {
      const position = parsePositionNumber(team.position ?? null);
      return position !== null && position <= 5;
    }).length,
    topTen: regularSeasonCompleted.filter((team) => {
      const position = parsePositionNumber(team.position ?? null);
      return position !== null && position <= 10;
    }).length,
    madeCut: regularSeasonCompleted.filter((team) => team.position !== "CUT")
      .length,
    appearances: regularSeasonCompleted.length,
    points: Math.round(regularSeasonPoints),
    earnings: Math.round(completedEarnings),
    pastPoints: Math.round(
      regularSeasonPoints -
        (regularSeasonCompleted[regularSeasonCompleted.length - 1]?.points ??
          0),
    ),
    pastEarnings: Math.round(
      completedEarnings - (completed[completed.length - 1]?.earnings ?? 0),
    ),
    totalPoints: Math.round(
      args.teams.reduce((sum, team) => sum + (team.points ?? 0), 0),
    ),
    totalEarnings: Math.round(
      args.teams.reduce((sum, team) => sum + Math.round(team.earnings ?? 0), 0),
    ),
  };
}

function changedFields<T extends Record<string, unknown>>(
  existing: object,
  next: T,
) {
  const current = existing as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => current[key] !== value),
  ) as Partial<T>;
}

export async function upsertStandingsContributionForTeam(
  ctx: MutationCtx,
  team: Doc<"teams">,
) {
  const [tournament, card] = await Promise.all([
    ctx.db.get(team.tournamentId),
    ctx.db.get(team.tourCardId),
  ]);
  if (!tournament || !card) return null;
  const tier = await ctx.db.get(tournament.tierId);
  if (!tier) return null;
  const now = Date.now();
  const value = {
    seasonId: tournament.seasonId,
    tourId: card.tourId,
    tourCardId: card._id,
    tournamentId: tournament._id,
    memberId: card.memberId,
    displayName: card.displayName,
    tournamentName: tournament.name,
    tournamentLogoUrl: tournament.logoUrl,
    tournamentStartDate: tournament.startDate,
    tournamentEndDate: tournament.endDate,
    tournamentStatus: tournament.status,
    tierId: tier._id,
    tierName: tier.name,
    isPlayoff:
      includesPlayoffLabel(tier.name) || includesPlayoffLabel(tournament.name),
    points: team.points,
    earnings: team.earnings,
    position: team.position,
    score: team.score,
    roundOne: team.roundOne,
    roundTwo: team.roundTwo,
    roundThree: team.roundThree,
    roundFour: team.roundFour,
    updatedAt: now,
  };
  const existing = await ctx.db
    .query("standingsContributions")
    .withIndex("by_tour_card_tournament", (q) =>
      q.eq("tourCardId", card._id).eq("tournamentId", tournament._id),
    )
    .unique();
  if (!existing) {
    return await ctx.db.insert("standingsContributions", value);
  }
  const { updatedAt: _updatedAt, ...stableValue } = value;
  const patch = changedFields(existing, stableValue);
  if (Object.keys(patch).length === 0) return existing._id;
  await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
  return existing._id;
}

export async function recomputeStandingsRowForCard(
  ctx: MutationCtx,
  tourCardId: Id<"tourCards">,
) {
  const card = await ctx.db.get(tourCardId);
  if (!card) return null;
  const contributions = await ctx.db
    .query("standingsContributions")
    .withIndex("by_tour_card_season", (q) =>
      q.eq("tourCardId", card._id).eq("seasonId", card.seasonId),
    )
    .take(100);
  const totals = buildTourCardStandingsTotals({
    teams: contributions.map((item) => ({
      tournamentId: item.tournamentId,
      points: item.points,
      earnings: item.earnings,
      position: item.position,
    })),
    tournaments: contributions.map((item) => ({
      _id: item.tournamentId,
      tierId: item.tierId,
      name: item.tournamentName,
      status: item.tournamentStatus,
    })),
    tiers: contributions.map((item) => ({
      _id: item.tierId,
      name: item.tierName,
    })),
  });
  const latestRegular = contributions
    .filter(
      (item) =>
        item.tournamentStatus === "completed" && item.isPlayoff === false,
    )
    .sort((a, b) => b.tournamentEndDate - a.tournamentEndDate)[0];
  const baseValue = {
    seasonId: card.seasonId,
    tourId: card.tourId,
    tourCardId: card._id,
    memberId: card.memberId,
    displayName: card.displayName,
    variant: "regular" as const,
    points: totals.points,
    earnings: totals.earnings,
    wins: totals.wins,
    topFive: totals.topFive,
    topTen: totals.topTen,
    madeCut: totals.madeCut,
    appearances: totals.appearances,
    pastPoints: totals.points - Math.round(latestRegular?.points ?? 0),
  };
  const existing = await ctx.db
    .query("standingsRows")
    .withIndex("by_card_season_variant", (q) =>
      q
        .eq("tourCardId", card._id)
        .eq("seasonId", card.seasonId)
        .eq("variant", "regular"),
    )
    .unique();
  const now = Date.now();
  if (!existing) {
    await ctx.db.insert("standingsRows", {
      ...baseValue,
      rank: 1,
      currentPosition: "1",
      playoff: 0,
      posChange: 0,
      posChangePO: 0,
      updatedAt: now,
    });
  } else {
    const patch = changedFields(existing, baseValue);
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    }
  }
  return { seasonId: card.seasonId, tourId: card.tourId };
}

function sortRows(
  rows: Doc<"standingsRows">[],
  points: (row: Doc<"standingsRows">) => number,
) {
  return [...rows].sort((a, b) => {
    const pointsDelta = points(b) - points(a);
    if (pointsDelta !== 0) return pointsDelta;
    const nameDelta = a.displayName.localeCompare(b.displayName);
    if (nameDelta !== 0) return nameDelta;
    return String(a.tourCardId).localeCompare(String(b.tourCardId));
  });
}

/** Recomputes rank/delta fields only from lean standings rows. */
export async function recomputeStandingsRanksForSeason(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
) {
  const rows = await ctx.db
    .query("standingsRows")
    .withIndex("by_season_variant", (q) =>
      q.eq("seasonId", seasonId).eq("variant", "regular"),
    )
    .take(500);
  const tourIds = Array.from(new Set(rows.map((row) => row.tourId)));
  const tours = await Promise.all(tourIds.map((tourId) => ctx.db.get(tourId)));
  const tourById = new Map(
    tours.filter(Boolean).map((tour) => [tour!._id, tour!] as const),
  );
  const currentOverall = sortRows(rows, (row) => row.points);
  const pastOverall = sortRows(rows, (row) => row.pastPoints);
  const currentOverallRank = new Map(
    currentOverall.map((row, index) => [row._id, index + 1] as const),
  );
  const pastOverallRank = new Map(
    pastOverall.map((row, index) => [row._id, index + 1] as const),
  );
  let changed = 0;
  for (const tourId of tourIds) {
    const tourRows = rows.filter((row) => row.tourId === tourId);
    const current = sortRows(tourRows, (row) => row.points);
    const past = sortRows(tourRows, (row) => row.pastPoints);
    const currentRank = new Map(
      current.map((row, index) => [row._id, index + 1] as const),
    );
    const pastRank = new Map(
      past.map((row, index) => [row._id, index + 1] as const),
    );
    const tour = tourById.get(tourId);
    for (const row of tourRows) {
      const samePointsCount = tourRows.filter(
        (candidate) => candidate.points === row.points,
      ).length;
      const betterPointsCount = tourRows.filter(
        (candidate) => candidate.points > row.points,
      ).length;
      const rank = betterPointsCount + 1;
      const currentPosition = `${samePointsCount > 1 ? "T" : ""}${rank}`;
      const playoff = !tour
        ? 0
        : betterPointsCount < (tour.playoffSpots[0] ?? 0)
          ? 1
          : betterPointsCount <
              (tour.playoffSpots[0] ?? 0) + (tour.playoffSpots[1] ?? 0)
            ? 2
            : 0;
      const next = {
        rank,
        currentPosition,
        playoff,
        posChange:
          (pastRank.get(row._id) ?? 999) - (currentRank.get(row._id) ?? 999),
        posChangePO:
          (pastOverallRank.get(row._id) ?? 999) -
          (currentOverallRank.get(row._id) ?? 999),
      };
      const patch = changedFields(row, next);
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
        changed += 1;
      }
      const card = await ctx.db.get(row.tourCardId);
      if (card) {
        const legacy = {
          points: row.points,
          earnings: row.earnings,
          wins: row.wins,
          topFive: row.topFive,
          topTen: row.topTen,
          madeCut: row.madeCut,
          appearances: row.appearances,
          currentPosition,
          playoff,
        };
        const legacyPatch = changedFields(card, legacy);
        if (Object.keys(legacyPatch).length > 0) {
          await ctx.db.patch(card._id, {
            ...legacyPatch,
            updatedAt: Date.now(),
          });
        }
      }
    }
  }
  return { rows: rows.length, changed };
}

export async function refreshStandingsForTeams(
  ctx: MutationCtx,
  teams: Doc<"teams">[],
) {
  const uniqueTeams = [
    ...new Map(teams.map((team) => [team._id, team])).values(),
  ];
  for (const team of uniqueTeams) {
    await upsertStandingsContributionForTeam(ctx, team);
  }
  const cardIds = Array.from(
    new Set(uniqueTeams.map((team) => team.tourCardId)),
  );
  const affected = [];
  for (const cardId of cardIds) {
    const result = await recomputeStandingsRowForCard(ctx, cardId);
    if (result) affected.push(result);
  }
  const seasonIds = Array.from(new Set(affected.map((item) => item.seasonId)));
  for (const seasonId of seasonIds) {
    await recomputeStandingsRanksForSeason(ctx, seasonId);
  }
  return { teams: uniqueTeams.length, tourCards: cardIds.length };
}
