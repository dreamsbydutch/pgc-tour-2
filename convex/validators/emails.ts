import { v } from "convex/values";
import { idValidators, sharedArgs } from "./_shared";

export const emailsValidators = {
  args: {
    getActiveTourCardRecipientsForTournament: sharedArgs.tournamentId,
    getMissingTeamReminderRecipientsForUpcomingTournament:
      sharedArgs.optionalTournamentId,
    markGroupsEmailSent: sharedArgs.tournamentId,
    getActiveMemberEmailRecipients: sharedArgs.none,
    markReminderEmailSent: sharedArgs.tournamentId,
    getIsAdminByClerkId: sharedArgs.clerkId,
    adminGetGroupsEmailPreview: sharedArgs.tournamentId,
    sendGroupsEmailForTournament: {
      tournamentId: idValidators.tournamentId,
      customBlurb: v.optional(v.string()),
      force: v.optional(v.boolean()),
    },
    adminSendGroupsEmailForTournament: {
      tournamentId: idValidators.tournamentId,
      customBlurb: v.optional(v.string()),
      force: v.optional(v.boolean()),
    },
    sendMissingTeamReminderForUpcomingTournament:
      sharedArgs.optionalTournamentId,
    sendGroupsEmailTest: {
      tournamentId: idValidators.tournamentId,
      customBlurb: v.optional(v.string()),
    },
    sendSeasonStartEmailTest: {
      customBlurb: v.optional(v.string()),
      reigningChampion: v.optional(v.string()),
      clubhouseUrl: v.optional(v.string()),
    },
    adminGetSeasonStartEmailPreview: sharedArgs.none,
    adminSendSeasonStartEmailToActiveMembers: {
      customBlurb: v.optional(v.string()),
      reigningChampion: v.optional(v.string()),
      clubhouseUrl: v.optional(v.string()),
    },
    getUpcomingTournamentId: sharedArgs.none,
    adminSendWeeklyRecapEmailToActiveTourCards: {
      tournamentId: idValidators.optionalTournamentId,
      customBlurb: v.optional(v.string()),
    },
    sendWeeklyRecapEmailTest: {
      tournamentId: idValidators.optionalTournamentId,
      customBlurb: v.optional(v.string()),
    },
    sendMissingTeamReminderEmailTest: sharedArgs.optionalTournamentId,
  },
} as const;
