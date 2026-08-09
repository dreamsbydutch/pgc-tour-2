import type { FunctionReturnType } from "convex/server";

import type { api } from "convex/_generated/api";

export type NotificationCategory =
  | "leagueUpdates"
  | "pickReminders"
  | "finalResults"
  | "teamMoments"
  | "financial"
  | "milestones";

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export type NotificationCenterDto = FunctionReturnType<
  typeof api.functions.notifications.getMyCenter
>;

export type NotificationCenterItem = NotificationCenterDto["items"][number];

export type PushDeviceState =
  | "unsupported"
  | "not-configured"
  | "not-enabled"
  | "blocked"
  | "enabled"
  | "busy"
  | "error";
