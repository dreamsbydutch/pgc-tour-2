import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

export const getRequestContext = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    name: string;
    startDate: number;
    endDate: number;
    courseApiId?: string;
    courseName?: string;
  } | null> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;
    const course = await ctx.db.get(tournament.courseId);
    return {
      name: tournament.name,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      courseApiId: course?.apiId,
      courseName: course?.name,
    };
  },
});
