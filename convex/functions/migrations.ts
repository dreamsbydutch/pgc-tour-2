import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../utils/auth";
import type { Doc } from "../_generated/dataModel";

type TableSummary = {
  scanned: number;
  converted: number;
  invalid: number;
};

type CursorMap = {
  members?: string;
  seasons?: string;
  tours?: string;
  tiers?: string;
  courses?: string;
  tournaments?: string;
  tourCards?: string;
  teams?: string;
  golfers?: string;
  tournamentGolfers?: string;
  transactions?: string;
  pushSubscriptions?: string;
};

type RoundTeeTimeCursorMap = {
  teams?: string;
  tournamentGolfers?: string;
};

const DATE_NUMBER_REGEX = /^-?\d+(\.\d+)?$/;
const SQL_DATETIME_REGEX =
  /^(\d{3,4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const TIME_ONLY_AMPM_REGEX = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/;

/**
 * Normalizes legacy date-like values into millisecond timestamps when possible.
 *
 * Supports:
 * - ISO/localized date strings parseable by Date.parse
 * - numeric strings representing epoch seconds or milliseconds
 * - numeric epoch values in seconds or milliseconds
 *
 * @param value Unknown legacy field value.
 * @returns Normalized timestamp, invalid marker, and conversion flag.
 */
function normalizeLegacyDateValue(value: unknown): {
  normalized: number | null;
  converted: boolean;
  invalid: boolean;
} {
  if (value === undefined || value === null) {
    return { normalized: null, converted: false, invalid: false };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { normalized: null, converted: false, invalid: true };
    }

    const normalizedNumber = normalizeEpochNumber(value);
    if (normalizedNumber === null) {
      return { normalized: null, converted: false, invalid: false };
    }

    return {
      normalized: normalizedNumber,
      converted: normalizedNumber !== Math.trunc(value),
      invalid: false,
    };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { normalized: null, converted: false, invalid: false };
    }

    if (DATE_NUMBER_REGEX.test(trimmed)) {
      const parsedNumber = Number(trimmed);
      if (Number.isFinite(parsedNumber)) {
        const normalizedNumber = normalizeEpochNumber(parsedNumber);
        if (normalizedNumber !== null) {
          return {
            normalized: normalizedNumber,
            converted: true,
            invalid: false,
          };
        }
      }
    }

    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate)) {
      return {
        normalized: Math.trunc(parsedDate),
        converted: true,
        invalid: false,
      };
    }

    return { normalized: null, converted: false, invalid: true };
  }

  return { normalized: null, converted: false, invalid: false };
}

/**
 * Coerces epoch values to milliseconds for realistic timestamp ranges.
 *
 * @param value Candidate epoch value.
 * @returns Millisecond timestamp or null when value is out of supported ranges.
 */
function normalizeEpochNumber(value: number): number | null {
  const n = Math.trunc(value);

  if (n >= 1_000_000_000 && n < 100_000_000_000) {
    return n * 1000;
  }

  if (n >= 100_000_000_000 && n < 10_000_000_000_000) {
    return n;
  }

  return null;
}

/**
 * Parses SQL-style datetime strings (YYYY-MM-DD HH:MM:SS) into epoch milliseconds.
 *
 * @param value Datetime string value.
 * @returns Parsed timestamp when valid, otherwise null.
 */
function parseSqlDateTimeToEpochMs(value: string): number | null {
  const match = SQL_DATETIME_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const parsed = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    0,
  ).getTime();
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

/**
 * Parses time-only am/pm strings and anchors them to a reference date.
 *
 * @param value Time string like HH:MMam or HH:MMpm.
 * @param referenceDateMs Tournament start timestamp used as calendar date anchor.
 * @returns Parsed timestamp when valid, otherwise null.
 */
function parseTimeOnlyToEpochMs(
  value: string,
  referenceDateMs: number,
): number | null {
  const match = TIME_ONLY_AMPM_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3].toLowerCase();

  if (
    !Number.isInteger(hour12) ||
    !Number.isInteger(minute) ||
    hour12 < 1 ||
    hour12 > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const referenceDate = new Date(referenceDateMs);
  if (!Number.isFinite(referenceDate.getTime())) {
    return null;
  }

  let hour24 = hour12 % 12;
  if (ampm === "pm") {
    hour24 += 12;
  }

  const anchored = new Date(referenceDateMs);
  anchored.setHours(hour24, minute, 0, 0);
  const result = anchored.getTime();
  if (!Number.isFinite(result)) {
    return null;
  }
  return Math.trunc(result);
}

/**
 * Normalizes legacy tee-time values, including SQL datetime and time-only formats.
 *
 * @param value Raw tee-time field value.
 * @param referenceDateMs Optional date anchor for time-only values.
 * @returns Normalized timestamp, invalid marker, and conversion flag.
 */
function normalizeLegacyTeeTimeValue(
  value: unknown,
  referenceDateMs?: number,
): {
  normalized: number | null;
  converted: boolean;
  invalid: boolean;
} {
  const base = normalizeLegacyDateValue(value);
  if (base.normalized !== null || value === undefined || value === null) {
    return base;
  }

  if (typeof value !== "string") {
    return base;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { normalized: null, converted: false, invalid: false };
  }

  const parsedSql = parseSqlDateTimeToEpochMs(trimmed);
  if (parsedSql !== null) {
    return { normalized: parsedSql, converted: true, invalid: false };
  }

  if (typeof referenceDateMs === "number" && Number.isFinite(referenceDateMs)) {
    const parsedTimeOnly = parseTimeOnlyToEpochMs(trimmed, referenceDateMs);
    if (parsedTimeOnly !== null) {
      return { normalized: parsedTimeOnly, converted: true, invalid: false };
    }
  }

  return { normalized: null, converted: false, invalid: true };
}

/**
 * Converts legacy date fields across tables to numeric millisecond timestamps.
 *
 * @param args.pageSize Number of documents to process per table in one run.
 * @param args.dryRun If true, computes conversions without writing patches.
 * @param args.cursors Optional per-table cursors for iterative backfills.
 * @returns Per-table stats and next cursors to continue migration.
 */
export const normalizeLegacyDateFields = mutation({
  args: {
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    cursors: v.optional(
      v.object({
        members: v.optional(v.string()),
        seasons: v.optional(v.string()),
        tours: v.optional(v.string()),
        tiers: v.optional(v.string()),
        courses: v.optional(v.string()),
        tournaments: v.optional(v.string()),
        tourCards: v.optional(v.string()),
        teams: v.optional(v.string()),
        golfers: v.optional(v.string()),
        tournamentGolfers: v.optional(v.string()),
        transactions: v.optional(v.string()),
        pushSubscriptions: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const pageSize = Math.min(Math.max(args.pageSize ?? 200, 1), 500);
    const dryRun = args.dryRun ?? false;
    const cursors: CursorMap = args.cursors ?? {};

    const summaries: Record<keyof CursorMap, TableSummary> = {
      members: { scanned: 0, converted: 0, invalid: 0 },
      seasons: { scanned: 0, converted: 0, invalid: 0 },
      tours: { scanned: 0, converted: 0, invalid: 0 },
      tiers: { scanned: 0, converted: 0, invalid: 0 },
      courses: { scanned: 0, converted: 0, invalid: 0 },
      tournaments: { scanned: 0, converted: 0, invalid: 0 },
      tourCards: { scanned: 0, converted: 0, invalid: 0 },
      teams: { scanned: 0, converted: 0, invalid: 0 },
      golfers: { scanned: 0, converted: 0, invalid: 0 },
      tournamentGolfers: { scanned: 0, converted: 0, invalid: 0 },
      transactions: { scanned: 0, converted: 0, invalid: 0 },
      pushSubscriptions: { scanned: 0, converted: 0, invalid: 0 },
    };

    const nextCursors: CursorMap = {};

    const membersPage = await ctx.db
      .query("members")
      .paginate({ cursor: cursors.members ?? null, numItems: pageSize });
    summaries.members.scanned = membersPage.page.length;
    nextCursors.members = membersPage.continueCursor;
    for (const doc of membersPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"members">> = {};

      const lastLoginAt = normalizeLegacyDateValue(raw.lastLoginAt);
      if (lastLoginAt.invalid) summaries.members.invalid += 1;
      if (
        lastLoginAt.normalized !== null &&
        (lastLoginAt.converted || typeof raw.lastLoginAt !== "number")
      ) {
        patch.lastLoginAt = lastLoginAt.normalized;
        summaries.members.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.members.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.members.converted += 1;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const seasonsPage = await ctx.db
      .query("seasons")
      .paginate({ cursor: cursors.seasons ?? null, numItems: pageSize });
    summaries.seasons.scanned = seasonsPage.page.length;
    nextCursors.seasons = seasonsPage.continueCursor;
    for (const doc of seasonsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"seasons">> = {};

      const startDate = normalizeLegacyDateValue(raw.startDate);
      if (startDate.invalid) summaries.seasons.invalid += 1;
      if (
        startDate.normalized !== null &&
        (startDate.converted || typeof raw.startDate !== "number")
      ) {
        patch.startDate = startDate.normalized;
        summaries.seasons.converted += 1;
      }

      const endDate = normalizeLegacyDateValue(raw.endDate);
      if (endDate.invalid) summaries.seasons.invalid += 1;
      if (
        endDate.normalized !== null &&
        (endDate.converted || typeof raw.endDate !== "number")
      ) {
        patch.endDate = endDate.normalized;
        summaries.seasons.converted += 1;
      }

      const registrationDeadline = normalizeLegacyDateValue(
        raw.registrationDeadline,
      );
      if (registrationDeadline.invalid) summaries.seasons.invalid += 1;
      if (
        registrationDeadline.normalized !== null &&
        (registrationDeadline.converted ||
          typeof raw.registrationDeadline !== "number")
      ) {
        patch.registrationDeadline = registrationDeadline.normalized;
        summaries.seasons.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.seasons.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.seasons.converted += 1;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const toursPage = await ctx.db
      .query("tours")
      .paginate({ cursor: cursors.tours ?? null, numItems: pageSize });
    summaries.tours.scanned = toursPage.page.length;
    nextCursors.tours = toursPage.continueCursor;
    for (const doc of toursPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"tours">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.tours.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.tours.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const tiersPage = await ctx.db
      .query("tiers")
      .paginate({ cursor: cursors.tiers ?? null, numItems: pageSize });
    summaries.tiers.scanned = tiersPage.page.length;
    nextCursors.tiers = tiersPage.continueCursor;
    for (const doc of tiersPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"tiers">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.tiers.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.tiers.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const coursesPage = await ctx.db
      .query("courses")
      .paginate({ cursor: cursors.courses ?? null, numItems: pageSize });
    summaries.courses.scanned = coursesPage.page.length;
    nextCursors.courses = coursesPage.continueCursor;
    for (const doc of coursesPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"courses">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.courses.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.courses.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const tournamentsPage = await ctx.db
      .query("tournaments")
      .paginate({ cursor: cursors.tournaments ?? null, numItems: pageSize });
    summaries.tournaments.scanned = tournamentsPage.page.length;
    nextCursors.tournaments = tournamentsPage.continueCursor;
    for (const doc of tournamentsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      const startDate = normalizeLegacyDateValue(raw.startDate);
      if (startDate.invalid) summaries.tournaments.invalid += 1;
      if (
        startDate.normalized !== null &&
        (startDate.converted || typeof raw.startDate !== "number")
      ) {
        patch.startDate = startDate.normalized;
        summaries.tournaments.converted += 1;
      }

      const endDate = normalizeLegacyDateValue(raw.endDate);
      if (endDate.invalid) summaries.tournaments.invalid += 1;
      if (
        endDate.normalized !== null &&
        (endDate.converted || typeof raw.endDate !== "number")
      ) {
        patch.endDate = endDate.normalized;
        summaries.tournaments.converted += 1;
      }

      const groupsEmailSentAt = normalizeLegacyDateValue(raw.groupsEmailSentAt);
      if (groupsEmailSentAt.invalid) summaries.tournaments.invalid += 1;
      if (
        groupsEmailSentAt.normalized !== null &&
        (groupsEmailSentAt.converted ||
          typeof raw.groupsEmailSentAt !== "number")
      ) {
        patch.groupsEmailSentAt = groupsEmailSentAt.normalized;
        summaries.tournaments.converted += 1;
      }

      const reminderEmailSentAt = normalizeLegacyDateValue(
        raw.reminderEmailSentAt,
      );
      if (reminderEmailSentAt.invalid) summaries.tournaments.invalid += 1;
      if (
        reminderEmailSentAt.normalized !== null &&
        (reminderEmailSentAt.converted ||
          typeof raw.reminderEmailSentAt !== "number")
      ) {
        patch.reminderEmailSentAt = reminderEmailSentAt.normalized;
        summaries.tournaments.converted += 1;
      }

      const dataGolfInPlayLastUpdate = normalizeLegacyDateValue(
        raw.dataGolfInPlayLastUpdate,
      );
      if (dataGolfInPlayLastUpdate.invalid) summaries.tournaments.invalid += 1;
      if (
        dataGolfInPlayLastUpdate.normalized !== null &&
        (dataGolfInPlayLastUpdate.converted ||
          typeof raw.dataGolfInPlayLastUpdate !== "number")
      ) {
        patch.dataGolfInPlayLastUpdate = dataGolfInPlayLastUpdate.normalized;
        summaries.tournaments.converted += 1;
      }

      const leaderboardLastUpdatedAt = normalizeLegacyDateValue(
        raw.leaderboardLastUpdatedAt,
      );
      if (leaderboardLastUpdatedAt.invalid) summaries.tournaments.invalid += 1;
      if (
        leaderboardLastUpdatedAt.normalized !== null &&
        (leaderboardLastUpdatedAt.converted ||
          typeof raw.leaderboardLastUpdatedAt !== "number")
      ) {
        patch.leaderboardLastUpdatedAt = leaderboardLastUpdatedAt.normalized;
        summaries.tournaments.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.tournaments.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.tournaments.converted += 1;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch as Partial<Doc<"tournaments">>);
      }
    }

    const tourCardsPage = await ctx.db
      .query("tourCards")
      .paginate({ cursor: cursors.tourCards ?? null, numItems: pageSize });
    summaries.tourCards.scanned = tourCardsPage.page.length;
    nextCursors.tourCards = tourCardsPage.continueCursor;
    for (const doc of tourCardsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"tourCards">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.tourCards.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.tourCards.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const teamsPage = await ctx.db
      .query("teams")
      .paginate({ cursor: cursors.teams ?? null, numItems: pageSize });
    summaries.teams.scanned = teamsPage.page.length;
    nextCursors.teams = teamsPage.continueCursor;
    const teamsTournamentStartDateById = new Map<string, number | null>();
    for (const doc of teamsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      const teamTournamentId = String(doc.tournamentId);
      let teamTournamentStartDate =
        teamsTournamentStartDateById.get(teamTournamentId);
      if (teamTournamentStartDate === undefined) {
        const tournament = await ctx.db.get(doc.tournamentId);
        teamTournamentStartDate = tournament?.startDate ?? null;
        teamsTournamentStartDateById.set(
          teamTournamentId,
          teamTournamentStartDate,
        );
      }

      const roundOneTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundOneTeeTime,
        teamTournamentStartDate ?? undefined,
      );
      if (roundOneTeeTime.invalid) summaries.teams.invalid += 1;
      if (
        roundOneTeeTime.normalized !== null &&
        (roundOneTeeTime.converted || typeof raw.roundOneTeeTime !== "number")
      ) {
        patch.roundOneTeeTime = roundOneTeeTime.normalized;
        summaries.teams.converted += 1;
      }

      const roundTwoTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundTwoTeeTime,
        teamTournamentStartDate ?? undefined,
      );
      if (roundTwoTeeTime.invalid) summaries.teams.invalid += 1;
      if (
        roundTwoTeeTime.normalized !== null &&
        (roundTwoTeeTime.converted || typeof raw.roundTwoTeeTime !== "number")
      ) {
        patch.roundTwoTeeTime = roundTwoTeeTime.normalized;
        summaries.teams.converted += 1;
      }

      const roundThreeTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundThreeTeeTime,
        teamTournamentStartDate ?? undefined,
      );
      if (roundThreeTeeTime.invalid) summaries.teams.invalid += 1;
      if (
        roundThreeTeeTime.normalized !== null &&
        (roundThreeTeeTime.converted ||
          typeof raw.roundThreeTeeTime !== "number")
      ) {
        patch.roundThreeTeeTime = roundThreeTeeTime.normalized;
        summaries.teams.converted += 1;
      }

      const roundFourTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundFourTeeTime,
        teamTournamentStartDate ?? undefined,
      );
      if (roundFourTeeTime.invalid) summaries.teams.invalid += 1;
      if (
        roundFourTeeTime.normalized !== null &&
        (roundFourTeeTime.converted || typeof raw.roundFourTeeTime !== "number")
      ) {
        patch.roundFourTeeTime = roundFourTeeTime.normalized;
        summaries.teams.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.teams.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.teams.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch as Partial<Doc<"teams">>);
      }
    }

    const golfersPage = await ctx.db
      .query("golfers")
      .paginate({ cursor: cursors.golfers ?? null, numItems: pageSize });
    summaries.golfers.scanned = golfersPage.page.length;
    nextCursors.golfers = golfersPage.continueCursor;
    for (const doc of golfersPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"golfers">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.golfers.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.golfers.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const tournamentGolfersPage = await ctx.db
      .query("tournamentGolfers")
      .paginate({
        cursor: cursors.tournamentGolfers ?? null,
        numItems: pageSize,
      });
    summaries.tournamentGolfers.scanned = tournamentGolfersPage.page.length;
    nextCursors.tournamentGolfers = tournamentGolfersPage.continueCursor;
    const tournamentGolferTournamentStartDateById = new Map<
      string,
      number | null
    >();
    for (const doc of tournamentGolfersPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      const golferTournamentId = String(doc.tournamentId);
      let golferTournamentStartDate =
        tournamentGolferTournamentStartDateById.get(golferTournamentId);
      if (golferTournamentStartDate === undefined) {
        const tournament = await ctx.db.get(doc.tournamentId);
        golferTournamentStartDate = tournament?.startDate ?? null;
        tournamentGolferTournamentStartDateById.set(
          golferTournamentId,
          golferTournamentStartDate,
        );
      }

      const roundOneTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundOneTeeTime,
        golferTournamentStartDate ?? undefined,
      );
      if (roundOneTeeTime.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundOneTeeTime.normalized !== null &&
        (roundOneTeeTime.converted || typeof raw.roundOneTeeTime !== "number")
      ) {
        patch.roundOneTeeTime = roundOneTeeTime.normalized;
        summaries.tournamentGolfers.converted += 1;
      }

      const roundTwoTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundTwoTeeTime,
        golferTournamentStartDate ?? undefined,
      );
      if (roundTwoTeeTime.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundTwoTeeTime.normalized !== null &&
        (roundTwoTeeTime.converted || typeof raw.roundTwoTeeTime !== "number")
      ) {
        patch.roundTwoTeeTime = roundTwoTeeTime.normalized;
        summaries.tournamentGolfers.converted += 1;
      }

      const roundThreeTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundThreeTeeTime,
        golferTournamentStartDate ?? undefined,
      );
      if (roundThreeTeeTime.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundThreeTeeTime.normalized !== null &&
        (roundThreeTeeTime.converted ||
          typeof raw.roundThreeTeeTime !== "number")
      ) {
        patch.roundThreeTeeTime = roundThreeTeeTime.normalized;
        summaries.tournamentGolfers.converted += 1;
      }

      const roundFourTeeTime = normalizeLegacyTeeTimeValue(
        raw.roundFourTeeTime,
        golferTournamentStartDate ?? undefined,
      );
      if (roundFourTeeTime.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundFourTeeTime.normalized !== null &&
        (roundFourTeeTime.converted || typeof raw.roundFourTeeTime !== "number")
      ) {
        patch.roundFourTeeTime = roundFourTeeTime.normalized;
        summaries.tournamentGolfers.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.tournamentGolfers.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch as Partial<Doc<"tournamentGolfers">>);
      }
    }

    const transactionsPage = await ctx.db
      .query("transactions")
      .paginate({ cursor: cursors.transactions ?? null, numItems: pageSize });
    summaries.transactions.scanned = transactionsPage.page.length;
    nextCursors.transactions = transactionsPage.continueCursor;
    for (const doc of transactionsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"transactions">> = {};

      const processedAt = normalizeLegacyDateValue(raw.processedAt);
      if (processedAt.invalid) summaries.transactions.invalid += 1;
      if (
        processedAt.normalized !== null &&
        (processedAt.converted || typeof raw.processedAt !== "number")
      ) {
        patch.processedAt = processedAt.normalized;
        summaries.transactions.converted += 1;
      }

      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.transactions.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.transactions.converted += 1;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const pushSubscriptionsPage = await ctx.db
      .query("pushSubscriptions")
      .paginate({
        cursor: cursors.pushSubscriptions ?? null,
        numItems: pageSize,
      });
    summaries.pushSubscriptions.scanned = pushSubscriptionsPage.page.length;
    nextCursors.pushSubscriptions = pushSubscriptionsPage.continueCursor;
    for (const doc of pushSubscriptionsPage.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Partial<Doc<"pushSubscriptions">> = {};
      const updatedAt = normalizeLegacyDateValue(raw.updatedAt);
      if (updatedAt.invalid) summaries.pushSubscriptions.invalid += 1;
      if (
        updatedAt.normalized !== null &&
        (updatedAt.converted || typeof raw.updatedAt !== "number")
      ) {
        patch.updatedAt = updatedAt.normalized;
        summaries.pushSubscriptions.converted += 1;
      }
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch);
      }
    }

    const hasMore =
      !membersPage.isDone ||
      !seasonsPage.isDone ||
      !toursPage.isDone ||
      !tiersPage.isDone ||
      !coursesPage.isDone ||
      !tournamentsPage.isDone ||
      !tourCardsPage.isDone ||
      !teamsPage.isDone ||
      !golfersPage.isDone ||
      !tournamentGolfersPage.isDone ||
      !transactionsPage.isDone ||
      !pushSubscriptionsPage.isDone;

    return {
      ok: true,
      dryRun,
      pageSize,
      hasMore,
      summaries,
      nextCursors,
    } as const;
  },
});

/**
 * Converts only round tee-time fields to numeric millisecond timestamps.
 *
 * Fields migrated:
 * - roundOneTeeTime
 * - roundTwoTeeTime
 * - roundThreeTeeTime
 * - roundFourTeeTime
 *
 * @param args.pageSize Number of documents to process per table in one run.
 * @param args.dryRun If true, computes conversions without writing patches.
 * @param args.cursors Optional per-table cursors for iterative backfills.
 * @returns Per-table stats and next cursors to continue migration.
 */
export const normalizeRoundTeeTimeFields = mutation({
  args: {
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    outputType: v.optional(v.union(v.literal("string"), v.literal("number"))),
    target: v.optional(
      v.union(v.literal("teams"), v.literal("tournamentGolfers")),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    cursors: v.optional(
      v.object({
        teams: v.optional(v.string()),
        tournamentGolfers: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const pageSize = Math.min(Math.max(args.pageSize ?? 250, 1), 500);
    const dryRun = args.dryRun ?? false;
    const outputType = args.outputType ?? "number";
    const target = args.target ?? "teams";

    const summaries: Record<keyof RoundTeeTimeCursorMap, TableSummary> = {
      teams: { scanned: 0, converted: 0, invalid: 0 },
      tournamentGolfers: { scanned: 0, converted: 0, invalid: 0 },
    };
    const teamsTournamentStartDateById = new Map<string, number | null>();
    const tournamentStartDateById = new Map<string, number | null>();

    if (target === "teams") {
      const cursor = args.cursor ?? args.cursors?.teams ?? null;
      const page = await ctx.db
        .query("teams")
        .paginate({ cursor, numItems: pageSize });
      summaries.teams.scanned = page.page.length;

      for (const doc of page.page) {
        const raw = doc as unknown as Record<string, unknown>;
        const patch: Record<string, unknown> = {};

        const tournamentIdKey = String(doc.tournamentId);
        let startDate = teamsTournamentStartDateById.get(tournamentIdKey);
        if (startDate === undefined) {
          const tournament = await ctx.db.get(doc.tournamentId);
          startDate = tournament?.startDate ?? null;
          teamsTournamentStartDateById.set(tournamentIdKey, startDate);
        }

        const roundOne = normalizeLegacyTeeTimeValue(
          raw.roundOneTeeTime,
          startDate ?? undefined,
        );
        if (roundOne.invalid) summaries.teams.invalid += 1;
        if (
          roundOne.normalized !== null &&
          (roundOne.converted || typeof raw.roundOneTeeTime !== "number")
        ) {
          patch.roundOneTeeTime =
            outputType === "number"
              ? roundOne.normalized
              : String(roundOne.normalized);
          summaries.teams.converted += 1;
        }

        const roundTwo = normalizeLegacyTeeTimeValue(
          raw.roundTwoTeeTime,
          startDate ?? undefined,
        );
        if (roundTwo.invalid) summaries.teams.invalid += 1;
        if (
          roundTwo.normalized !== null &&
          (roundTwo.converted || typeof raw.roundTwoTeeTime !== "number")
        ) {
          patch.roundTwoTeeTime =
            outputType === "number"
              ? roundTwo.normalized
              : String(roundTwo.normalized);
          summaries.teams.converted += 1;
        }

        const roundThree = normalizeLegacyTeeTimeValue(
          raw.roundThreeTeeTime,
          startDate ?? undefined,
        );
        if (roundThree.invalid) summaries.teams.invalid += 1;
        if (
          roundThree.normalized !== null &&
          (roundThree.converted || typeof raw.roundThreeTeeTime !== "number")
        ) {
          patch.roundThreeTeeTime =
            outputType === "number"
              ? roundThree.normalized
              : String(roundThree.normalized);
          summaries.teams.converted += 1;
        }

        const roundFour = normalizeLegacyTeeTimeValue(
          raw.roundFourTeeTime,
          startDate ?? undefined,
        );
        if (roundFour.invalid) summaries.teams.invalid += 1;
        if (
          roundFour.normalized !== null &&
          (roundFour.converted || typeof raw.roundFourTeeTime !== "number")
        ) {
          patch.roundFourTeeTime =
            outputType === "number"
              ? roundFour.normalized
              : String(roundFour.normalized);
          summaries.teams.converted += 1;
        }

        if (!dryRun && Object.keys(patch).length > 0) {
          await ctx.db.patch(doc._id, patch as Partial<Doc<"teams">>);
        }
      }

      return {
        ok: true,
        dryRun,
        pageSize,
        target,
        hasMore: !page.isDone,
        nextCursor: page.continueCursor,
        summaries,
        nextCursors: {
          teams: page.continueCursor,
          tournamentGolfers: args.cursors?.tournamentGolfers,
        },
      } as const;
    }

    const cursor = args.cursor ?? args.cursors?.tournamentGolfers ?? null;
    const page = await ctx.db
      .query("tournamentGolfers")
      .paginate({ cursor, numItems: pageSize });
    summaries.tournamentGolfers.scanned = page.page.length;

    for (const doc of page.page) {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      const tournamentIdKey = String(doc.tournamentId);
      let startDate = tournamentStartDateById.get(tournamentIdKey);
      if (startDate === undefined) {
        const tournament = await ctx.db.get(doc.tournamentId);
        startDate = tournament?.startDate ?? null;
        tournamentStartDateById.set(tournamentIdKey, startDate);
      }

      const roundOne = normalizeLegacyTeeTimeValue(
        raw.roundOneTeeTime,
        startDate ?? undefined,
      );
      if (roundOne.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundOne.normalized !== null &&
        (roundOne.converted || typeof raw.roundOneTeeTime !== "number")
      ) {
        patch.roundOneTeeTime =
          outputType === "number"
            ? roundOne.normalized
            : String(roundOne.normalized);
        summaries.tournamentGolfers.converted += 1;
      }

      const roundTwo = normalizeLegacyTeeTimeValue(
        raw.roundTwoTeeTime,
        startDate ?? undefined,
      );
      if (roundTwo.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundTwo.normalized !== null &&
        (roundTwo.converted || typeof raw.roundTwoTeeTime !== "number")
      ) {
        patch.roundTwoTeeTime =
          outputType === "number"
            ? roundTwo.normalized
            : String(roundTwo.normalized);
        summaries.tournamentGolfers.converted += 1;
      }

      const roundThree = normalizeLegacyTeeTimeValue(
        raw.roundThreeTeeTime,
        startDate ?? undefined,
      );
      if (roundThree.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundThree.normalized !== null &&
        (roundThree.converted || typeof raw.roundThreeTeeTime !== "number")
      ) {
        patch.roundThreeTeeTime =
          outputType === "number"
            ? roundThree.normalized
            : String(roundThree.normalized);
        summaries.tournamentGolfers.converted += 1;
      }

      const roundFour = normalizeLegacyTeeTimeValue(
        raw.roundFourTeeTime,
        startDate ?? undefined,
      );
      if (roundFour.invalid) summaries.tournamentGolfers.invalid += 1;
      if (
        roundFour.normalized !== null &&
        (roundFour.converted || typeof raw.roundFourTeeTime !== "number")
      ) {
        patch.roundFourTeeTime =
          outputType === "number"
            ? roundFour.normalized
            : String(roundFour.normalized);
        summaries.tournamentGolfers.converted += 1;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(doc._id, patch as Partial<Doc<"tournamentGolfers">>);
      }
    }

    return {
      ok: true,
      dryRun,
      pageSize,
      target,
      hasMore: !page.isDone,
      nextCursor: page.continueCursor,
      summaries,
      nextCursors: {
        teams: args.cursors?.teams,
        tournamentGolfers: page.continueCursor,
      },
    } as const;
  },
});
