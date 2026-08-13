import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v, type Infer } from "convex/values";
import { getCurrentMember, requireAdmin } from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import {
  recomputeStandingsRanksForSeason,
  recomputeStandingsRowForCard,
  refreshStandingsForTeams,
  upsertStandingsContributionForTeam,
} from "../utils/standings";
import { projectPublicTeamWithRoster } from "../utils/publicDtos";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";
import {
  buildPlayoffAssignments,
  buildSeasonPlayoffStartingStrokes,
  type PlayoffLevel,
} from "../utils/playoffs";

function includesPlayoff(value: string | null | undefined): boolean {
  return typeof value === "string" && value.toLowerCase().includes("playoff");
}

async function getPlayoffContext(
  ctx: MutationCtx,
  tournament: Doc<"tournaments">,
) {
  const tournamentTier = await ctx.db.get(tournament.tierId);
  const isPlayoff =
    includesPlayoff(tournamentTier?.name) || includesPlayoff(tournament.name);
  if (!isPlayoff) {
    return {
      isPlayoff: false as const,
      eventIndex: -1,
      playoffTournaments: [] as Doc<"tournaments">[],
      tourCards: [] as Doc<"tourCards">[],
      assignments: new Map<string, PlayoffLevel>(),
      startingStrokes: new Map<string, number>(),
    };
  }

  const [seasonTournaments, tourCards, tours] = await Promise.all([
    ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(100),
    ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(500),
    ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(20),
  ]);
  const tierIds = [...new Set(seasonTournaments.map((item) => item.tierId))];
  const tiers = await Promise.all(tierIds.map((tierId) => ctx.db.get(tierId)));
  const tierNameById = new Map(
    tiers.filter(Boolean).map((tier) => [tier!._id, tier!.name] as const),
  );
  const playoffTournaments = seasonTournaments
    .filter(
      (item) =>
        includesPlayoff(tierNameById.get(item.tierId)) ||
        includesPlayoff(item.name),
    )
    .sort((a, b) => a.startDate - b.startDate);
  const eventIndex = playoffTournaments.findIndex(
    (item) => item._id === tournament._id,
  );
  const assignmentCards = tourCards.map((card) => ({
    id: String(card._id),
    tourId: String(card.tourId),
    points: card.points,
  }));
  const assignments = buildPlayoffAssignments({
    cards: assignmentCards,
    tours: tours.map((tour) => ({
      id: String(tour._id),
      playoffSpots: tour.playoffSpots,
    })),
  });

  return {
    isPlayoff: true as const,
    eventIndex,
    playoffTournaments,
    tourCards,
    assignments,
    startingStrokes: buildSeasonPlayoffStartingStrokes({
      cards: assignmentCards,
      assignments,
    }),
  };
}

function hasTeamScoringData(team: Doc<"teams">): boolean {
  return (
    (team.round ?? 0) > 0 ||
    team.today !== undefined ||
    team.thru !== undefined ||
    team.roundOne !== undefined ||
    team.roundTwo !== undefined ||
    team.roundThree !== undefined ||
    team.roundFour !== undefined
  );
}

export function applyPlayoffCarryoverToScore(args: {
  score: number | undefined;
  previousCarryover: number | undefined;
  nextCarryover: number;
  hasScoringData: boolean;
}): number {
  if (!args.hasScoringData) return args.nextCarryover;
  return (args.score ?? 0) - (args.previousCarryover ?? 0) + args.nextCarryover;
}

function toOptionalNumber(
  value: number | null | undefined,
): number | undefined {
  return value === null ? undefined : value;
}

function toOptionalRoundTeeTime(
  value: number | string | null | undefined,
): number | string | undefined {
  return value === null ? undefined : value;
}

export const updateTeamRoster = internalMutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.teamId);
    if (
      !existing ||
      (existing.golferIds.length === args.apiIds.length &&
        existing.golferIds.every(
          (golferId, index) => golferId === args.apiIds[index],
        ))
    ) {
      return { changed: false } as const;
    }
    await ctx.db.patch(args.teamId, {
      golferIds: args.apiIds,
      updatedAt: Date.now(),
      updatedRosterAt: Date.now(),
    });
    return { changed: true } as const;
  },
});

const teamUpdateValidator = v.object({
  _id: v.id("teams"),
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
  today: v.optional(v.union(v.number(), v.null())),
  thru: v.optional(v.union(v.number(), v.null())),
  round: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
  roundOne: v.optional(v.union(v.number(), v.null())),
  roundTwoTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
  roundTwo: v.optional(v.union(v.number(), v.null())),
  roundThreeTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
  roundThree: v.optional(v.union(v.number(), v.null())),
  roundFourTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
  roundFour: v.optional(v.union(v.number(), v.null())),
});

export type TeamUpdate = Infer<typeof teamUpdateValidator>;

async function applyTeamUpdate(ctx: MutationCtx, teamUpdate: TeamUpdate) {
  const { _id, ...team } = teamUpdate;
  const existing = await ctx.db.get(_id);
  if (!existing) {
    return { document: null, changed: false, canonicalChanged: false } as const;
  }
  const candidate = {
    ...team,
    today: toOptionalNumber(team.today),
    thru: toOptionalNumber(team.thru),
    roundOneTeeTime: toOptionalRoundTeeTime(team.roundOneTeeTime),
    roundOne: toOptionalNumber(team.roundOne),
    roundTwoTeeTime: toOptionalRoundTeeTime(team.roundTwoTeeTime),
    roundTwo: toOptionalNumber(team.roundTwo),
    roundThreeTeeTime: toOptionalRoundTeeTime(team.roundThreeTeeTime),
    roundThree: toOptionalNumber(team.roundThree),
    roundFourTeeTime: toOptionalRoundTeeTime(team.roundFourTeeTime),
    roundFour: toOptionalNumber(team.roundFour),
  };
  const patch = Object.fromEntries(
    Object.entries(candidate).filter(
      ([key, value]) => existing[key as keyof typeof existing] !== value,
    ),
  );
  if (Object.keys(patch).length === 0) {
    return {
      document: existing,
      changed: false,
      canonicalChanged: false,
    } as const;
  }
  await ctx.db.patch(_id, { ...patch, updatedAt: Date.now() });
  const document = await ctx.db.get(_id);
  const canonicalFields = new Set([
    "earnings",
    "points",
    "position",
    "score",
    "roundOne",
    "roundTwo",
    "roundThree",
    "roundFour",
  ]);
  return {
    document,
    changed: true,
    canonicalChanged: Object.keys(patch).some((key) =>
      canonicalFields.has(key),
    ),
  } as const;
}

export const updateTeam = internalMutation({
  args: { team: teamUpdateValidator },
  handler: async (ctx, args) => {
    const result = await applyTeamUpdate(ctx, args.team);
    if (result.canonicalChanged && result.document) {
      await refreshStandingsForTeams(ctx, [result.document]);
    }
    return result.document;
  },
});

export const applyTeamUpdatesBatch = internalMutation({
  args: { updates: v.array(teamUpdateValidator) },
  handler: async (ctx, args) => {
    if (args.updates.length > 25) throw new Error("Batch limit is 25 teams");
    let changed = 0;
    const canonicalChanges = [];
    for (const update of args.updates) {
      const result = await applyTeamUpdate(ctx, update);
      if (result.changed) changed += 1;
      if (result.canonicalChanged && result.document) {
        canonicalChanges.push(result.document);
      }
    }
    if (canonicalChanges.length > 0) {
      await refreshStandingsForTeams(ctx, canonicalChanges);
    }
    return { seen: args.updates.length, changed };
  },
});

export const saveMyTournamentTeam = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    tourCardId: v.id("tourCards"),
    golferIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const [tournament, tourCard] = await Promise.all([
      ctx.db.get(args.tournamentId),
      ctx.db.get(args.tourCardId),
    ]);
    if (!tournament || !tourCard) {
      throw new Error("Tournament or tour card not found");
    }
    if (tourCard.memberId !== member._id) {
      throw new Error("Forbidden: This tour card does not belong to you");
    }
    if (tourCard.seasonId !== tournament.seasonId) {
      throw new Error(
        "Tour card and tournament must belong to the same season",
      );
    }
    if (member.account < 0) {
      throw new Error(
        "Your account balance must be paid before submitting picks",
      );
    }

    const now = Date.now();
    if (
      tournament.status === "active" ||
      tournament.status === "completed" ||
      tournament.status === "cancelled" ||
      now < tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS ||
      now >= tournament.startDate
    ) {
      throw new Error("Tournament picks are closed");
    }
    const uniqueGolferIds = [...new Set(args.golferIds)];
    if (
      uniqueGolferIds.length !== 10 ||
      uniqueGolferIds.length !== args.golferIds.length
    ) {
      throw new Error("Select exactly 10 distinct golfers");
    }

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .take(500);
    const playoffContext = await getPlayoffContext(ctx, tournament);
    const playoffLevel = playoffContext.assignments.get(
      String(tourCard._id),
    ) as PlayoffLevel | undefined;
    if (playoffContext.isPlayoff && (!playoffLevel || playoffLevel < 1)) {
      throw new Error("This tour card is not eligible for the playoffs");
    }
    if (playoffContext.isPlayoff && playoffContext.eventIndex !== 0) {
      throw new Error("Picks carry over after the first playoff tournament");
    }
    const playoffCarryoverScore = playoffContext.isPlayoff
      ? (playoffContext.startingStrokes.get(String(tourCard._id)) ?? 0)
      : undefined;

    const golferByApiId = new Map<number, number>();
    for (const tournamentGolfer of tournamentGolfers) {
      const apiId =
        tournamentGolfer.golferApiId ??
        (await ctx.db.get(tournamentGolfer.golferId))?.apiId;
      if (apiId !== undefined)
        golferByApiId.set(apiId, tournamentGolfer.group ?? 0);
    }
    const groupCounts = new Map<number, number>();
    for (const golferId of uniqueGolferIds) {
      const group = golferByApiId.get(golferId);
      if (!group || group < 1) {
        throw new Error("Every selected golfer must be in a tournament group");
      }
      const count = (groupCounts.get(group) ?? 0) + 1;
      if (count > 2) {
        throw new Error(`Select no more than two golfers from group ${group}`);
      }
      groupCounts.set(group, count);
    }

    const existing = await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q.eq("tournamentId", tournament._id).eq("tourCardId", tourCard._id),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        golferIds: uniqueGolferIds,
        seasonId: tourCard.seasonId,
        tourId: tourCard.tourId,
        memberId: tourCard.memberId,
        displayName: tourCard.displayName,
        playoff: playoffContext.isPlayoff ? playoffLevel : tourCard.playoff,
        ...(playoffContext.isPlayoff
          ? {
              playoffCarryoverScore,
              score: playoffCarryoverScore,
            }
          : {}),
        updatedAt: now,
        updatedRosterAt: now,
      });
      await writeAuditLog(ctx, {
        memberId: member._id,
        entityType: "team",
        entityId: String(existing._id),
        action: "updated",
        changes: { tournamentId: String(tournament._id) },
      });
      const updated = await ctx.db.get(existing._id);
      return updated ? projectPublicTeamWithRoster(updated) : null;
    }

    const teamId = await ctx.db.insert("teams", {
      tournamentId: tournament._id,
      tourCardId: tourCard._id,
      golferIds: uniqueGolferIds,
      seasonId: tourCard.seasonId,
      tourId: tourCard.tourId,
      memberId: tourCard.memberId,
      displayName: tourCard.displayName,
      playoff: playoffContext.isPlayoff ? playoffLevel : tourCard.playoff,
      ...(playoffContext.isPlayoff
        ? {
            playoffCarryoverScore,
            score: playoffCarryoverScore,
          }
        : {}),
      updatedAt: now,
      updatedRosterAt: now,
    });
    await writeAuditLog(ctx, {
      memberId: member._id,
      entityType: "team",
      entityId: String(teamId),
      action: "created",
      changes: { tournamentId: String(tournament._id) },
    });
    const created = await ctx.db.get(teamId);
    return created ? projectPublicTeamWithRoster(created) : null;
  },
});

/**
 * Removes ineligible playoff teams and repairs bracket/carryover metadata for
 * qualified teams. The operation is idempotent and is run after the daily
 * standings recomputation so accidental or legacy rows cannot enter a playoff
 * leaderboard or be copied into the next leg.
 */
export const reconcilePlayoffTeamsForSeason = internalMutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const seasonTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .take(100);
    const tiers = await Promise.all(
      [...new Set(seasonTournaments.map((item) => item.tierId))].map((tierId) =>
        ctx.db.get(tierId),
      ),
    );
    const tierNameById = new Map(
      tiers.filter(Boolean).map((tier) => [tier!._id, tier!.name] as const),
    );
    const playoffTournaments = seasonTournaments
      .filter(
        (tournament) =>
          includesPlayoff(tierNameById.get(tournament.tierId)) ||
          includesPlayoff(tournament.name),
      )
      .sort((a, b) => a.startDate - b.startDate);
    const firstPlayoffTournament = playoffTournaments[0];
    if (!firstPlayoffTournament) {
      return { scanned: 0, created: 0, removed: 0, repaired: 0 } as const;
    }

    const context = await getPlayoffContext(ctx, firstPlayoffTournament);
    const playoffPicksClosed = Date.now() >= firstPlayoffTournament.startDate;
    const affectedCardIds = new Set<Id<"tourCards">>();
    for (const card of context.tourCards) {
      const playoff = context.assignments.get(String(card._id)) ?? 0;
      if ((card.playoff ?? 0) !== playoff) {
        await ctx.db.patch(card._id, { playoff, updatedAt: Date.now() });
      }
    }

    let scanned = 0;
    let created = 0;
    let removed = 0;
    let repaired = 0;
    let previousTeamsByCard = new Map<string, Doc<"teams">>();

    for (const [eventIndex, tournament] of playoffTournaments.entries()) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .take(500);
      const course = await ctx.db.get(tournament.courseId);
      const currentTeamsByCard = new Map<string, Doc<"teams">>();

      const cardsNeedingAutomaticTeam = !playoffPicksClosed
        ? []
        : eventIndex === 0
          ? context.tourCards.filter(
              (card) =>
                (context.assignments.get(String(card._id)) ?? 0) > 0 &&
                !teams.some((team) => team.tourCardId === card._id),
            )
          : context.tourCards.filter((card) => {
              const previousTeam = previousTeamsByCard.get(String(card._id));
              return (
                previousTeam?.golferIds.length === 0 &&
                !teams.some((team) => team.tourCardId === card._id)
              );
            });

      for (const card of cardsNeedingAutomaticTeam) {
        const playoff = context.assignments.get(String(card._id)) ?? 0;
        const previousTeam = previousTeamsByCard.get(String(card._id));
        const carryover =
          eventIndex === 0
            ? (context.startingStrokes.get(String(card._id)) ?? 0)
            : (previousTeam?.score ?? previousTeam?.playoffCarryoverScore ?? 0);
        const teamId = await ctx.db.insert("teams", {
          tournamentId: tournament._id,
          tourCardId: card._id,
          golferIds: [],
          seasonId: card.seasonId,
          tourId: card.tourId,
          memberId: card.memberId,
          displayName: card.displayName,
          playoff,
          playoffCarryoverScore: carryover,
          score: carryover,
          ...(course
            ? {
                roundOne: course.par,
                roundTwo: course.par,
                roundThree: course.par,
                roundFour: course.par,
              }
            : {}),
          updatedAt: Date.now(),
        });
        const automaticTeam = await ctx.db.get(teamId);
        if (automaticTeam) teams.push(automaticTeam);
        affectedCardIds.add(card._id);
        created += 1;
      }

      for (const team of teams) {
        scanned += 1;
        affectedCardIds.add(team.tourCardId);
        const card = context.tourCards.find(
          (candidate) => candidate._id === team.tourCardId,
        );
        const playoff = context.assignments.get(String(team.tourCardId)) ?? 0;
        const previousTeam = previousTeamsByCard.get(String(team.tourCardId));
        const removalReason =
          !card || playoff === 0
            ? "tour_card_not_qualified_for_playoffs"
            : eventIndex > 0 && !previousTeam
              ? "missing_previous_playoff_team"
              : null;

        if (removalReason) {
          const contribution = await ctx.db
            .query("standingsContributions")
            .withIndex("by_tour_card_tournament", (q) =>
              q
                .eq("tourCardId", team.tourCardId)
                .eq("tournamentId", tournament._id),
            )
            .first();
          if (contribution) await ctx.db.delete(contribution._id);
          await writeAuditLog(ctx, {
            memberId: team.memberId ?? card?.memberId,
            entityType: "team",
            entityId: String(team._id),
            action: "deleted",
            changes: {
              reason: removalReason,
              tournamentId: String(tournament._id),
              tourCardId: String(team.tourCardId),
              snapshot: team,
            },
          });
          await ctx.db.delete(team._id);
          removed += 1;
          continue;
        }

        const carryover =
          eventIndex === 0
            ? (context.startingStrokes.get(String(team.tourCardId)) ?? 0)
            : (previousTeam?.score ?? previousTeam?.playoffCarryoverScore ?? 0);
        const next: Partial<Doc<"teams">> = {
          seasonId: card!.seasonId,
          tourId: card!.tourId,
          memberId: card!.memberId,
          displayName: card!.displayName,
          playoff,
          playoffCarryoverScore: carryover,
          score: applyPlayoffCarryoverToScore({
            score: team.score,
            previousCarryover: team.playoffCarryoverScore,
            nextCarryover: carryover,
            hasScoringData: hasTeamScoringData(team),
          }),
          ...(team.golferIds.length === 0 && course
            ? {
                roundOne: course.par,
                roundTwo: course.par,
                roundThree: course.par,
                roundFour: course.par,
              }
            : {}),
          ...(previousTeam
            ? {
                golferIds: previousTeam.golferIds,
                pastPosition: previousTeam.position,
              }
            : {}),
        };
        const changed = Object.entries(next).some(([key, value]) => {
          const current = team[key as keyof Doc<"teams">];
          return Array.isArray(current) && Array.isArray(value)
            ? current.length !== value.length ||
                current.some((item, index) => item !== value[index])
            : current !== value;
        });
        if (changed) {
          await ctx.db.patch(team._id, { ...next, updatedAt: Date.now() });
          repaired += 1;
        }
        const updated = (await ctx.db.get(team._id))!;
        await upsertStandingsContributionForTeam(ctx, updated);
        currentTeamsByCard.set(String(team.tourCardId), updated);
      }

      previousTeamsByCard = currentTeamsByCard;
    }

    let standingsRowsRecomputed = 0;
    for (const cardId of affectedCardIds) {
      const card = await ctx.db.get(cardId);
      if (!card) continue;
      const existingRow = await ctx.db
        .query("standingsRows")
        .withIndex("by_card_season_variant", (q) =>
          q
            .eq("tourCardId", card._id)
            .eq("seasonId", card.seasonId)
            .eq("variant", "regular"),
        )
        .first();
      // Preserve legacy card totals when their materialized standings history
      // has not been backfilled yet.
      if (!existingRow) continue;
      await recomputeStandingsRowForCard(ctx, cardId);
      standingsRowsRecomputed += 1;
    }
    if (standingsRowsRecomputed > 0) {
      await recomputeStandingsRanksForSeason(ctx, args.seasonId);
    }

    return { scanned, created, removed, repaired } as const;
  },
});

export const adminImportTeamsFromJson = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    teamsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await getCurrentMember(ctx);
    await requireAdmin(ctx);
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    const playoffContext = await getPlayoffContext(ctx, tournament);
    if (playoffContext.isPlayoff && playoffContext.eventIndex !== 0) {
      throw new Error("Picks carry over after the first playoff tournament");
    }
    const parsed: unknown = JSON.parse(args.teamsJson);
    if (!Array.isArray(parsed)) {
      throw new Error("Teams JSON must be an array");
    }
    let imported = 0;
    for (const row of parsed) {
      if (!row || typeof row !== "object") {
        throw new Error("Every imported team must be an object");
      }
      const record = row as Record<string, unknown>;
      const tourCardId =
        typeof record.tourCardId === "string"
          ? ctx.db.normalizeId("tourCards", record.tourCardId)
          : null;
      const golferIds = Array.isArray(record.golferIds)
        ? record.golferIds.filter(
            (value): value is number => typeof value === "number",
          )
        : [];
      if (!tourCardId || golferIds.length === 0) {
        throw new Error("Each team requires a valid tourCardId and golferIds");
      }
      const tourCard = await ctx.db.get(tourCardId);
      if (!tourCard || tourCard.seasonId !== tournament.seasonId) {
        throw new Error("Imported tour card was not found in this season");
      }
      const playoff = playoffContext.isPlayoff
        ? (playoffContext.assignments.get(String(tourCardId)) ?? 0)
        : tourCard.playoff;
      if (playoffContext.isPlayoff && playoff === 0) {
        throw new Error("Imported tour card is not eligible for the playoffs");
      }
      const playoffCarryoverScore = playoffContext.isPlayoff
        ? (playoffContext.startingStrokes.get(String(tourCardId)) ?? 0)
        : undefined;
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q.eq("tournamentId", args.tournamentId).eq("tourCardId", tourCardId),
        )
        .first();
      const patch = {
        golferIds,
        seasonId: tourCard.seasonId,
        tourId: tourCard.tourId,
        memberId: tourCard.memberId,
        displayName: tourCard.displayName,
        playoff,
        playoffCarryoverScore,
        score:
          typeof record.score === "number"
            ? record.score
            : playoffCarryoverScore,
        position:
          typeof record.position === "string" ? record.position : undefined,
        updatedAt: Date.now(),
        updatedRosterAt: Date.now(),
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("teams", {
          tournamentId: args.tournamentId,
          tourCardId,
          ...patch,
        });
      }
      imported += 1;
    }
    await writeAuditLog(ctx, {
      memberId: actor._id,
      entityType: "tournament",
      entityId: String(args.tournamentId),
      action: "updated",
      changes: { importedTeams: imported },
    });
    return { imported };
  },
});
