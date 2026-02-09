import type { Id } from "../_generated/dataModel";

export type AuditAction = "created" | "updated" | "deleted" | "restored";

export type AuditLogChanges = Record<string, { old: unknown; new: unknown }>;

export type AuditLogParams = {
  memberId?: Id<"members">;
  clerkId?: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: AuditLogChanges;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};
