import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function writeAuditLog(
  ctx: MutationCtx,
  args: {
    memberId?: Id<"members">;
    entityType: string;
    entityId: string;
    action: "created" | "updated" | "deleted" | "restored";
    changes?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    memberId: args.memberId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    changes: args.changes,
  });
}
