import { v } from "convex/values";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const CronJobNameValidator = v.union(
  v.literal("datagolf_live_sync"),
  v.literal("update_teams"),
  v.literal("recompute_standings"),
  v.literal("create_groups_for_next_tournament"),
);

type CronJobName =
  | "datagolf_live_sync"
  | "update_teams"
  | "recompute_standings"
  | "create_groups_for_next_tournament";

type CronRunOk = {
  ok: true;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  result: unknown;
};

type CronRunErr = {
  ok: false;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  error: {
    message: string;
    stack?: string;
  };
};

export const adminRunCronJob = action({
  args: {
    job: CronJobNameValidator,
    tournamentId: v.optional(v.id("tournaments")),
    confirm: v.boolean(),
  },
  handler: async (ctx, args): Promise<CronRunOk | CronRunErr> => {
    const startedAt = Date.now();

    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized: You must be signed in");
      }

      const member = await ctx.runQuery(api.functions.members.getMembers, {
        options: { clerkId: identity.subject },
      });

      const role =
        member &&
        typeof member === "object" &&
        !Array.isArray(member) &&
        "role" in member
          ? (member as { role?: unknown }).role
          : undefined;

      const normalizedRole =
        typeof role === "string" ? role.trim().toLowerCase() : "";

      if (normalizedRole !== "admin" && normalizedRole !== "moderator") {
        throw new Error("Forbidden: Moderator or admin access required");
      }

      if (!args.confirm) {
        throw new Error(
          "Confirmation required: set confirm=true to run a mutating cron job",
        );
      }

      let result: unknown;
      const tournamentId = args.tournamentId as Id<"tournaments"> | undefined;

      switch (args.job) {
        case "datagolf_live_sync": {
          result = await ctx.runAction(
            internal.functions.cronJobs.runDataGolfLiveSync,
            {
              tournamentId,
            },
          );
          break;
        }
        case "update_teams": {
          result = await ctx.runAction(
            internal.functions.cronTeams.runUpdateTeamsForActiveTournament,
            { tournamentId },
          );
          break;
        }
        case "create_groups_for_next_tournament": {
          result = await ctx.runAction(
            internal.functions.cronGroups.runCreateGroupsForNextTournament,
            { tournamentId },
          );
          break;
        }
        case "recompute_standings": {
          result = await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          );
          break;
        }
        default: {
          const exhaustiveCheck: never = args.job;
          throw new Error(`Unsupported job: ${exhaustiveCheck}`);
        }
      }

      const finishedAt = Date.now();
      return {
        ok: true,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        result,
      };
    } catch (err) {
      const finishedAt = Date.now();
      const message = err instanceof Error ? err.message : "Unknown error";
      const stack = err instanceof Error ? err.stack : undefined;
      return {
        ok: false,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: { message, stack },
      };
    }
  },
});
