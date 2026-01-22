import { v } from "convex/values";

import { action, internalAction, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";

function parseNumericEnv(name: string): number {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function getBrevoApiKey(): string {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  return apiKey;
}

function getBrevoTestTo(): string {
  const testTo = process.env.BREVO_TEST_TO;
  if (!testTo) {
    throw new Error(
      "Missing BREVO_TEST_TO (set this to your email for safe test sends)",
    );
  }
  return testTo;
}

function getAppBaseUrl(args: { allowLocalhostFallback: boolean }): string {
  const raw =
    process.env.APP_BASE_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_URL;

  if (raw && raw.length > 0) {
    const hasProtocol = raw.startsWith("http://") || raw.startsWith("https://");
    return hasProtocol ? raw.replace(/\/$/, "") : `https://${raw}`;
  }

  if (args.allowLocalhostFallback) {
    return "http://localhost:3000";
  }

  throw new Error(
    "Missing APP_BASE_URL (set to your site origin, e.g. https://pgc.yourdomain.com)",
  );
}

function buildTournamentUrl(args: {
  baseUrl: string;
  tournamentId: string;
}): string {
  const url = new URL("/tournament", args.baseUrl);
  url.searchParams.set("tournamentId", args.tournamentId);
  return url.toString();
}

async function sendBrevoTemplateEmailBatch(args: {
  apiKey: string;
  templateId: number;
  recipients: Array<{
    email: string;
    name?: string;
    params: Record<string, unknown>;
  }>;
  includeMessageIds?: boolean;
}): Promise<{
  attempted: number;
  sent: number;
  failed: number;
  messageIds?: string[];
}> {
  const maxConcurrency = 15;

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  const messageIds: string[] = [];

  for (let i = 0; i < args.recipients.length; i += maxConcurrency) {
    const batch = args.recipients.slice(i, i + maxConcurrency);
    attempted += batch.length;

    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": args.apiKey,
          },
          body: JSON.stringify({
            to: [{ email: r.email, ...(r.name ? { name: r.name } : {}) }],
            templateId: args.templateId,
            params: r.params,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Brevo send failed: ${res.status} ${body}`);
        }

        if (args.includeMessageIds) {
          const body = (await res.json().catch(() => null)) as {
            messageId?: string;
          } | null;
          const messageId = body?.messageId;
          if (typeof messageId === "string" && messageId.length > 0) {
            messageIds.push(messageId);
          }
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") sent += 1;
      else failed += 1;
    }
  }

  return {
    attempted,
    sent,
    failed,
    ...(args.includeMessageIds ? { messageIds } : {}),
  };
}

async function requireAdminForAction(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  runQuery: (name: any, args: any) => Promise<any>;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const isAdminResult = await ctx.runQuery(
    internal.functions.emailData.getIsAdminByClerkId,
    { clerkId: identity.subject },
  );

  if (!isAdminResult?.isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }
}

async function requireAdminForQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();

  if (!member || member.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
}

async function sendGroupsEmailImpl(args: {
  ctx: {
    runQuery: (name: any, args: any) => Promise<any>;
    runMutation: (name: any, args: any) => Promise<any>;
  };
  tournamentId: unknown;
  customBlurb?: string;
  force?: boolean;
}) {
  const tournamentContext = await args.ctx.runQuery(
    internal.functions.emailData.getActiveTourCardRecipientsForTournament,
    { tournamentId: args.tournamentId },
  );

  const tournament = tournamentContext.tournament;

  if (tournament.groupsEmailSentAt && !args.force) {
    return {
      ok: true,
      skipped: true,
      reason: "already_sent",
      tournamentId: tournament._id,
    } as const;
  }

  const apiKey = getBrevoApiKey();
  const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
  const customBlurb = (args.customBlurb ?? "").trim().replace(/\n/g, "<br>");

  const baseUrl = getAppBaseUrl({ allowLocalhostFallback: false });
  const nextUpUrl = buildTournamentUrl({
    baseUrl,
    tournamentId: String(tournament._id),
  });
  const nextUpLogoUrl =
    typeof (tournament as any).logoUrl === "string" &&
    (tournament as any).logoUrl
      ? (tournament as any).logoUrl
      : "";
  const nextUpLogoDisplay = nextUpLogoUrl ? "inline-block" : "none";
  const pgcLogoUrl = `${baseUrl}/logo192.png`;

  const previousTournamentLogoUrl =
    typeof (tournamentContext as any).previousTournamentLogoUrl === "string"
      ? ((tournamentContext as any).previousTournamentLogoUrl as string)
      : "";
  const previousTournamentLogoDisplay = previousTournamentLogoUrl
    ? "inline-block"
    : "none";

  const leaderboardRows = Array.isArray(
    (tournamentContext as any).leaderboardRows,
  )
    ? ((tournamentContext as any).leaderboardRows as any[])
    : [];

  const top10 = leaderboardRows.slice(0, 10);

  const recipients = tournamentContext.recipients.map((r: any) => {
    const recipientTourCardId = r.tourCardId ? String(r.tourCardId) : "";
    const meIndex = recipientTourCardId
      ? leaderboardRows.findIndex(
          (row) => String(row.tourCardId) === recipientTourCardId,
        )
      : -1;

    const meRow = meIndex >= 10 ? leaderboardRows[meIndex] : null;
    const meRowDisplay = meRow ? "table-row" : "none";

    const meRowBg = "#dbeafe";
    const meRowBorderLeft = "3px solid #2563eb";

    const leaderboardParams = Object.fromEntries(
      Array.from({ length: 10 }, (_, idx) => {
        const row = top10[idx] ?? {};
        const n = idx + 1;

        const isChampion = row.isChampion === true;
        const isMe =
          recipientTourCardId &&
          typeof row.tourCardId !== "undefined" &&
          String(row.tourCardId) === recipientTourCardId;

        const baseBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        let bg = baseBg;
        let borderLeft = "0px solid transparent";

        if (isChampion) {
          bg = "#fef3c7";
          borderLeft = "3px solid #f59e0b";
        }

        if (isMe) {
          bg = isChampion ? "#fef3c7" : "#dbeafe";
          borderLeft = "3px solid #2563eb";
        }

        return [
          [`leaderboardTop${n}Pos`, row.position ?? ""],
          [`leaderboardTop${n}Name`, row.displayName ?? ""],
          [`leaderboardTop${n}Tour`, row.tourShortForm ?? ""],
          [`leaderboardTop${n}Score`, row.scoreText ?? ""],
          [`leaderboardTop${n}Bg`, bg],
          [`leaderboardTop${n}BorderLeft`, borderLeft],
        ];
      }).flat(),
    );

    return {
      email: r.email,
      name: r.name,
      params: {
        tournamentName: tournament.name,
        seasonYear:
          tournamentContext.seasonYear ?? new Date(Date.now()).getFullYear(),
        previousTournamentName: tournamentContext.previousTournamentName ?? "",
        previousTournamentLogoUrl,
        previousTournamentLogoDisplay,
        champions: tournamentContext.champions ?? "",
        pgcLogoUrl,
        nextUpUrl,
        nextUpLogoUrl,
        nextUpLogoDisplay,
        leaderboardMeRowDisplay: meRowDisplay,
        leaderboardMePos: meRow?.position ?? "",
        leaderboardMeName: meRow?.displayName ?? "",
        leaderboardMeTour: meRow?.tourShortForm ?? "",
        leaderboardMeScore: meRow?.scoreText ?? "",
        leaderboardMeBg: meRowBg,
        leaderboardMeBorderLeft: meRowBorderLeft,
        ...leaderboardParams,
        customBlurb,
      },
    };
  });

  const summary = await sendBrevoTemplateEmailBatch({
    apiKey,
    templateId,
    recipients,
  });

  if (summary.sent > 0) {
    await args.ctx.runMutation(
      internal.functions.emailData.markGroupsEmailSent,
      {
        tournamentId: tournament._id,
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
}

/**
 * Admin-only preview for the “groups are set” email.
 * Returns stats only (no recipient list).
 */
export const adminGetGroupsEmailPreview: ReturnType<typeof query> = query({
  args: { tournamentId: v.id("tournaments") },
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

    const byMemberId = new Map<string, true>();
    for (const tc of tourCards) {
      if (!byMemberId.has(tc.memberId)) byMemberId.set(tc.memberId, true);
    }

    const members = await Promise.all(
      [...byMemberId.keys()].map((memberId) => ctx.db.get(memberId as any)),
    );

    const recipientCount = members
      .filter(Boolean)
      .filter((m: any) => m.isActive !== false).length;

    const championsComputed = previous
      ? await (async () => {
          const [pos1, posT1] = await Promise.all([
            ctx.db
              .query("teams")
              .withIndex("by_tournament_position", (q) =>
                q.eq("tournamentId", previous._id).eq("position", "1"),
              )
              .collect(),
            ctx.db
              .query("teams")
              .withIndex("by_tournament_position", (q) =>
                q.eq("tournamentId", previous._id).eq("position", "T1"),
              )
              .collect(),
          ]);

          const winners = [...pos1, ...posT1];
          if (winners.length === 0) return "";

          const tourCardIds = Array.from(
            new Set(winners.map((t) => t.tourCardId)),
          );
          const tourCards = await Promise.all(
            tourCardIds.map((id) => ctx.db.get(id)),
          );

          const tourIdSet = new Set(
            tourCards.filter(Boolean).map((tc) => (tc as any).tourId as string),
          );

          const tours = await Promise.all(
            [...tourIdSet].map((tourId) => ctx.db.get(tourId as any)),
          );
          const shortFormByTourId = new Map(
            tours
              .filter(Boolean)
              .map(
                (t) =>
                  [
                    (t as any)._id as string,
                    (t as any).shortForm as string,
                  ] as const,
              ),
          );

          const tourCardById = new Map(
            tourCards
              .filter(Boolean)
              .map((tc) => [(tc as any)._id as string, tc as any] as const),
          );

          const formatScore = (score: unknown) => {
            if (typeof score !== "number" || !Number.isFinite(score)) return "";
            if (score === 0) return "E";
            return score > 0 ? `+${score}` : `${score}`;
          };

          const entries = winners
            .map((team) => {
              const tc = tourCardById.get(team.tourCardId);
              if (!tc) return null;
              const tourShort = shortFormByTourId.get(tc.tourId) ?? "";
              const scoreToPar = formatScore(team.score);
              const scorePart = scoreToPar ? ` (${scoreToPar})` : "";
              return {
                tourShort,
                displayName: tc.displayName as string,
                text: `${tc.displayName as string}${scorePart}`,
              };
            })
            .filter(Boolean) as Array<{
            tourShort: string;
            displayName: string;
            text: string;
          }>;

          entries.sort((a, b) => {
            if (a.tourShort !== b.tourShort) {
              return a.tourShort.localeCompare(b.tourShort);
            }
            return a.displayName.localeCompare(b.displayName);
          });

          const texts = entries.map((e) => e.text);
          if (texts.length === 0) return "";
          if (texts.length === 1) return texts[0] ?? "";
          if (texts.length === 2) return `${texts[0]} and ${texts[1]}`;
          return `${texts.slice(0, -1).join(", ")}, and ${texts[texts.length - 1]}`;
        })()
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
    args: {
      tournamentId: v.id("tournaments"),
      customBlurb: v.optional(v.string()),
      force: v.optional(v.boolean()),
    },
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
  args: {
    tournamentId: v.id("tournaments"),
    customBlurb: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
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
 * Sends a “missing team” reminder via Brevo to members with a tour card in the tournament’s season
 * and no team submitted for that upcoming tournament.
 * Idempotent via `tournaments.reminderEmailSentAt`.
 */
export const sendMissingTeamReminderForUpcomingTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.functions.emailData
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

    const recipients = context.recipients.map((r: any) => ({
      email: r.email,
      name: r.name,
      params: {
        tournamentName: tournament.name,
        missingTeamCount: r.missingTeamCount,
      },
    }));

    const summary = await sendBrevoTemplateEmailBatch({
      apiKey,
      templateId,
      recipients,
    });

    if (summary.sent > 0) {
      await ctx.runMutation(
        internal.functions.emailData.markReminderEmailSent,
        {
          tournamentId: tournament._id,
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
      recipientCount: context.recipients.length,
    } as const;
  },
});

/**
 * Sends a single “groups are set” test email to `BREVO_TEST_TO`.
 * This never emails your full league list.
 */
export const sendGroupsEmailTest: ReturnType<typeof action> = action({
  args: {
    tournamentId: v.id("tournaments"),
    customBlurb: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminForAction(ctx);

    const apiKey = getBrevoApiKey();
    const templateId = parseNumericEnv("BREVO_GROUPS_FINALIZED_TEMPLATE_ID");
    const testTo = getBrevoTestTo();

    const context = (await ctx.runQuery(
      internal.functions.emailData.getActiveTourCardRecipientsForTournament,
      { tournamentId: args.tournamentId },
    )) as any;

    const tournament = context.tournament as any;

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
      typeof (context as any).previousTournamentLogoUrl === "string"
        ? ((context as any).previousTournamentLogoUrl as string)
        : "";
    const previousTournamentLogoDisplay = previousTournamentLogoUrl
      ? "inline-block"
      : "none";

    const leaderboardRows = Array.isArray((context as any).leaderboardRows)
      ? ((context as any).leaderboardRows as any[])
      : [];

    const top10 = leaderboardRows.slice(0, 10);

    const testRecipient = Array.isArray((context as any).recipients)
      ? ((context as any).recipients as any[]).find((r) => r?.email === testTo)
      : null;

    const recipientTourCardId = testRecipient?.tourCardId
      ? String(testRecipient.tourCardId)
      : "";

    const meIndex = recipientTourCardId
      ? leaderboardRows.findIndex(
          (row) => String(row.tourCardId) === recipientTourCardId,
        )
      : -1;

    const meRow = meIndex >= 10 ? leaderboardRows[meIndex] : null;
    const meRowDisplay = meRow ? "table-row" : "none";

    const leaderboardParams = Object.fromEntries(
      Array.from({ length: 10 }, (_, idx) => {
        const row = top10[idx] ?? {};
        const n = idx + 1;

        const isChampion = row.isChampion === true;
        const isMe =
          recipientTourCardId &&
          typeof row.tourCardId !== "undefined" &&
          String(row.tourCardId) === recipientTourCardId;

        const baseBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        let bg = baseBg;
        let borderLeft = "0px solid transparent";

        if (isChampion) {
          bg = "#fef3c7";
          borderLeft = "3px solid #f59e0b";
        }

        if (isMe) {
          bg = isChampion ? "#fef3c7" : "#dbeafe";
          borderLeft = "3px solid #2563eb";
        }

        return [
          [`leaderboardTop${n}Pos`, row.position ?? ""],
          [`leaderboardTop${n}Name`, row.displayName ?? ""],
          [`leaderboardTop${n}Tour`, row.tourShortForm ?? ""],
          [`leaderboardTop${n}Score`, row.scoreText ?? ""],
          [`leaderboardTop${n}Bg`, bg],
          [`leaderboardTop${n}BorderLeft`, borderLeft],
        ];
      }).flat(),
    );

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
            leaderboardMeRowDisplay: meRowDisplay,
            leaderboardMePos: meRow?.position ?? "",
            leaderboardMeName: meRow?.displayName ?? "",
            leaderboardMeTour: meRow?.tourShortForm ?? "",
            leaderboardMeScore: meRow?.scoreText ?? "",
            leaderboardMeBg: "#dbeafe",
            leaderboardMeBorderLeft: "3px solid #2563eb",
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
  args: {
    customBlurb: v.optional(v.string()),
    reigningChampion: v.optional(v.string()),
    clubhouseUrl: v.optional(v.string()),
  },
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
  args: {},
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
  args: {
    customBlurb: v.optional(v.string()),
    reigningChampion: v.optional(v.string()),
    clubhouseUrl: v.optional(v.string()),
  },
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
      internal.functions.emailData.getActiveMemberEmailRecipients,
      {},
    );

    const recipients = (context.recipients as any[]).map((r) => ({
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
    args: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    handler: async (ctx, args) => {
      const apiKey = getBrevoApiKey();
      const templateId = parseNumericEnv(
        "BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID",
      );
      const testTo = getBrevoTestTo();

      const context = (await ctx.runQuery(
        internal.functions.emailData
          .getMissingTeamReminderRecipientsForUpcomingTournament,
        { tournamentId: args.tournamentId },
      )) as any;

      if (context.skipped) return context;

      const tournament = context.tournament;

      const summary = await sendBrevoTemplateEmailBatch({
        apiKey,
        templateId,
        recipients: [
          {
            email: testTo,
            params: {
              tournamentName: tournament.name,
              missingTeamCount: context.recipients.length,
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
