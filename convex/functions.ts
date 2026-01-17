/**
 * Top-level Compatibility Layer (convex/functions.ts)
 *
 * This file contains backward-compatibility shims for older client calls.
 * Do NOT duplicate these exports in convex/functions/index.ts or other modules.
 *
 * Convention:
 * - functions.ts = canonical location for app-wide compatibility exports
 * - functions/index.ts = re-exports only
 * - functions/*.ts = domain modules with primary CRUD functions
 *
 * Compatibility shim: getMember
 * Legacy: `functions:getMember` (used by older clients)
 * Prefer: `api.functions.members.getMembers({ options: { clerkId } })` in new code
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

export const getMember = query({
  args: {
    id: v.optional(v.id("members")),
    clerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.id) {
      return await ctx.db.get(args.id);
    }

    if (args.clerkId) {
      return await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId!))
        .first();
    }

    return null;
  },
});
