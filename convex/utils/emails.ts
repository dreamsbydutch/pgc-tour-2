import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type {
  BuildTournamentUrlArgs,
  GetAppBaseUrlArgs,
  GetChampionsStringForTournamentIdArgs,
  GetLeaderboardRowsForTournamentArgs,
  GetPreviousCompletedTournamentNameArgs,
  GroupsEmailContext,
  LeaderboardTopRow,
  RequireAdminForActionCtx,
  SendBrevoTemplateEmailBatchArgs,
  SendBrevoTemplateEmailBatchResult,
  SendGroupsEmailImplArgs,
} from "../types/emails";
import { calculateScoreForSorting } from "./misc";

export function formatMemberName(member: Doc<"members">): string {
  const first = (member.firstname ?? "").trim();
  const last = (member.lastname ?? "").trim();
  const full = `${first[0]}. ${last}`.trim();
  return full.length > 0 ? full : "";
}

export function formatScoreToPar(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function escapeEmailText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatNameListWithAnd(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

export function buildGroupsEmailLeaderboardTemplateParams(args: {
  leaderboardRows: LeaderboardTopRow[];
  recipientTourCardId: string;
}): Record<string, string> {
  const recipientTourCardId = (args.recipientTourCardId ?? "").trim();
  const leaderboardRows = args.leaderboardRows ?? [];

  const top10 = leaderboardRows.slice(0, 10);

  const meIndex = recipientTourCardId
    ? leaderboardRows.findIndex(
        (row) =>
          typeof row.tourCardId !== "undefined" &&
          String(row.tourCardId) === recipientTourCardId,
      )
    : -1;

  const meRow = meIndex >= 10 ? leaderboardRows[meIndex] : null;
  const meRowDisplay = meRow ? "table-row" : "none";

  const params: Record<string, string> = {
    leaderboardMeRowDisplay: meRowDisplay,
    leaderboardMePos: meRow?.position ?? "",
    leaderboardMeName: meRow?.displayName ?? "",
    leaderboardMeTour: meRow?.tourShortForm ?? "",
    leaderboardMeScore: meRow?.scoreText ?? "",
    leaderboardMeBg: "#dbeafe",
    leaderboardMeBorderLeft: "3px solid #2563eb",
  };

  for (let idx = 0; idx < 10; idx += 1) {
    const row = top10[idx] ?? ({} as Partial<LeaderboardTopRow>);
    const n = idx + 1;

    const isChampion = row.isChampion === true;
    const isMe =
      Boolean(recipientTourCardId) &&
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

    params[`leaderboardTop${n}Pos`] = row.position ?? "";
    params[`leaderboardTop${n}Name`] = row.displayName ?? "";
    params[`leaderboardTop${n}Tour`] = row.tourShortForm ?? "";
    params[`leaderboardTop${n}Score`] = row.scoreText ?? "";
    params[`leaderboardTop${n}Bg`] = bg;
    params[`leaderboardTop${n}BorderLeft`] = borderLeft;
  }

  return params;
}

export async function getLeaderboardRowsForTournament(
  args: GetLeaderboardRowsForTournamentArgs,
): Promise<LeaderboardTopRow[]> {
  const teams = await args.ctx.db
    .query("teams")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", args.tournamentId))
    .collect();

  if (teams.length === 0) return [];

  const championTourCardIdSet = new Set(
    teams
      .filter((t) => t.position === "1" || t.position === "T1")
      .map((t) => t.tourCardId),
  );

  const tourCardIds = Array.from(new Set(teams.map((t) => t.tourCardId)));
  const tourCards = await Promise.all(
    tourCardIds.map((id) => args.ctx.db.get(id)),
  );
  const tourCardById = new Map(
    tourCards.filter(Boolean).map((tc) => [tc!._id, tc!]),
  );

  const tourIds = Array.from(
    new Set(tourCards.filter(Boolean).map((tc) => tc!.tourId)),
  );
  const tours = await Promise.all(tourIds.map((id) => args.ctx.db.get(id)));
  const tourShortById = new Map(
    tours.filter(Boolean).map((t) => [t!._id, t!.shortForm] as const),
  );

  const sortable = teams
    .map((team) => {
      const tc = tourCardById.get(team.tourCardId);
      if (!tc) return null;

      const position = team.position ?? "";
      const scoreValue = team.score ?? null;

      return {
        tourCardId: team.tourCardId,
        position: position || "—",
        displayName: tc.displayName,
        tourShortForm: tourShortById.get(tc.tourId) ?? "",
        scoreText: formatScoreToPar(scoreValue ?? undefined),
        scoreForSorting: calculateScoreForSorting(position, scoreValue),
        thru: team.thru ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  sortable.sort((a, b) => {
    if (a.scoreForSorting !== b.scoreForSorting)
      return a.scoreForSorting - b.scoreForSorting;
    if (a.thru !== b.thru) return a.thru - b.thru;
    return a.displayName.localeCompare(b.displayName);
  });

  return sortable.map((r) => ({
    tourCardId: r.tourCardId,
    position: escapeEmailText(r.position),
    displayName: escapeEmailText(r.displayName),
    tourShortForm: escapeEmailText(r.tourShortForm),
    scoreText: escapeEmailText(r.scoreText),
    isChampion: championTourCardIdSet.has(r.tourCardId),
  }));
}

export async function getPreviousCompletedTournamentName(
  args: GetPreviousCompletedTournamentNameArgs,
): Promise<string> {
  const now = Date.now();
  const tournaments = await args.ctx.db
    .query("tournaments")
    .withIndex("by_season", (q) => q.eq("seasonId", args.tournament.seasonId))
    .collect();

  const previous = tournaments
    .filter(
      (t) =>
        t.startDate < args.tournament.startDate &&
        (t.status === "completed" || t.endDate <= now),
    )
    .sort((a, b) => b.startDate - a.startDate)[0];

  return previous?.name ?? "";
}

export async function getChampionsStringForTournamentId(
  args: GetChampionsStringForTournamentIdArgs,
): Promise<string> {
  const [pos1, posT1] = await Promise.all([
    args.ctx.db
      .query("teams")
      .withIndex("by_tournament_position", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("position", "1"),
      )
      .collect(),
    args.ctx.db
      .query("teams")
      .withIndex("by_tournament_position", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("position", "T1"),
      )
      .collect(),
  ]);

  const winners = [...pos1, ...posT1];
  if (winners.length === 0) return "";

  const tourCardIds = Array.from(new Set(winners.map((t) => t.tourCardId)));
  const tourCards = await Promise.all(
    tourCardIds.map((id) => args.ctx.db.get(id)),
  );

  const tourIdSet = new Set(
    tourCards.filter(Boolean).map((tc) => (tc as Doc<"tourCards">).tourId),
  );
  const tours = await Promise.all(
    [...tourIdSet].map((tourId) => args.ctx.db.get(tourId)),
  );
  const shortFormByTourId = new Map(
    tours
      .filter(Boolean)
      .map(
        (t) =>
          [(t as Doc<"tours">)._id, (t as Doc<"tours">).shortForm] as const,
      ),
  );

  const tourCardById = new Map(
    tourCards
      .filter(Boolean)
      .map(
        (tc) => [(tc as Doc<"tourCards">)._id, tc as Doc<"tourCards">] as const,
      ),
  );

  const entries = winners
    .map((team) => {
      const tc = tourCardById.get(team.tourCardId);
      if (!tc) return null;
      const tourShort = shortFormByTourId.get(tc.tourId) ?? "";
      const scoreToPar = formatScoreToPar(team.score);
      const scorePart = scoreToPar ? ` (${scoreToPar})` : "";
      return {
        tourShort,
        displayName: tc.displayName,
        text: `${tc.displayName}${scorePart}`,
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .sort((a, b) => {
      if (a.tourShort !== b.tourShort)
        return a.tourShort.localeCompare(b.tourShort);
      return a.displayName.localeCompare(b.displayName);
    });

  return formatNameListWithAnd(entries.map((e) => e.text));
}

export async function getUpcomingTournament(
  ctx: QueryCtx,
): Promise<Doc<"tournaments"> | null> {
  const now = Date.now();
  const upcoming = await ctx.db
    .query("tournaments")
    .withIndex("by_status", (q) => q.eq("status", "upcoming"))
    .collect();

  const future = upcoming.filter((t) => t.startDate > now);
  future.sort((a, b) => a.startDate - b.startDate);
  return future[0] ?? null;
}

export function parseNumericEnv(name: string): number {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

export function getBrevoApiKey(): string {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  return apiKey;
}

export function getBrevoTestTo(): string {
  const testTo = process.env.BREVO_TEST_TO;
  if (!testTo) {
    throw new Error(
      "Missing BREVO_TEST_TO (set this to your email for safe test sends)",
    );
  }
  return testTo;
}

export function getAppBaseUrl(args: GetAppBaseUrlArgs): string {
  const raw = (
    process.env.APP_BASE_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_URL
  )
    ?.trim()
    .replace(/\/$/, "");

  if (raw && raw.length > 0) {
    const hasProtocol = raw.startsWith("http://") || raw.startsWith("https://");
    return hasProtocol ? raw : `https://${raw}`;
  }

  if (args.allowLocalhostFallback) {
    return "http://localhost:3000";
  }

  throw new Error(
    "Missing APP_BASE_URL (set this in your Convex env vars to your site origin, e.g. https://pgc.yourdomain.com)",
  );
}

export function buildTournamentUrl(args: BuildTournamentUrlArgs): string {
  const url = new URL("/tournament", args.baseUrl);
  url.searchParams.set("tournamentId", args.tournamentId);
  return url.toString();
}

export async function sendBrevoTemplateEmailBatch(
  args: SendBrevoTemplateEmailBatchArgs,
): Promise<SendBrevoTemplateEmailBatchResult> {
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

export async function requireAdminForAction(ctx: RequireAdminForActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const isAdminResult = await ctx.runQuery(
    internal.functions.emails.getIsAdminByClerkId,
    { clerkId: identity.subject },
  );

  if (!isAdminResult?.isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }
}

export async function requireAdminForQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!member || member.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
}

export async function sendGroupsEmailImpl(args: SendGroupsEmailImplArgs) {
  const tournamentContext = (await args.ctx.runQuery(
    internal.functions.emails.getActiveTourCardRecipientsForTournament,
    { tournamentId: args.tournamentId },
  )) as GroupsEmailContext;

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

  const previousTournamentLogoUrl = tournamentContext.previousTournamentLogoUrl;
  const previousTournamentLogoDisplay = previousTournamentLogoUrl
    ? "inline-block"
    : "none";

  const leaderboardRows = tournamentContext.leaderboardRows;

  const top10 = leaderboardRows.slice(0, 10);

  const recipients = tournamentContext.recipients.map((r) => {
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
    await args.ctx.runMutation(internal.functions.emails.markGroupsEmailSent, {
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
    memberCount: tournamentContext.memberCount,
    activeTourCardCount: tournamentContext.activeTourCardCount,
  } as const;
}
