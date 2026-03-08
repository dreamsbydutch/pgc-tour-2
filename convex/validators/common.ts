import { v } from "convex/values";

export const validators = {
  stringLength: (
    str: string | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (!str) return null;
    const trimmed = str.trim();
    if (trimmed.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    if (trimmed.length > max) {
      return `${fieldName} cannot exceed ${max} characters`;
    }
    return null;
  },

  numberRange: (
    num: number | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < min || num > max) {
      return `${fieldName} must be between ${min} and ${max}`;
    }
    return null;
  },

  url: (url: string | undefined, fieldName: string): string | null => {
    if (!url) return null;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `${fieldName} must be a valid HTTP/HTTPS URL`;
    }
    return null;
  },

  positiveNumber: (
    num: number | undefined,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < 0) {
      return `${fieldName} cannot be negative`;
    }
    return null;
  },
};

export const valueTransforms = {
  safeTrim: (value: unknown): string => {
    return typeof value === "string" ? value.trim() : "";
  },
  safeLowerTrim: (value: unknown): string => {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  },
  safeUpperTrim: (value: unknown): string => {
    return typeof value === "string" ? value.trim().toUpperCase() : "";
  },
  normalizeWhitespace: (value: unknown): string => {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim();
  },
} as const;

export const idValidators = {
  tournamentId: v.id("tournaments"),
  optionalTournamentId: v.optional(v.id("tournaments")),
  tourCardId: v.id("tourCards"),
  seasonId: v.id("seasons"),
  optionalSeasonId: v.optional(v.id("seasons")),
  tourId: v.id("tours"),
  memberId: v.id("members"),
} as const;

export const sharedArgs = {
  none: {},
  tournamentId: {
    tournamentId: idValidators.tournamentId,
  },
  optionalTournamentId: {
    tournamentId: idValidators.optionalTournamentId,
  },
  clerkId: {
    clerkId: v.string(),
  },
} as const;

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

export const tourCardsValidators = {
  args: {
    createTourCards: {
      data: v.object({
        memberId: v.optional(v.id("members")),
        displayName: v.string(),
        tourId: v.id("tours"),
        seasonId: v.id("seasons"),
        earnings: v.number(),
        points: v.number(),
        wins: v.optional(v.number()),
        topTen: v.number(),
        topFive: v.optional(v.number()),
        madeCut: v.number(),
        appearances: v.number(),
        playoff: v.optional(v.number()),
        currentPosition: v.optional(v.string()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
        }),
      ),
    },
    getTourCards: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("tourCards")),
          memberId: v.optional(v.id("members")),
          clerkId: v.optional(v.string()),
          seasonId: v.optional(v.id("seasons")),
          tourId: v.optional(v.id("tours")),
        }),
      ),
    },
    getActiveMembersMissingTourCards: {
      seasonId: idValidators.seasonId,
      previousSeasonId: idValidators.optionalSeasonId,
    },
    getCurrentYearTourCard: {
      options: v.object({
        clerkId: v.string(),
        year: v.number(),
      }),
    },
    getReservedTourSpotsForSeason: {
      options: v.object({
        seasonId: idValidators.seasonId,
      }),
    },
    updateTourCards: {
      id: idValidators.tourCardId,
      data: v.object({
        displayName: v.optional(v.string()),
        earnings: v.optional(v.number()),
        points: v.optional(v.number()),
        wins: v.optional(v.number()),
        topTen: v.optional(v.number()),
        topFive: v.optional(v.number()),
        madeCut: v.optional(v.number()),
        appearances: v.optional(v.number()),
        playoff: v.optional(v.number()),
        currentPosition: v.optional(v.string()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
        }),
      ),
    },
    switchTourCards: {
      id: idValidators.tourCardId,
      tourId: idValidators.tourId,
    },
    deleteTourCards: {
      id: idValidators.tourCardId,
    },
    recomputeTourCardsForSeasonAsAdmin: {
      seasonId: idValidators.seasonId,
    },
    deleteTourCardAndFee: {
      id: idValidators.tourCardId,
    },
  },
} as const;
