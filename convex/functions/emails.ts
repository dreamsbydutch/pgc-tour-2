import { emailsValidators } from "../validators/common";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { GroupsEmailContext } from "../types/emails";
import { requireAdmin, requireAdminAction } from "./auth";
import {
  formatMemberName,
  getChampionsStringForTournamentId,
  getLeaderboardRowsForTournament,
  getUpcomingTournament,
  getAppBaseUrl,
  getBrevoApiKey,
  getBrevoTestTo,
  parseNumericEnv,
  parseNumericEnvOptional,
  buildTournamentUrl,
  buildGroupsEmailLeaderboardTemplateParams,
  sendBrevoTemplateEmailBatch,
} from "../utils/emails";

type TournamentDoc = Doc<"tournaments">;
type MemberDoc = Doc<"members">;
type TourCardDoc = Doc<"tourCards">;
type EmailRecipient = GroupsEmailContext["recipients"][number];

function getCurrentYear(): number {
  return new Date(Date.now()).getFullYear();
}

function getLogoDetails(logoUrl: unknown): {
  logoUrl: string;
  logoDisplay: "inline-block" | "none";
} {
  const normalizedLogoUrl = typeof logoUrl === "string" ? logoUrl : "";
  return {
    logoUrl: normalizedLogoUrl,
    logoDisplay: normalizedLogoUrl ? "inline-block" : "none",
  };
}

function getPreviousCompletedTournament(
  tournaments: TournamentDoc[],
  tournament: TournamentDoc,
  now: number,
): TournamentDoc | undefined {
  return tournaments
    .filter(
      (candidate) =>
        candidate.startDate < tournament.startDate &&
        (candidate.status === "completed" || candidate.endDate <= now),
    )
    .sort((left, right) => right.startDate - left.startDate)[0];
}

async function buildGroupsEmailContext(
  ctx: QueryCtx,
  tournamentId: Id<"tournaments">,
): Promise<GroupsEmailContext> {
  const tournament = await ctx.db.get(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const [season, tournaments, tourCards] = await Promise.all([
    ctx.db.get(tournament.seasonId),
    ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
    ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
  ]);

  const previousTournament = getPreviousCompletedTournament(
    tournaments,
    tournament,
    Date.now(),
  );

  const [champions, leaderboardRows] = previousTournament
    ? await Promise.all([
        getChampionsStringForTournamentId({
          ctx,
          tournamentId: previousTournament._id,
        }),
        getLeaderboardRowsForTournament({
          ctx,
          tournamentId: previousTournament._id,
        }),
      ])
    : ["", []];

  const uniqueTourCardByMemberId = new Map<Id<"members">, TourCardDoc>();
  for (const tourCard of tourCards) {
    if (!uniqueTourCardByMemberId.has(tourCard.memberId)) {
      uniqueTourCardByMemberId.set(tourCard.memberId, tourCard);
    }
  }

  const members = await Promise.all(
    [...uniqueTourCardByMemberId.keys()].map((memberId) =>
      ctx.db.get(memberId),
    ),
  );

  const recipients = members
    .filter((member): member is MemberDoc => Boolean(member))
    .filter((member) => member.isActive !== false)
    .map((member) => ({
      memberId: member._id,
      tourCardId: uniqueTourCardByMemberId.get(member._id)?._id,
      email: member.email,
      name: formatMemberName(member),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));

  return {
    tournament,
    seasonYear: season?.year ?? getCurrentYear(),
    previousTournamentName: previousTournament?.name ?? "",
    previousTournamentLogoUrl: getLogoDetails(previousTournament?.logoUrl)
      .logoUrl,
    champions,
    leaderboardRows,
    recipients,
    activeTourCardCount: tourCards.length,
    memberCount: recipients.length,
  };
}

function buildTournamentEmailParams(args: {
  context: GroupsEmailContext;
  baseUrl: string;
  recipientTourCardId?: string;
  customBlurb?: string;
}): Record<string, string | number> {
  const tournamentLogo = getLogoDetails(args.context.tournament.logoUrl);
  const previousTournamentLogo = getLogoDetails(
    args.context.previousTournamentLogoUrl,
  );
  const leaderboardParams = buildGroupsEmailLeaderboardTemplateParams({
    leaderboardRows: args.context.leaderboardRows,
    recipientTourCardId: args.recipientTourCardId ?? "",
  });

  return {
    tournamentName: args.context.tournament.name,
    seasonYear: args.context.seasonYear ?? getCurrentYear(),
    previousTournamentName: args.context.previousTournamentName ?? "",
    previousTournamentLogoUrl: previousTournamentLogo.logoUrl,
    previousTournamentLogoDisplay: previousTournamentLogo.logoDisplay,
    champions: args.context.champions ?? "",
    pgcLogoUrl: `${args.baseUrl}/logo192.png`,
    nextUpUrl: buildTournamentUrl({
      baseUrl: args.baseUrl,
      tournamentId: String(args.context.tournament._id),
    }),
    nextUpLogoUrl: tournamentLogo.logoUrl,
    nextUpLogoDisplay: tournamentLogo.logoDisplay,
    customBlurb: (args.customBlurb ?? "").trim(),
    ...leaderboardParams,
  };
}

function buildTournamentEmailRecipients(args: {
  context: GroupsEmailContext;
  baseUrl: string;
  customBlurb?: string;
}) {
  return args.context.recipients.map((recipient) => ({
    email: recipient.email,
    name: recipient.name,
    params: buildTournamentEmailParams({
      context: args.context,
      baseUrl: args.baseUrl,
      recipientTourCardId: recipient.tourCardId
        ? String(recipient.tourCardId)
        : "",
      customBlurb: args.customBlurb,
    }),
  }));
}

function findEmailRecipientByAddress(
  recipients: EmailRecipient[],
  email: string,
): EmailRecipient | null {
  return recipients.find((recipient) => recipient.email === email) ?? null;
}

async function resolveUpcomingTournamentId(
  ctx: ActionCtx,
  tournamentId: Id<"tournaments"> | undefined,
): Promise<Id<"tournaments"> | null> {
  if (tournamentId) {
    return tournamentId;
  }

  const result = await ctx.runQuery(
    internal.functions.emails.getUpcomingTournamentId,
    {},
  );
  return result.tournamentId;
}

async function sendGroupsEmailInternal(args: {
  ctx: ActionCtx;
  tournamentId: Id<"tournaments">;
  customBlurb?: string;
  force?: boolean;
}): Promise<
  | {
      ok: true;
      skipped: true;
      reason: "already_sent";
      tournamentId: Id<"tournaments">;
    }
  | {
      ok: true;
      skipped: false;
      tournamentId: Id<"tournaments">;
      attempted: number;
      sent: number;
      failed: number;
      memberCount: number;
      activeTourCardCount: number;
    }
> {
  const context = (await args.ctx.runQuery(
    internal.functions.emails.getActiveTourCardRecipientsForTournament,
    { tournamentId: args.tournamentId },
  )) as GroupsEmailContext;

  if (context.tournament.groupsEmailSentAt && !args.force) {
    return {
      ok: true,
      skipped: true,
      reason: "already_sent",
      tournamentId: context.tournament._id,
    };
  }

  const summary = await sendBrevoTemplateEmailBatch({
    apiKey: getBrevoApiKey(),
    templateId: parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID"),
    recipients: buildTournamentEmailRecipients({
      context,
      baseUrl: getAppBaseUrl({ allowLocalhostFallback: false }),
      customBlurb: args.customBlurb,
    }),
  });

  if (summary.sent > 0) {
    await args.ctx.runMutation(internal.functions.emails.markGroupsEmailSent, {
      tournamentId: context.tournament._id,
    });
  }

  return {
    ok: true,
    skipped: false,
    tournamentId: context.tournament._id,
    attempted: summary.attempted,
    sent: summary.sent,
    failed: summary.failed,
    memberCount: context.memberCount,
    activeTourCardCount: context.activeTourCardCount,
  };
}

/**
 * Lists unique email recipients for the tournament based on “active” tour cards.
 * In this schema, “active tour card” is interpreted as a tour card in the tournament’s season.
 */
export const getActiveTourCardRecipientsForTournament = internalQuery({
  args: emailsValidators.args.getActiveTourCardRecipientsForTournament,
  handler: async (ctx, args) => buildGroupsEmailContext(ctx, args.tournamentId),
});

/**
 * Lists unique email recipients for the “missing team” reminder.
 * Targets members where `isActive !== false` who have no team submitted for that upcoming tournament,
 * including members with no tour card.
 */
export const getMissingTeamReminderRecipientsForUpcomingTournament =
  internalQuery({
    args: emailsValidators.args
      .getMissingTeamReminderRecipientsForUpcomingTournament,
    handler: async (ctx, args) => {
      const tournament = args.tournamentId
        ? await ctx.db.get(args.tournamentId)
        : await getUpcomingTournament(ctx);

      if (!tournament) {
        return {
          ok: true,
          skipped: true,
          reason: "no_upcoming_tournament",
        } as const;
      }

      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect();

      const tourCardsWithTeams = new Set<string>(
        teams.map((t) => t.tourCardId),
      );

      const missingTourCards = tourCards.filter(
        (tc) => !tourCardsWithTeams.has(tc._id),
      );

      const missingByMemberId = new Map<Id<"members">, number>();
      for (const tc of missingTourCards) {
        missingByMemberId.set(
          tc.memberId,
          (missingByMemberId.get(tc.memberId) ?? 0) + 1,
        );
      }

      const members = await Promise.all(
        [...missingByMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
      );

      const activeMembers = (await ctx.db.query("members").collect()).filter(
        (m) => m.isActive !== false,
      );

      const membersWithTourCards = new Set<Id<"members">>();
      const memberIdByTourCardId = new Map<Id<"tourCards">, Id<"members">>();
      for (const tourCard of tourCards) {
        membersWithTourCards.add(tourCard.memberId);
        memberIdByTourCardId.set(tourCard._id, tourCard.memberId);
      }

      const missingByEmail = new Map<
        string,
        {
          email: string;
          name: string;
          missingTeamCount: number;
        }
      >();

      for (const member of members.filter((m): m is Doc<"members"> =>
        Boolean(m),
      )) {
        if (member.isActive === false) continue;
        const email = (member.email ?? "").trim();
        if (!email) continue;
        const key = email.toLowerCase();
        const count = missingByMemberId.get(member._id) ?? 1;
        if (!missingByEmail.has(key)) {
          missingByEmail.set(key, {
            email,
            name: formatMemberName(member),
            missingTeamCount: count,
          });
        } else {
          const existing = missingByEmail.get(key)!;
          existing.missingTeamCount = Math.max(
            existing.missingTeamCount,
            count,
          );
        }
      }

      const membersWithAnyTeam = new Set<Id<"members">>();
      for (const team of teams) {
        const memberId = memberIdByTourCardId.get(team.tourCardId);
        if (memberId) {
          membersWithAnyTeam.add(memberId);
        }
      }

      for (const member of activeMembers) {
        if (!member || member.isActive === false) continue;
        const email = (member.email ?? "").trim();
        if (!email) continue;
        if (membersWithAnyTeam.has(member._id)) continue;
        const key = email.toLowerCase();
        if (missingByEmail.has(key)) continue;

        missingByEmail.set(key, {
          email,
          name: formatMemberName(member),
          missingTeamCount: 1,
        });
      }

      const recipients = [...missingByEmail.values()].sort((a, b) =>
        a.email.localeCompare(b.email),
      );

      return {
        ok: true,
        skipped: false,
        tournament,
        recipients,
      } as const;
    },
  });

export const markGroupsEmailSent = internalMutation({
  args: emailsValidators.args.markGroupsEmailSent,
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.tournamentId, { groupsEmailSentAt: now });
    return { tournamentId: args.tournamentId, groupsEmailSentAt: now };
  },
});

/**
 * Lists email recipients for league-wide emails (e.g. season opener).
 * Targets all members where `isActive !== false`.
 */
export const getActiveMemberEmailRecipients = internalQuery({
  args: emailsValidators.args.getActiveMemberEmailRecipients,
  handler: async (ctx) => {
    const members = await ctx.db.query("members").collect();

    const byEmail = new Map<string, { email: string; name?: string }>();

    for (const m of members) {
      if (m.isActive === false) continue;
      const email = (m.email ?? "").trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, { email, name: formatMemberName(m) });
      }
    }

    const recipients = [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );

    return {
      ok: true,
      recipients,
      recipientCount: recipients.length,
    } as const;
  },
});

export const getUpcomingTournamentId = internalQuery({
  args: emailsValidators.args.getUpcomingTournamentId,
  handler: async (ctx) => {
    const tournament = await getUpcomingTournament(ctx);
    return {
      ok: true,
      tournamentId: tournament?._id ?? null,
    } as const;
  },
});

export const markReminderEmailSent = internalMutation({
  args: emailsValidators.args.markReminderEmailSent,
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.tournamentId, { reminderEmailSentAt: now });
    return { tournamentId: args.tournamentId, reminderEmailSentAt: now };
  },
});

/**
 * Admin-only preview for the “groups are set” email.
 * Returns stats only (no recipient list).
 */
export const adminGetGroupsEmailPreview: ReturnType<typeof query> = query({
  args: emailsValidators.args.adminGetGroupsEmailPreview,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const context = await buildGroupsEmailContext(ctx, args.tournamentId);

    return {
      ok: true,
      tournamentId: context.tournament._id,
      tournamentName: context.tournament.name,
      groupsEmailSentAt: context.tournament.groupsEmailSentAt ?? null,
      previousTournamentName: context.previousTournamentName,
      champions: context.champions,
      memberCount: context.memberCount,
      activeTourCardCount: context.activeTourCardCount,
      recipientCount: context.recipients.length,
    } as const;
  },
});

/**
 * Sends the “groups are set” email via Brevo to members with a tour card in the tournament’s season.
 * Idempotent via `tournaments.groupsEmailSentAt`.
 */
export const sendGroupsEmailForTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: emailsValidators.args.sendGroupsEmailForTournament,
    handler: async (ctx, args) => {
      return await sendGroupsEmailInternal({
        ctx,
        tournamentId: args.tournamentId,
        customBlurb: args.customBlurb,
        force: args.force,
      });
    },
  });

/**
 * Admin-only manual send for the “groups are set” email.
 * Allows injecting a custom blurb for the email body.
 */
export const adminSendGroupsEmailForTournament = action({
  args: emailsValidators.args.adminSendGroupsEmailForTournament,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    return await sendGroupsEmailInternal({
      ctx,
      tournamentId: args.tournamentId,
      customBlurb: args.customBlurb,
      force: args.force,
    });
  },
});

/**
 * Admin-only manual send for a weekly recap email.
 * By default, targets the upcoming tournament (to determine the season recipients).
 */
export const adminSendWeeklyRecapEmailToActiveTourCards = action({
  args: emailsValidators.args.adminSendWeeklyRecapEmailToActiveTourCards,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const resolvedTournamentId = await resolveUpcomingTournamentId(
      ctx,
      args.tournamentId,
    );

    if (!resolvedTournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const tournamentContext = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: resolvedTournamentId },
    )) as GroupsEmailContext;

    const tournament = tournamentContext.tournament;
    const apiKey = getBrevoApiKey();
    const templateId =
      parseNumericEnvOptional("BREVO_WEEKLY_RECAP_TEMPLATE_ID") ??
      parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients: buildTournamentEmailRecipients({
        context: tournamentContext,
        baseUrl: getAppBaseUrl({ allowLocalhostFallback: false }),
        customBlurb: args.customBlurb,
      }),
    });

    return {
      ok: true,
      skipped: false,
      tournamentId: tournament._id,
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      memberCount: tournamentContext.memberCount,
      activeTourCardCount: tournamentContext.activeTourCardCount,
    } as const;
  },
});

/**
 * Sends a single weekly recap test email to `BREVO_TEST_TO`.
 * This never emails your full league list.
 */
export const sendWeeklyRecapEmailTest: ReturnType<typeof action> = action({
  args: emailsValidators.args.sendWeeklyRecapEmailTest,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const resolvedTournamentId = await resolveUpcomingTournamentId(
      ctx,
      args.tournamentId,
    );

    if (!resolvedTournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const apiKey = getBrevoApiKey();
    const templateId =
      parseNumericEnvOptional("BREVO_WEEKLY_RECAP_TEMPLATE_ID") ??
      parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const tournamentContext = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: resolvedTournamentId },
    )) as GroupsEmailContext;

    const tournament = tournamentContext.tournament;
    const baseUrl = getAppBaseUrl({ allowLocalhostFallback: true });
    const testRecipient = findEmailRecipientByAddress(
      tournamentContext.recipients,
      testTo,
    );
    const recipientTourCardId = testRecipient?.tourCardId
      ? String(testRecipient.tourCardId)
      : "";

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      includeErrorReasons: true,
      recipients: [
        {
          email: testTo,
          name: testRecipient?.name,
          params: buildTournamentEmailParams({
            context: tournamentContext,
            baseUrl,
            recipientTourCardId,
            customBlurb: args.customBlurb,
          }),
        },
      ],
    });

    return {
      ok: true,
      mode: "test",
      testTo,
      tournamentId: tournament._id,
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      messageIds: summary.messageIds ?? [],
      errorReasons: summary.errorReasons ?? [],
      wouldEmailMemberCount: tournamentContext.memberCount,
      wouldEmailActiveTourCardCount: tournamentContext.activeTourCardCount,
    } as const;
  },
});

/**
 * Sends a “missing team” reminder via Brevo to members with a tour card in the tournament’s season
 * and no team submitted for that upcoming tournament.
 * Idempotent via `tournaments.reminderEmailSentAt`.
 */
export const sendMissingTeamReminderForUpcomingTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: emailsValidators.args.sendMissingTeamReminderForUpcomingTournament,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.functions.emails
        .getMissingTeamReminderRecipientsForUpcomingTournament,
      { tournamentId: args.tournamentId },
    );

    if (context.skipped) return context;

    const tournament = context.tournament;

    if (!tournament.groupsEmailSentAt) {
      return {
        ok: true,
        skipped: true,
        reason: "groups_email_not_sent",
        tournamentId: tournament._id,
      } as const;
    }

    if (tournament.reminderEmailSentAt) {
      return {
        ok: true,
        skipped: true,
        reason: "already_sent",
        tournamentId: tournament._id,
      } as const;
    }

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv(
      "BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID",
    );

    const baseUrl = getAppBaseUrl({ allowLocalhostFallback: false });
    const nextUpUrl = buildTournamentUrl({
      baseUrl,
      tournamentId: String(tournament._id),
    });
    const nextUpLogoUrl =
      typeof tournament.logoUrl === "string" && tournament.logoUrl
        ? tournament.logoUrl
        : "";
    const nextUpLogoDisplay = nextUpLogoUrl ? "inline-block" : "none";

    const recipients = context.recipients.map((r) => ({
      email: r.email,
      name: r.name,
      params: {
        tournamentName: tournament.name,
        missingTeamCount: r.missingTeamCount,
        nextUpUrl,
        nextUpLogoUrl,
        nextUpLogoDisplay,
      },
    }));

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });

    if (summary.sent > 0) {
      await ctx.runMutation(internal.functions.emails.markReminderEmailSent, {
        tournamentId: tournament._id,
      });
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: tournament._id,
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      recipientCount: context.recipients.length,
    } as const;
  },
});

/**
 * Sends a single “groups are set” test email to `BREVO_TEST_TO`.
 * This never emails your full league list.
 */
export const sendGroupsEmailTest: ReturnType<typeof action> = action({
  args: emailsValidators.args.sendGroupsEmailTest,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const context = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: args.tournamentId },
    )) as GroupsEmailContext;

    const tournament = context.tournament;

    const baseUrl = getAppBaseUrl({ allowLocalhostFallback: true });
    const testRecipient = findEmailRecipientByAddress(
      context.recipients,
      testTo,
    );

    const recipientTourCardId = testRecipient?.tourCardId
      ? String(testRecipient.tourCardId)
      : "";

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      recipients: [
        {
          email: testTo,
          name: testRecipient?.name,
          params: buildTournamentEmailParams({
            context,
            baseUrl,
            recipientTourCardId,
            customBlurb: (args.customBlurb ?? "").trim().replace(/\n/g, "<br>"),
          }),
        },
      ],
    });

    return {
      ok: true,
      mode: "test",
      testTo,
      tournamentId: tournament._id,
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      messageIds: summary.messageIds ?? [],
      wouldEmailMemberCount: context.memberCount,
      wouldEmailActiveTourCardCount: context.activeTourCardCount,
    } as const;
  },
});

/**
 * Sends a single season opener (“season start”) test email to `BREVO_TEST_TO`.
 * This never emails your full league list.
 */
export const sendSeasonStartEmailTest: ReturnType<typeof action> = action({
  args: emailsValidators.args.sendSeasonStartEmailTest,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_SEASON_START_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");
    const reigningChampion = (args.reigningChampion ?? "").trim();

    const defaultClubhouseUrl = getAppBaseUrl({ allowLocalhostFallback: true });
    const clubhouseUrlRaw = (args.clubhouseUrl ?? "").trim();
    const clubhouseUrl =
      clubhouseUrlRaw.length > 0 ? clubhouseUrlRaw : defaultClubhouseUrl;

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      recipients: [
        {
          email: testTo,
          params: {
            customBlurb,
            reigningChampion,
            clubhouseUrl,
          },
        },
      ],
    });

    return {
      ok: true,
      mode: "test",
      testTo,
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      messageIds: summary.messageIds ?? [],
      templateId,
    } as const;
  },
});

/**
 * Admin-only preview for the season opener (“season start”) recipient list.
 * Targets all members where `isActive !== false`.
 */
export const adminGetSeasonStartEmailPreview = query({
  args: emailsValidators.args.adminGetSeasonStartEmailPreview,
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const members = await ctx.db.query("members").collect();
    const activeMemberCount = members.filter(
      (m) => m.isActive !== false,
    ).length;

    return {
      ok: true,
      activeMemberCount,
    } as const;
  },
});

/**
 * Admin-only bulk send for the season opener (“season start”) email.
 * Emails all members where `isActive !== false`.
 */
export const adminSendSeasonStartEmailToActiveMembers: ReturnType<
  typeof action
> = action({
  args: emailsValidators.args.adminSendSeasonStartEmailToActiveMembers,
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_SEASON_START_TEMPLATE_ID");

    const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");
    const reigningChampion = (args.reigningChampion ?? "").trim();

    const defaultClubhouseUrl = getAppBaseUrl({
      allowLocalhostFallback: false,
    });
    const clubhouseUrlRaw = (args.clubhouseUrl ?? "").trim();
    const clubhouseUrl =
      clubhouseUrlRaw.length > 0 ? clubhouseUrlRaw : defaultClubhouseUrl;

    const context = await ctx.runQuery(
      internal.functions.emails.getActiveMemberEmailRecipients,
      {},
    );

    const recipients = context.recipients.map((r) => ({
      email: r.email,
      name: r.name,
      params: {
        customBlurb,
        reigningChampion,
        clubhouseUrl,
      },
    }));

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });

    return {
      ok: true,
      mode: "real",
      attempted: summary.attempted,
      sent: summary.sent,
      failed: summary.failed,
      recipientCount: context.recipientCount,
      templateId,
    } as const;
  },
});

/**
 * Sends a single “missing team” reminder test email to `BREVO_TEST_TO`.
 * This never emails your full league list.
 */
export const sendMissingTeamReminderEmailTest: ReturnType<typeof action> =
  action({
    args: emailsValidators.args.sendMissingTeamReminderEmailTest,
    handler: async (ctx, args) => {
      await requireAdminAction(ctx);

      const apiKey = getBrevoApiKey();
      const templateId = parseNumericEnv(
        "BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID",
      );
      const testTo = getBrevoTestTo();

      const context = await ctx.runQuery(
        internal.functions.emails
          .getMissingTeamReminderRecipientsForUpcomingTournament,
        { tournamentId: args.tournamentId },
      );

      if (context.skipped) return context;

      const tournament = context.tournament;

      const baseUrl = getAppBaseUrl({ allowLocalhostFallback: true });
      const nextUpUrl = buildTournamentUrl({
        baseUrl,
        tournamentId: String(tournament._id),
      });
      const nextUpLogoUrl =
        typeof tournament.logoUrl === "string" && tournament.logoUrl
          ? tournament.logoUrl
          : "";
      const nextUpLogoDisplay = nextUpLogoUrl ? "inline-block" : "none";

      const summary = await sendBrevoTemplateEmailBatch({
        apiKey,
        templateId,
        recipients: [
          {
            email: testTo,
            params: {
              tournamentName: tournament.name,
              missingTeamCount: context.recipients.length,
              nextUpUrl,
              nextUpLogoUrl,
              nextUpLogoDisplay,
            },
          },
        ],
      });

      return {
        ok: true,
        mode: "test",
        testTo,
        tournamentId: tournament._id,
        attempted: summary.attempted,
        sent: summary.sent,
        failed: summary.failed,
        wouldEmailRecipientCount: context.recipients.length,
      } as const;
    },
  });
