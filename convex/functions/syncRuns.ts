import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../utils/auth";

export const acquire = internalMutation({
  args: {
    jobName: v.string(),
    runKey: v.string(),
    trigger: v.union(v.literal("scheduled"), v.literal("manual")),
    actorMemberId: v.optional(v.id("members")),
    tournamentId: v.optional(v.id("tournaments")),
    leaseMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const running = await ctx.db
      .query("syncRuns")
      .withIndex("by_job_status", (q) =>
        q.eq("jobName", args.jobName).eq("status", "running"),
      )
      .take(20);
    for (const run of running) {
      if (run.leaseExpiresAt > now) {
        return { acquired: false as const, runId: run._id };
      }
      await ctx.db.patch(run._id, {
        status: "abandoned",
        finishedAt: now,
        durationMs: now - run.startedAt,
        error: "Lease expired before the run finalized",
      });
    }
    const runId = await ctx.db.insert("syncRuns", {
      jobName: args.jobName,
      runKey: args.runKey,
      trigger: args.trigger,
      status: "running",
      actorMemberId: args.actorMemberId,
      tournamentId: args.tournamentId,
      startedAt: now,
      leaseExpiresAt: now + Math.max(args.leaseMs, 60_000),
    });
    return { acquired: true as const, runId };
  },
});

export const finalize = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    status: v.union(
      v.literal("succeeded"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    changedRows: v.optional(v.number()),
    skipReason: v.optional(v.string()),
    upstreamUpdatedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return;
    const finishedAt = Date.now();
    await ctx.db.patch(run._id, {
      status: args.status,
      finishedAt,
      durationMs: finishedAt - run.startedAt,
      changedRows: args.changedRows,
      skipReason: args.skipReason,
      upstreamUpdatedAt: args.upstreamUpdatedAt,
      error: args.error?.slice(0, 500),
    });
  },
});

export const recordAdminInvocation = internalMutation({
  args: {
    memberId: v.id("members"),
    jobName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      memberId: args.memberId,
      entityType: "maintenanceJob",
      entityId: args.jobName,
      action: "updated",
      changes: { invokedAt: Date.now() },
    });
  },
});

export const adminListRecent = query({
  args: {
    jobName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_job_started", (q) => q.eq("jobName", args.jobName))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 20, 1), 100));
  },
});
