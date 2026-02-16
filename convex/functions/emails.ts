import { emailsValidators } from "../validators/emails";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { GroupsEmailContext } from "../types/emails";
import {
  formatMemberName,
  getChampionsStringForTournamentId,
  getLeaderboardRowsForTournament,
  getPreviousCompletedTournamentName,
  getUpcomingTournament,
  getAppBaseUrl,
  getBrevoApiKey,
  getBrevoTestTo,
  parseNumericEnv,
  buildTournamentUrl,
  requireAdminForAction,
  requireAdminForQuery,
  buildGroupsEmailLeaderboardTemplateParams,
  sendBrevoTemplateEmailBatch,
  sendGroupsEmailImpl,
} from "../utils/emails";

/**
 * Lists unique email recipients for the tournament based on “active” tour cards.
 * In this schema, “active tour card” is interpreted as a tour card in the tournament’s season.
 */
export const getActiveTourCardRecipientsForTournament = internalQuery({
  args: emailsValidators.args.getActiveTourCardRecipientsForTournament,
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const season = await ctx.db.get(tournament.seasonId);
    const seasonYear = season?.year ?? new Date(Date.now()).getFullYear();

    const now = Date.now();
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const previous = tournaments
      .filter(
        (t) =>
          t.startDate < tournament.startDate &&
          (t.status === "completed" || t.endDate <= now),
      )
      .sort((a, b) => b.startDate - a.startDate)[0];

    const previousTournamentName =
      previous?.name ??
      (await getPreviousCompletedTournamentName({
        ctx,
        tournament,
      }));

    const previousTournamentLogoUrl =
      previous &&
      typeof (previous as { logoUrl?: unknown }).logoUrl === "string"
        ? (previous as { logoUrl: string }).logoUrl
        : "";

    const champions = previous
      ? await getChampionsStringForTournamentId({
          ctx,
          tournamentId: previous._id,
        })
      : "";

    const leaderboardRows = previous
      ? await getLeaderboardRowsForTournament({
          ctx,
          tournamentId: previous._id,
        })
      : [];

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const byMemberId = new Map<Id<"members">, Doc<"tourCards">>();
    for (const tc of tourCards) {
      if (!byMemberId.has(tc.memberId)) byMemberId.set(tc.memberId, tc);
    }

    const members = await Promise.all(
      [...byMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
    );

    const recipients = members
      .filter((m): m is Doc<"members"> => Boolean(m))
      .filter((m) => m.isActive !== false)
      .map((member) => {
        const tc = byMemberId.get(member._id);
        return {
          memberId: member._id,
          tourCardId: tc?._id,
          email: member.email,
          name: formatMemberName(member),
        };
      });

    return {
      tournament,
      seasonYear,
      previousTournamentName,
      previousTournamentLogoUrl,
      champions,
      leaderboardRows,
      recipients,
      activeTourCardCount: tourCards.length,
      memberCount: recipients.length,
    };
  },
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
      for (const tc of tourCards) membersWithTourCards.add(tc.memberId);

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

      const teamTourCardIds = Array.from(
        new Set(teams.map((t) => t.tourCardId)),
      ) as Id<"tourCards">[];
      const teamTourCards = await Promise.all(
        teamTourCardIds.map((id) => ctx.db.get(id)),
      );
      const membersWithAnyTeam = new Set<Id<"members">>();
      for (const tc of teamTourCards) {
        if (tc) membersWithAnyTeam.add(tc.memberId);
      }

      for (const member of activeMembers) {
        if (!member || member.isActive === false) continue;
        const email = (member.email ?? "").trim();
        if (!email) continue;
        if (membersWithAnyTeam.has(member._id)) continue;
        const key = email.toLowerCase();
        if (missingByEmail.has(key)) continue;

        const missingTeamCount = membersWithTourCards.has(member._id) ? 1 : 1;
        missingByEmail.set(key, {
          email,
          name: formatMemberName(member),
          missingTeamCount,
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

export const getIsAdminByClerkId = internalQuery({
  args: emailsValidators.args.getIsAdminByClerkId,
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
    } as const;
  },
});

/**
 * Admin-only preview for the “groups are set” email.
 * Returns stats only (no recipient list).
 */
export const adminGetGroupsEmailPreview: ReturnType<typeof query> = query({
  args: emailsValidators.args.adminGetGroupsEmailPreview,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: You must be signed in");

    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Forbidden: Admin access required");
    }

    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const now = Date.now();
    const previous = tournaments
      .filter(
        (t) =>
          t.startDate < tournament.startDate &&
          (t.status === "completed" || t.endDate <= now),
      )
      .sort((a, b) => b.startDate - a.startDate)[0];

    const previousTournamentName = previous?.name ?? "";

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const byMemberId = new Map<Id<"members">, true>();
    for (const tc of tourCards) {
      if (!byMemberId.has(tc.memberId)) byMemberId.set(tc.memberId, true);
    }

    const members = await Promise.all(
      [...byMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
    );

    const recipientCount = members
      .filter((m): m is Doc<"members"> => Boolean(m))
      .filter((m) => m.isActive !== false).length;

    const championsComputed = previous
      ? await getChampionsStringForTournamentId({
          ctx,
          tournamentId: previous._id,
        })
      : "";

    return {
      ok: true,
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      groupsEmailSentAt: tournament.groupsEmailSentAt ?? null,
      previousTournamentName,
      champions: championsComputed,
      memberCount: recipientCount,
      activeTourCardCount: tourCards.length,
      recipientCount,
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
      return await sendGroupsEmailImpl({
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
    await requireAdminForAction(ctx);

    return await sendGroupsEmailImpl({
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
    await requireAdminForAction(ctx);

    const resolvedTournamentId =
      args.tournamentId ??
      (
        await ctx.runQuery(
          internal.functions.emails.getUpcomingTournamentId,
          {},
        )
      ).tournamentId;

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
    const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");

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
    const pgcLogoUrl = `${baseUrl}/logo192.png`;

    const previousTournamentLogoUrl =
      tournamentContext.previousTournamentLogoUrl;
    const previousTournamentLogoDisplay = previousTournamentLogoUrl
      ? "inline-block"
      : "none";

    const recipients = tournamentContext.recipients.map((r) => {
      const recipientTourCardId = r.tourCardId ? String(r.tourCardId) : "";
      const leaderboardParams = buildGroupsEmailLeaderboardTemplateParams({
        leaderboardRows: tournamentContext.leaderboardRows,
        recipientTourCardId,
      });

      return {
        email: r.email,
        name: r.name,
        params: {
          tournamentName: tournament.name,
          seasonYear:
            tournamentContext.seasonYear ?? new Date(Date.now()).getFullYear(),
          previousTournamentName:
            tournamentContext.previousTournamentName ?? "",
          previousTournamentLogoUrl,
          previousTournamentLogoDisplay,
          champions: tournamentContext.champions ?? "",
          pgcLogoUrl,
          nextUpUrl,
          nextUpLogoUrl,
          nextUpLogoDisplay,
          customBlurb,
          ...leaderboardParams,
        },
      };
    });

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
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
    await requireAdminForAction(ctx);

    const resolvedTournamentId =
      args.tournamentId ??
      (
        await ctx.runQuery(
          internal.functions.emails.getUpcomingTournamentId,
          {},
        )
      ).tournamentId;

    if (!resolvedTournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const tournamentContext = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: resolvedTournamentId },
    )) as GroupsEmailContext;

    const tournament = tournamentContext.tournament;
    const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");

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
    const pgcLogoUrl = `${baseUrl}/logo192.png`;

    const previousTournamentLogoUrl =
      tournamentContext.previousTournamentLogoUrl;
    const previousTournamentLogoDisplay = previousTournamentLogoUrl
      ? "inline-block"
      : "none";

    const testRecipient =
      tournamentContext.recipients.find((r) => r?.email === testTo) ?? null;
    const recipientTourCardId = testRecipient?.tourCardId
      ? String(testRecipient.tourCardId)
      : "";

    const leaderboardParams = buildGroupsEmailLeaderboardTemplateParams({
      leaderboardRows: tournamentContext.leaderboardRows,
      recipientTourCardId,
    });

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      recipients: [
        {
          email: testTo,
          name: testRecipient?.name,
          params: {
            tournamentName: tournament.name,
            seasonYear:
              tournamentContext.seasonYear ??
              new Date(Date.now()).getFullYear(),
            previousTournamentName:
              tournamentContext.previousTournamentName ?? "",
            previousTournamentLogoUrl,
            previousTournamentLogoDisplay,
            champions: tournamentContext.champions ?? "",
            pgcLogoUrl,
            nextUpUrl,
            nextUpLogoUrl,
            nextUpLogoDisplay,
            customBlurb,
            ...leaderboardParams,
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
      messageIds: summary.messageIds ?? [],
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
    await requireAdminForAction(ctx);

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const context = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: args.tournamentId },
    )) as GroupsEmailContext;

    const tournament = context.tournament;

    const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");

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
    const pgcLogoUrl = `${baseUrl}/logo192.png`;

    const previousTournamentLogoUrl = context.previousTournamentLogoUrl;
    const previousTournamentLogoDisplay = previousTournamentLogoUrl
      ? "inline-block"
      : "none";

    const leaderboardRows = context.leaderboardRows;

    // const top10 = leaderboardRows.slice(0, 10);

    const testRecipient =
      context.recipients.find(
        (r: GroupsEmailContext["recipients"][number]) => r?.email === testTo,
      ) ?? null;

    const recipientTourCardId = testRecipient?.tourCardId
      ? String(testRecipient.tourCardId)
      : "";

    // const meIndex = recipientTourCardId
    //   ? leaderboardRows.findIndex(
    //       (row: LeaderboardTopRow) =>
    //         String(row.tourCardId) === recipientTourCardId,
    //     )
    //   : -1;

    // const meRow = meIndex >= 10 ? leaderboardRows[meIndex] : null;
    // const meRowDisplay = meRow ? "table-row" : "none";

    const leaderboardParams = buildGroupsEmailLeaderboardTemplateParams({
      leaderboardRows,
      recipientTourCardId,
    });

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      recipients: [
        {
          email: testTo,
          name: testRecipient?.name,
          params: {
            tournamentName: tournament.name,
            seasonYear:
              context.seasonYear ?? new Date(Date.now()).getFullYear(),
            previousTournamentName: context.previousTournamentName ?? "",
            previousTournamentLogoUrl,
            previousTournamentLogoDisplay,
            champions: context.champions ?? "",
            pgcLogoUrl,
            nextUpUrl,
            nextUpLogoUrl,
            nextUpLogoDisplay,
            ...leaderboardParams,
            customBlurb,
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
    await requireAdminForAction(ctx);

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
    await requireAdminForQuery(ctx);

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
    await requireAdminForAction(ctx);

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
