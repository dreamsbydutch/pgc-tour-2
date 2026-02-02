import { v } from "convex/values";

export const emailsValidators = {
  args: {
    getActiveTourCardRecipientsForTournament: {
      tournamentId: v.id("tournaments"),
    },
    getMissingTeamReminderRecipientsForUpcomingTournament: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    markGroupsEmailSent: {
      tournamentId: v.id("tournaments"),
    },
    getActiveMemberEmailRecipients: {},
    markReminderEmailSent: {
      tournamentId: v.id("tournaments"),
    },
    getIsAdminByClerkId: {
      clerkId: v.string(),
    },
    adminGetGroupsEmailPreview: {
      tournamentId: v.id("tournaments"),
    },
    sendGroupsEmailForTournament: {
      tournamentId: v.id("tournaments"),
      customBlurb: v.optional(v.string()),
      force: v.optional(v.boolean()),
    },
    adminSendGroupsEmailForTournament: {
      tournamentId: v.id("tournaments"),
      customBlurb: v.optional(v.string()),
      force: v.optional(v.boolean()),
    },
    sendMissingTeamReminderForUpcomingTournament: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    sendGroupsEmailTest: {
      tournamentId: v.id("tournaments"),
      customBlurb: v.optional(v.string()),
    },
    sendSeasonStartEmailTest: {
      customBlurb: v.optional(v.string()),
      reigningChampion: v.optional(v.string()),
      clubhouseUrl: v.optional(v.string()),
    },
    adminGetSeasonStartEmailPreview: {},
    adminSendSeasonStartEmailToActiveMembers: {
      customBlurb: v.optional(v.string()),
      reigningChampion: v.optional(v.string()),
      clubhouseUrl: v.optional(v.string()),
    },
    sendMissingTeamReminderEmailTest: {
      tournamentId: v.optional(v.id("tournaments")),
    },
  },
} as const;
