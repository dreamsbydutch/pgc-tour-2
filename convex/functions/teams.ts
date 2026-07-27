import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentMember, requireAdmin } from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";

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

export const updateTeam = internalMutation({
  args: {
    team: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    const { _id, ...team } = args.team;
    const existing = await ctx.db.get(_id);
    if (!existing) {
      return null;
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
      return existing;
    }
    await ctx.db.patch(_id, { ...patch, updatedAt: Date.now() });
    return await ctx.db.get(_id);
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

    const [tier, tournamentGolfers] = await Promise.all([
      ctx.db.get(tournament.tierId),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ]);
    const isPlayoff = (tier?.name ?? "").toLowerCase().includes("playoff");
    if (isPlayoff && (tourCard.playoff ?? 0) < 1) {
      throw new Error("This tour card is not eligible for the playoffs");
    }
    if (isPlayoff) {
      const seasonTournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect();
      const tierById = new Map(
        await Promise.all(
          [...new Set(seasonTournaments.map((item) => item.tierId))].map(
            async (tierId) => [tierId, await ctx.db.get(tierId)] as const,
          ),
        ),
      );
      const playoffTournaments = seasonTournaments
        .filter((item) =>
          (tierById.get(item.tierId)?.name ?? "")
            .toLowerCase()
            .includes("playoff"),
        )
        .sort((a, b) => a.startDate - b.startDate);
      if (
        playoffTournaments.findIndex((item) => item._id === tournament._id) > 0
      ) {
        throw new Error("Picks carry over after the first playoff tournament");
      }
    }

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
      return await ctx.db.get(existing._id);
    }

    const teamId = await ctx.db.insert("teams", {
      tournamentId: tournament._id,
      tourCardId: tourCard._id,
      golferIds: uniqueGolferIds,
      seasonId: tourCard.seasonId,
      tourId: tourCard.tourId,
      memberId: tourCard.memberId,
      displayName: tourCard.displayName,
      playoff: tourCard.playoff,
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
    return await ctx.db.get(teamId);
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
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q.eq("tournamentId", args.tournamentId).eq("tourCardId", tourCardId),
        )
        .first();
      const patch = {
        golferIds,
        score: typeof record.score === "number" ? record.score : undefined,
        position:
          typeof record.position === "string" ? record.position : undefined,
        updatedAt: Date.now(),
        updatedRosterAt: Date.now(),
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        const tourCard = await ctx.db.get(tourCardId);
        if (!tourCard) throw new Error("Imported tour card was not found");
        await ctx.db.insert("teams", {
          tournamentId: args.tournamentId,
          tourCardId,
          seasonId: tourCard.seasonId,
          tourId: tourCard.tourId,
          memberId: tourCard.memberId,
          displayName: tourCard.displayName,
          playoff: tourCard.playoff,
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
