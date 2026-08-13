import { emailsValidators } from "../validators/common";
import { v } from "convex/values";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { GroupsEmailContext } from "../types/emails";
import {
  formatMemberName,
  findPreviousCompletedTournament,
  getChampionsStringForTournamentId,
  getLeaderboardRowsForTournament,
  getPreviousCompletedTournamentName,
  getUpcomingTournament,
  getAppBaseUrl,
  getBrevoApiKey,
  getBrevoTestTo,
  parseNumericEnv,
  parseNumericEnvOptional,
  buildTournamentUrl,
  requireAdminForAction,
  requireAdminForQuery,
  buildGroupsEmailLeaderboardTemplateParams,
  acquireEmailDispatchGuard,
  completeEmailDispatchGuard,
  EMAIL_BULK_COOLDOWN_MS,
  EMAIL_TEST_COOLDOWN_MS,
  sendBrevoTemplateEmailBatch,
  sendGroupsEmailImpl,
} from "../utils/emails";
import { buildPlayoffAssignments } from "../utils/playoffs";
import { includesPlayoffLabel } from "../utils/standings";

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

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(500);

    const previous = findPreviousCompletedTournament({
      tournaments,
      startDate: tournament.startDate,
    });

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
      .take(500);

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
 * Targets active members whose eligible tour card has no team for the upcoming
 * tournament. The first playoff field is derived from current points; later
 * playoff rosters are inherited and never receive this reminder.
 */
async function loadMissingTeamReminderContext(
  ctx: QueryCtx,
  tournamentId?: Id<"tournaments">,
) {
  const tournament = tournamentId
    ? await ctx.db.get(tournamentId)
    : await getUpcomingTournament(ctx);

  if (!tournament) {
    return {
      ok: true,
      skipped: true,
      reason: "no_upcoming_tournament",
    } as const;
  }

  const [teams, tourCards, tournamentTier, seasonTournaments, tours] =
    await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .take(500),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .take(500),
      ctx.db.get(tournament.tierId),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .take(100),
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .take(20),
    ]);

  const isPlayoff =
    includesPlayoffLabel(tournamentTier?.name) ||
    includesPlayoffLabel(tournament.name);
  let eligibleTourCards = tourCards;
  if (isPlayoff) {
    const tierIds = [...new Set(seasonTournaments.map((item) => item.tierId))];
    const tiers = await Promise.all(
      tierIds.map((tierId) => ctx.db.get(tierId)),
    );
    const tierNameById = new Map(
      tiers.filter(Boolean).map((tier) => [tier!._id, tier!.name] as const),
    );
    const playoffTournaments = seasonTournaments
      .filter(
        (item) =>
          includesPlayoffLabel(tierNameById.get(item.tierId)) ||
          includesPlayoffLabel(item.name),
      )
      .sort((a, b) => a.startDate - b.startDate);
    if (playoffTournaments[0]?._id !== tournament._id) {
      return {
        ok: true,
        skipped: true,
        reason: "playoff_roster_inherited",
        tournament,
      } as const;
    }
    const assignments = buildPlayoffAssignments({
      cards: tourCards.map((card) => ({
        id: String(card._id),
        tourId: String(card.tourId),
        points: card.points,
      })),
      tours: tours.map((tour) => ({
        id: String(tour._id),
        playoffSpots: tour.playoffSpots,
      })),
    });
    eligibleTourCards = tourCards.filter(
      (card) => (assignments.get(String(card._id)) ?? 0) > 0,
    );
  }

  const tourCardsWithTeams = new Set(
    teams.map((team) => String(team.tourCardId)),
  );
  const missingTourCards = eligibleTourCards.filter(
    (card) => !tourCardsWithTeams.has(String(card._id)),
  );

  const missingByMemberId = new Map<Id<"members">, number>();
  for (const card of missingTourCards) {
    missingByMemberId.set(
      card.memberId,
      (missingByMemberId.get(card.memberId) ?? 0) + 1,
    );
  }

  const members = await Promise.all(
    [...missingByMemberId.keys()].map((memberId) => ctx.db.get(memberId)),
  );

  const missingByEmail = new Map<
    string,
    { email: string; name: string; missingTeamCount: number }
  >();

  for (const member of members.filter((item): item is Doc<"members"> =>
    Boolean(item),
  )) {
    if (member.isActive === false) continue;
    const email = (member.email ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    const count = missingByMemberId.get(member._id) ?? 1;
    const existing = missingByEmail.get(key);
    if (existing) existing.missingTeamCount += count;
    else {
      missingByEmail.set(key, {
        email,
        name: formatMemberName(member),
        missingTeamCount: count,
      });
    }
  }

  const recipients = [...missingByEmail.values()].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  return {
    ok: true,
    skipped: false,
    tournament,
    recipients,
    eligibleTourCardCount: eligibleTourCards.length,
    missingTourCardCount: missingTourCards.length,
    isPlayoff,
  } as const;
}

export const getMissingTeamReminderRecipientsForUpcomingTournament =
  internalQuery({
    args: emailsValidators.args
      .getMissingTeamReminderRecipientsForUpcomingTournament,
    handler: async (ctx, args) =>
      await loadMissingTeamReminderContext(ctx, args.tournamentId),
  });

export const adminGetMissingTeamReminderPreview = query({
  args: emailsValidators.args.adminGetMissingTeamReminderPreview,
  handler: async (ctx, args) => {
    await requireAdminForQuery(ctx);
    const context = await loadMissingTeamReminderContext(
      ctx,
      args.tournamentId,
    );
    if (context.skipped) return context;
    return {
      ok: true,
      skipped: false,
      tournamentId: context.tournament._id,
      tournamentName: context.tournament.name,
      recipientCount: context.recipients.length,
      eligibleTourCardCount: context.eligibleTourCardCount,
      missingTourCardCount: context.missingTourCardCount,
      isPlayoff: context.isPlayoff,
      alreadySent: Boolean(context.tournament.reminderEmailSentAt),
      groupsEmailSent: Boolean(context.tournament.groupsEmailSentAt),
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
    const members = await ctx.db.query("members").take(500);

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

export const acquireEmailDispatchGuard_Internal: ReturnType<
  typeof internalMutation
> = internalMutation({
  args: {
    key: v.string(),
    leaseToken: v.string(),
    now: v.number(),
    leaseMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailDispatchGuards")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing?.leaseExpiresAt && existing.leaseExpiresAt > args.now) {
      return {
        acquired: false,
        reason: "in_progress",
        retryAfterMs: existing.leaseExpiresAt - args.now,
      } as const;
    }

    if (existing?.cooldownUntil && existing.cooldownUntil > args.now) {
      return {
        acquired: false,
        reason: "rate_limited",
        retryAfterMs: existing.cooldownUntil - args.now,
      } as const;
    }

    const leaseExpiresAt = args.now + args.leaseMs;
    if (existing) {
      await ctx.db.patch(existing._id, {
        leaseToken: args.leaseToken,
        leaseExpiresAt,
        updatedAt: args.now,
      });
    } else {
      await ctx.db.insert("emailDispatchGuards", {
        key: args.key,
        leaseToken: args.leaseToken,
        leaseExpiresAt,
        cooldownUntil: 0,
        updatedAt: args.now,
      });
    }

    return { acquired: true } as const;
  },
});

export const completeEmailDispatchGuard_Internal: ReturnType<
  typeof internalMutation
> = internalMutation({
  args: {
    key: v.string(),
    leaseToken: v.string(),
    now: v.number(),
    cooldownMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailDispatchGuards")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing || existing.leaseToken !== args.leaseToken) {
      return { completed: false } as const;
    }

    await ctx.db.patch(existing._id, {
      leaseExpiresAt: args.now,
      cooldownUntil: args.now + args.cooldownMs,
      updatedAt: args.now,
    });
    return { completed: true } as const;
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
      .take(100);

    const previous = findPreviousCompletedTournament({
      tournaments,
      startDate: tournament.startDate,
    });

    const previousTournamentName = previous?.name ?? "";

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(500);

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
    const templateId =
      parseNumericEnvOptional("BREVO_WEEKLY_RECAP_TEMPLATE_ID") ??
      parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const customBlurb = (args.customBlurb ?? "").trim();

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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: `weekly-recap:bulk:${tournament._id}`,
      cooldownMs: EMAIL_BULK_COOLDOWN_MS,
    });
    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });
    await completeEmailDispatchGuard(ctx, dispatchLease);

    if (summary.attempted > 0 && summary.failed === 0) {
      await ctx.runMutation(
        internal.functions.notifications.publishWeeklyRecap,
        {
          tournamentId: tournament._id,
          memberIds: tournamentContext.recipients.flatMap((recipient) =>
            recipient.memberId ? [recipient.memberId] : [],
          ),
        },
      );
    }

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
    const templateId =
      parseNumericEnvOptional("BREVO_WEEKLY_RECAP_TEMPLATE_ID") ??
      parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const tournamentContext = (await ctx.runQuery(
      internal.functions.emails.getActiveTourCardRecipientsForTournament,
      { tournamentId: resolvedTournamentId },
    )) as GroupsEmailContext;

    const tournament = tournamentContext.tournament;
    const customBlurb = (args.customBlurb ?? "").trim();

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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: `weekly-recap:test:${tournament._id}`,
      cooldownMs: EMAIL_TEST_COOLDOWN_MS,
    });
    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      includeMessageIds: true,
      includeErrorReasons: true,
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
    await completeEmailDispatchGuard(ctx, dispatchLease);

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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: `missing-team-reminder:bulk:${tournament._id}`,
      cooldownMs: EMAIL_BULK_COOLDOWN_MS,
    });
    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });
    await completeEmailDispatchGuard(ctx, dispatchLease);

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

/** Admin-only manual send for eligible cards still missing an upcoming roster. */
export const adminSendMissingTeamReminderForUpcomingTournament: ReturnType<
  typeof action
> = action({
  args: emailsValidators.args.adminSendMissingTeamReminderForUpcomingTournament,
  handler: async (ctx, args) => {
    await requireAdminForAction(ctx);
    return await ctx.runAction(
      internal.functions.emails.sendMissingTeamReminderForUpcomingTournament,
      { tournamentId: args.tournamentId },
    );
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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: `groups:test:${tournament._id}`,
      cooldownMs: EMAIL_TEST_COOLDOWN_MS,
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
    await completeEmailDispatchGuard(ctx, dispatchLease);

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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: "season-start:test",
      cooldownMs: EMAIL_TEST_COOLDOWN_MS,
    });
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
    await completeEmailDispatchGuard(ctx, dispatchLease);

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

    const members = await ctx.db.query("members").take(500);
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

    const dispatchLease = await acquireEmailDispatchGuard({
      ctx,
      key: "season-start:bulk",
      cooldownMs: EMAIL_BULK_COOLDOWN_MS,
    });
    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });
    await completeEmailDispatchGuard(ctx, dispatchLease);

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
      await requireAdminForAction(ctx);

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

      const dispatchLease = await acquireEmailDispatchGuard({
        ctx,
        key: `missing-team-reminder:test:${tournament._id}`,
        cooldownMs: EMAIL_TEST_COOLDOWN_MS,
      });
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
      await completeEmailDispatchGuard(ctx, dispatchLease);

      return {
        ok: true,
        mode: "test",
        tournamentId: tournament._id,
        attempted: summary.attempted,
        sent: summary.sent,
        failed: summary.failed,
        wouldEmailRecipientCount: context.recipients.length,
      } as const;
    },
  });
