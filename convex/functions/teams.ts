import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const updateTeamRoster = mutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      golferIds: args.apiIds,
      updatedAt: Date.now(),
    });
  },
});

export const updateTeam = mutation({
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
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.team._id, { ...args.team, updatedAt: Date.now() });
    return await ctx.db.get(args.team._id);
  },
});

export const createTeam = mutation({
  args: {
    data: v.object({
      tournamentId: v.id("tournaments"),
      tourCardId: v.id("tourCards"),
      golferIds: v.array(v.number()),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q
          .eq("tournamentId", args.data.tournamentId)
          .eq("tourCardId", args.data.tourCardId),
      )
      .first();

    if (existingTeam) {
      await ctx.db.patch(existingTeam._id, {
        ...args.data,
        updatedAt: Date.now(),
      });
      return await ctx.db.get(existingTeam._id);
    }

    const teamId = await ctx.db.insert("teams", {
      ...args.data,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(teamId);
  },
});

export const getTeamsForTournament = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
  },
});

export const createTeams = mutation({
  args: {
    teams: v.array(
      v.object({
        tournamentId: v.id("tournaments"),
        tourCardId: v.id("tourCards"),
        golferIds: v.array(v.number()),
        round: v.optional(v.number()),
        roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
        roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
        _creationTime: v.number(),
        _id: v.string(),
        earnings: v.number(),
        pastPosition: v.string(),
        points: v.number(),
        position: v.string(),
        roundOne: v.optional(v.number()),
        roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
        roundTwo: v.optional(v.number()),
        score: v.optional(v.number()),
        thru: v.optional(v.number()),
        today: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.teams[0].tournamentId);
    if (!tournament) {
      return [];
    }
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const teamIds = [];
    let index = 0;
    for (const teamData of args.teams) {
      const tourCard = tourCards[index];
      if (!tourCard._id) {
        continue;
      }
      const existingTeam = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", teamData.tournamentId)
            .eq("tourCardId", tourCard._id),
        )
        .first();

      if (existingTeam) {
        await ctx.db.patch(existingTeam._id, {
          tournamentId: teamData.tournamentId,
          tourCardId: tourCard._id,
          golferIds: teamData.golferIds,
          updatedAt: Date.now(),
        });
        teamIds.push(existingTeam._id);
      } else {
        const teamId = await ctx.db.insert("teams", {
          tournamentId: teamData.tournamentId,
          tourCardId: tourCard._id,
          golferIds: teamData.golferIds,
          updatedAt: Date.now(),
        });
        teamIds.push(teamId);
      }
      index++;
    }

    const teams = await Promise.all(teamIds.map((id) => ctx.db.get(id)));
    return teams;
  },
});
