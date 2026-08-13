import type { Id } from "../_generated/dataModel";

export const NOTIFICATION_CATEGORIES = [
  "leagueUpdates",
  "pickReminders",
  "finalResults",
  "teamMoments",
  "financial",
  "milestones",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferenceValues = Record<
  NotificationCategory,
  boolean
>;

export type NotificationRecipient = {
  memberId: Id<"members">;
  title: string;
  body: string;
  href: string;
};
