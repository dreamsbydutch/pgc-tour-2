import type { ReactNode } from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Id } from "@/convex";
import type {
  AdminDataTableColumn,
  Article,
  ArticleModule,
  ErrorResponse,
  NavigationError,
  TimeLeftType,
} from "./types";
import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardVariant,
} from "./types";
import type {
  ExtendedStandingsTourCard,
  StandingsMember,
  StandingsTeam,
  StandingsTier,
  StandingsTour,
  StandingsTourCard,
  StandingsTournament,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Builds the standard AdminDataTable "actions" column used by CRUD screens.
 */
export function adminActionsColumn<T>(
  cell: (row: T) => ReactNode,
  options?: {
    id?: string;
    header?: ReactNode;
    headClassName?: string;
    cellClassName?: string;
  },
): AdminDataTableColumn<T> {
  return {
    id: options?.id ?? "actions",
    header: options?.header ?? "",
    headClassName: options?.headClassName ?? "w-[1%]",
    cellClassName: options?.cellClassName,
    cell,
  };
}

const activeArticleModules = import.meta.glob<ArticleModule>(
  "/src/lib/articles/active/*.tsx",
  { eager: true },
);

const activeArticles: Article[] = Object.values(activeArticleModules).map(
  (m) => m.article,
);

function sortByPublishedAtDesc(a: Article, b: Article) {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

export function getActiveArticles(): Article[] {
  return [...activeArticles].sort(sortByPublishedAtDesc);
}

export function getActiveArticleBySlug(slug: string): Article | null {
  return activeArticles.find((a) => a.slug === slug) ?? null;
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("Forbidden") ||
      error.message.includes("Unauthorized") ||
      error.message.includes("permission") ||
      error.message.includes("not authorized")
    );
  }
  return false;
}

export function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("not found");
  }
  return false;
}

export function isValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("Validation failed") ||
      error.message.includes("Invalid")
    );
  }
  return false;
}

export function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (isAuthError(error)) {
      if (error.message.includes("Unauthorized")) {
        return "Please sign in to continue";
      }
      if (error.message.includes("Admin")) {
        return "This action requires administrator privileges";
      }
      if (error.message.includes("Moderator")) {
        return "This action requires moderator or administrator privileges";
      }
      if (error.message.includes("own")) {
        return "You can only modify your own resources";
      }
      return "You don't have permission to perform this action";
    }

    if (isNotFoundError(error)) {
      return "The requested resource was not found";
    }

    if (isValidationError(error)) {
      return error.message.replace("Validation failed: ", "");
    }

    return error.message;
  }

  return "An unexpected error occurred";
}

export function parseError(error: unknown): ErrorResponse {
  return {
    isError: true,
    isAuthError: isAuthError(error),
    isNotFoundError: isNotFoundError(error),
    isValidationError: isValidationError(error),
    message: getFriendlyErrorMessage(error),
    originalError: error,
  };
}

export function normalizeList<T, K extends string>(
  result: unknown,
  key: K,
): Array<T> {
  if (!result) return [];
  if (Array.isArray(result)) {
    return (result as Array<T | null>).filter((x): x is T => x !== null);
  }
  if (typeof result === "object" && result !== null && key in result) {
    const value = (result as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return (value as Array<T | null>).filter((x): x is T => x !== null);
    }
  }
  return [];
}

/**
 * Formats a unix ms timestamp into a short `en-US` date+time string.
 */
export function formatDateTime(ms: number | undefined): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

/**
 * Generic compare helper for mixed/unknown values.
 */
export function compareUnknown(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Toggles sort direction for a table-style sort config.
 */
export function toggleSort<T extends string>(
  current: { key: T; dir: "asc" | "desc" } | null,
  nextKey: T,
): { key: T; dir: "asc" | "desc" } {
  if (!current || current.key !== nextKey) return { key: nextKey, dir: "desc" };
  return { key: nextKey, dir: current.dir === "desc" ? "asc" : "desc" };
}

export function getSortIndicator(
  sort: { key: string; dir: "asc" | "desc" } | null,
  key: string,
): string {
  if (!sort || sort.key !== key) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

/**
 * Type guard: returns true when `candidate` is in the provided string union list.
 */
export function isOneOf<T extends string>(
  values: readonly T[],
  candidate: string,
): candidate is T {
  return (values as readonly string[]).includes(candidate);
}

export function isMemberForAccountValue(value: unknown): value is {
  _id: Id<"members">;
  firstname?: string | null;
  lastname?: string | null;
  account: number;
} {
  if (!value || typeof value !== "object") return false;
  if (!("_id" in value) || !("account" in value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.account === "number";
}

export function isSeasonForLabelValue(
  value: unknown,
): value is { _id: Id<"seasons">; year: number; number: number } {
  if (!value || typeof value !== "object") return false;
  if (!("_id" in value) || !("year" in value) || !("number" in value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.year === "number" && typeof record.number === "number";
}

export function isStandingsMember(value: unknown): value is StandingsMember {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("_id" in value)) return false;
  if (
    !("email" in value) ||
    typeof (value as Record<string, unknown>).email !== "string"
  ) {
    return false;
  }
  if (
    !("role" in value) ||
    typeof (value as Record<string, unknown>).role !== "string"
  ) {
    return false;
  }
  if (
    !("account" in value) ||
    typeof (value as Record<string, unknown>).account !== "number"
  ) {
    return false;
  }
  if (
    !("friends" in value) ||
    !Array.isArray((value as Record<string, unknown>).friends)
  ) {
    return false;
  }
  return true;
}

export function pickLatestSeasonId<TId>(
  seasons: Array<{ _id: TId; year: number; number: number }>,
): TId | undefined {
  let best: { _id: TId; year: number; number: number } | undefined;
  for (const season of seasons) {
    if (!best) {
      best = season;
      continue;
    }

    if (season.year > best.year) {
      best = season;
      continue;
    }

    if (season.year === best.year && season.number > best.number) {
      best = season;
    }
  }
  return best?._id;
}

export function findDocByStringId<T extends { _id: unknown }>(
  docs: T[],
  id?: string,
): T | null {
  if (!id) return null;
  return docs.find((doc) => String(doc._id) === id) ?? null;
}

export function selectDefaultTournament<
  T extends { startDate: number; endDate: number },
>(tournaments: T[]): T | null {
  if (tournaments.length === 0) return null;

  const timeline = getTournamentTimeline([...tournaments]);

  if (timeline.current) return timeline.current;
  if (timeline.future.length > 0) return timeline.future[0];
  if (timeline.past.length > 0) return timeline.past[timeline.past.length - 1];

  return tournaments[0] ?? null;
}

export function formatCentsAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function parseNumberList(input: string): number[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) {
    throw new Error("List must be comma-separated numbers");
  }
  return nums.map((n) => Math.trunc(n));
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function formatMoneyWithCents(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function formatBuyIn(cents?: number): string {
  if (typeof cents !== "number") {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function formatRank(position: number): string {
  const suffix = ["th", "st", "nd", "rd"][position % 10] || "th";
  if (position >= 11 && position <= 13) return `${position}th`;
  return `${position}${suffix}`;
}

export function isNavItemActive(href: string, pathname: string): boolean {
  if (!href || !pathname) return false;
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function formatUserDisplayName(
  firstName: string | null,
  lastName: string | null,
): string {
  const first = firstName?.trim() || "";
  const last = lastName?.trim() || "";

  if (!first && !last) return "User";
  return `${first} ${last}`.trim();
}

export function createNavigationError(
  code: string,
  message: string,
  retry?: () => void,
): NavigationError {
  return { code, message, retry };
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = String(error).toLowerCase();
  const networkKeywords = [
    "network",
    "fetch",
    "connection",
    "timeout",
    "offline",
    "unreachable",
  ];

  return networkKeywords.some((keyword) => errorMessage.includes(keyword));
}

export function getRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
}

export function formatTwoDigits(num: number): string {
  return String(num).padStart(2, "0");
}

/**
 * Converts a unix ms timestamp into a `YYYY-MM-DD` string for `<input type="date" />`.
 */
export function msToDateInputValue(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = formatTwoDigits(d.getMonth() + 1);
  const day = formatTwoDigits(d.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Converts a `YYYY-MM-DD` date input value into a unix ms timestamp.
 */
export function dateInputValueToMs(date: string, endOfDay = false): number {
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  return new Date(`${date}${suffix}`).getTime();
}

/**
 * Converts a unix ms timestamp into a `YYYY-MM-DDTHH:mm` string for `<input type="datetime-local" />`.
 */
export function msToDateTimeLocalInputValue(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = formatTwoDigits(d.getMonth() + 1);
  const day = formatTwoDigits(d.getDate());
  const hours = formatTwoDigits(d.getHours());
  const minutes = formatTwoDigits(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a `datetime-local` input value into a unix ms timestamp.
 */
export function dateTimeLocalInputValueToMs(value: string): number {
  return new Date(value).getTime();
}

export function calculateCountdownTimeLeft(
  startDateTime: number,
): TimeLeftType {
  const difference = startDateTime - Date.now();

  if (difference <= 0) {
    return null;
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}
export function getTournamentTimeline<
  T extends {
    startDate: number;
    endDate: number;
  },
>(tournaments: T[]) {
  const now = Date.now();
  const sorted = tournaments.sort((a, b) => a.startDate - b.startDate);

  const past = sorted.filter((t) => t.endDate < now);
  const current = sorted.find((t) => t.startDate <= now && t.endDate >= now);
  const future = sorted.filter((t) => t.startDate > now);

  return {
    all: sorted,
    past,
    current,
    future,
  };
}
export function formatScore(score: number | null): string {
  if (score === null) return "E";
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return score.toString();
}

export function hasItems<T>(array: T[] | null | undefined): array is T[] {
  return Array.isArray(array) && array.length > 0;
}

/**
 * Returns a stable display year for tournaments in the leaderboard header.
 */
export function getTournamentYear(tournament: {
  startDate: number;
  season?: { year?: number | null } | null;
}) {
  return (
    tournament.season?.year ?? new Date(tournament.startDate).getFullYear()
  );
}

/**
 * Formats a date value as `Mon D` (e.g. `Jan 3`) for concise UI labels.
 */
export function formatMonthDay(
  value: Date | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function isNonEmptyString(
  str: string | null | undefined,
): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

/**
 * Returns true when a label contains "playoff" (case-insensitive).
 */
export function includesPlayoff(value: string | null | undefined): boolean {
  if (!isNonEmptyString(value)) return false;
  return value.toLowerCase().includes("playoff");
}

/**
 * Parses a rank from a position string like "T3", "3", or "CUT".
 *
 * @param pos - Position string.
 * @returns Parsed rank, or `Infinity` when not parseable.
 */
export function parseRankFromPositionString(
  pos: string | null | undefined,
): number {
  if (!pos) return Number.POSITIVE_INFINITY;
  const match = /\d+/.exec(pos);
  if (!match) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(match[0], 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Normalizes a position value into a sortable numeric rank.
 *
 * @param pos - Position number or string like "T12".
 * @returns Parsed rank, or `Infinity` when not parseable.
 */
export function parsePositionToNumber(
  pos: string | number | null | undefined,
): number {
  if (typeof pos === "number") return pos;
  if (typeof pos === "string") return parseRankFromPositionString(pos);
  return Number.POSITIVE_INFINITY;
}

/**
 * Adds `standingsPosition` and `currentPosition` to a points-sorted standings list.
 *
 * @param cardsSorted - Cards sorted in descending points order.
 * @returns Cards with computed position fields.
 */
export function computeStandingsPositionStrings(
  cardsSorted: ExtendedStandingsTourCard[],
): ExtendedStandingsTourCard[] {
  const pointsToRanks = new Map<number, { rank: number; tieCount: number }>();

  for (let i = 0; i < cardsSorted.length; i++) {
    const points = cardsSorted[i]!.points;
    const existing = pointsToRanks.get(points);
    if (existing) {
      existing.tieCount += 1;
    } else {
      pointsToRanks.set(points, { rank: i + 1, tieCount: 1 });
    }
  }

  return cardsSorted.map((card) => {
    const info = pointsToRanks.get(card.points);
    const rank = info?.rank ?? 999;
    const isTie = (info?.tieCount ?? 0) > 1;
    const currentPosition = isTie ? `T${rank}` : String(rank);

    return {
      ...card,
      standingsPosition: rank,
      currentPosition,
    };
  });
}

/**
 * Computes position deltas by comparing current points to points before the most recent completed non-playoff tournament.
 *
 * @param args - Standings datasets for the current season.
 * @returns Map keyed by tourCard id with per-tour and overall position deltas.
 */
export function computeStandingsPositionChangeByTour(args: {
  cards: StandingsTourCard[];
  tours: StandingsTour[];
  teams: StandingsTeam[];
  tournaments: StandingsTournament[];
  tiers: StandingsTier[];
}): Map<
  string,
  { posChange: number; posChangePO: number; pastPoints: number }
> {
  const now = Date.now();

  const playoffTierIds = new Set(
    args.tiers
      .filter((t) => includesPlayoff(t.name))
      .map((t) => t._id as string),
  );

  const pastTournament = args.tournaments
    .filter((t) => !playoffTierIds.has(t.tierId as string))
    .filter((t) => t.endDate < now)
    .slice()
    .sort((a, b) => b.endDate - a.endDate)[0];

  if (!pastTournament) return new Map();

  const pointsFromPastTournamentByTourCardId = new Map<string, number>();
  for (const team of args.teams) {
    if (team.tournamentId !== pastTournament._id) continue;
    pointsFromPastTournamentByTourCardId.set(
      team.tourCardId as string,
      team.points ?? 0,
    );
  }

  const pastPointsById = new Map<string, number>();
  for (const tc of args.cards) {
    const delta =
      pointsFromPastTournamentByTourCardId.get(tc._id as string) ?? 0;
    pastPointsById.set(tc._id as string, tc.points - delta);
  }

  const overallPastOrder = args.cards.slice().sort((a, b) => {
    const delta =
      (pastPointsById.get(b._id as string) ?? 0) -
      (pastPointsById.get(a._id as string) ?? 0);
    if (delta !== 0) return delta;
    const nameDelta = String(a.displayName ?? "").localeCompare(
      String(b.displayName ?? ""),
    );
    if (nameDelta !== 0) return nameDelta;
    return String(a._id).localeCompare(String(b._id));
  });

  const overallCurrentOrder = args.cards.slice().sort((a, b) => {
    const delta = b.points - a.points;
    if (delta !== 0) return delta;
    const nameDelta = String(a.displayName ?? "").localeCompare(
      String(b.displayName ?? ""),
    );
    if (nameDelta !== 0) return nameDelta;
    return String(a._id).localeCompare(String(b._id));
  });

  const overallPastRank = new Map<string, number>();
  const overallCurrentRank = new Map<string, number>();

  overallPastOrder.forEach((tc, idx) =>
    overallPastRank.set(tc._id as string, idx + 1),
  );
  overallCurrentOrder.forEach((tc, idx) =>
    overallCurrentRank.set(tc._id as string, idx + 1),
  );

  const perTourPastRank = new Map<string, Map<string, number>>();
  const perTourCurrentRank = new Map<string, Map<string, number>>();

  for (const tour of args.tours) {
    const tourCards = args.cards.filter((c) => c.tourId === tour._id);

    const pastSorted = tourCards.slice().sort((a, b) => {
      const delta =
        (pastPointsById.get(b._id as string) ?? 0) -
        (pastPointsById.get(a._id as string) ?? 0);
      if (delta !== 0) return delta;
      const nameDelta = String(a.displayName ?? "").localeCompare(
        String(b.displayName ?? ""),
      );
      if (nameDelta !== 0) return nameDelta;
      return String(a._id).localeCompare(String(b._id));
    });

    const currentSorted = tourCards.slice().sort((a, b) => {
      const delta = b.points - a.points;
      if (delta !== 0) return delta;
      const nameDelta = String(a.displayName ?? "").localeCompare(
        String(b.displayName ?? ""),
      );
      if (nameDelta !== 0) return nameDelta;
      return String(a._id).localeCompare(String(b._id));
    });

    const pastMap = new Map<string, number>();
    const currentMap = new Map<string, number>();

    pastSorted.forEach((tc, idx) => pastMap.set(tc._id as string, idx + 1));
    currentSorted.forEach((tc, idx) =>
      currentMap.set(tc._id as string, idx + 1),
    );

    perTourPastRank.set(tour._id as string, pastMap);
    perTourCurrentRank.set(tour._id as string, currentMap);
  }

  const out = new Map<
    string,
    { posChange: number; posChangePO: number; pastPoints: number }
  >();

  for (const tc of args.cards) {
    const id = tc._id as string;
    const tourId = tc.tourId as string;
    const pastRankInTour = perTourPastRank.get(tourId)?.get(id) ?? 999;
    const currentRankInTour = perTourCurrentRank.get(tourId)?.get(id) ?? 999;
    const posChange = pastRankInTour - currentRankInTour;

    const pastPO = overallPastRank.get(id) ?? 999;
    const currentPO = overallCurrentRank.get(id) ?? 999;
    const posChangePO = pastPO - currentPO;

    out.set(id, {
      posChange: Number.isFinite(posChange) ? posChange : 0,
      posChangePO: Number.isFinite(posChangePO) ? posChangePO : 0,
      pastPoints: pastPointsById.get(id) ?? tc.points,
    });
  }

  return out;
}

/**
 * Calculates a rounded (1 decimal) average score across the supplied teams.
 *
 * @param teams - Standings teams containing round score fields.
 * @param type - "weekday" uses rounds 1+2, "weekend" uses rounds 3+4.
 * @returns Average score rounded to 1 decimal.
 */
export function calculateAverageScore(
  teams: StandingsTeam[] = [],
  type: "weekday" | "weekend",
): number {
  const rounds =
    type === "weekday"
      ? teams.reduce((acc, t) => acc + (t.roundOne ?? 0) + (t.roundTwo ?? 0), 0)
      : teams.reduce(
          (acc, t) => acc + (t.roundThree ?? 0) + (t.roundFour ?? 0),
          0,
        );

  const roundCount =
    type === "weekday"
      ? teams.filter((t) => t.roundOne !== undefined).length +
        teams.filter((t) => t.roundTwo !== undefined).length
      : teams.filter((t) => t.roundThree !== undefined).length +
        teams.filter((t) => t.roundFour !== undefined).length;

  return Math.round((rounds / (roundCount || 1)) * 10) / 10;
}

/**
 * Determines whether a tournament should be treated as a playoff event.
 */
export function isPlayoffTournament(args: {
  tournamentName?: string | null;
  tierName?: string | null;
}): boolean {
  return includesPlayoff(args.tierName) || includesPlayoff(args.tournamentName);
}

export function getMemberDisplayName(
  member:
    | {
        firstname?: string | null;
        lastname?: string | null;
        email?: string | null;
      }
    | null
    | undefined,
  user:
    | {
        fullName?: string | null;
        primaryEmailAddress?: { emailAddress?: string | null } | null;
        emailAddresses?: Array<{ emailAddress?: string | null }> | null;
      }
    | null
    | undefined,
): string {
  const nameParts = [member?.firstname, member?.lastname].filter(
    (part): part is string => isNonEmptyString(part),
  );

  if (nameParts.length) {
    return `${nameParts[0][0]}. ${nameParts[1] ?? ""}`.trim();
  }

  if (isNonEmptyString(member?.email)) {
    return member.email.split("@")[0];
  }

  if (isNonEmptyString(user?.fullName)) {
    const firstName = user.fullName.split(" ")[0] ?? "";
    const lastName = user.fullName.split(" ").slice(1).join(" ");

    if (firstName && lastName) {
      return `${firstName[0]}. ${lastName}`;
    }
  }

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  if (isNonEmptyString(email)) {
    return email.split("@")[0];
  }

  return "PGC Member";
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function formatTournamentDateRange(
  startDate: number,
  endDate: number,
): string {
  const start = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(startDate);

  const end = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endDate);

  return `${start} - ${end}`;
}

export function formatToPar(score: number | null | undefined): string {
  if (score === null || score === undefined) return "-";
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

export function formatPercentageDisplay(
  value: number | null | undefined,
): string {
  if (!value) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatMoneyUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || amount === 0) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `$${Math.round(amount / 100)}`;
  }
}

const EMOJI_FLAGS: Record<string, string> = {
  USA: "🇺🇸",
  CAN: "🇨🇦",
  ENG: "🏴",
  SCO: "🏴",
  IRL: "🇮🇪",
  GER: "🇩🇪",
  FRA: "🇫🇷",
  ITA: "🇮🇹",
  SWE: "🇸🇪",
  NOR: "🇳🇴",
  DEN: "🇩🇰",
  FIN: "🇫🇮",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  AUS: "🇦🇺",
  RSA: "🇿🇦",
  ARG: "🇦🇷",
  COL: "🇨🇴",
  CHI: "🇨🇳",
  TPE: "🇹🇼",
  BEL: "🇧🇪",
  AUT: "🇦🇹",
  PHI: "🇵🇭",
  PUR: "🇵🇷",
  VEN: "🇻🇪",
};

export function getCountryFlagEmoji(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return EMOJI_FLAGS[code] ?? null;
}

const SCORE_PENALTIES = {
  DQ: 999,
  WD: 888,
  CUT: 444,
} as const;

export function isPlayerCut(position: string | null | undefined): boolean {
  return position === "CUT" || position === "WD" || position === "DQ";
}

function calculateScoreForSorting(
  position: string | null | undefined,
  score: number | null | undefined,
): number {
  if (position === "DQ") return SCORE_PENALTIES.DQ + (score ?? 999);
  if (position === "WD") return SCORE_PENALTIES.WD + (score ?? 999);
  if (position === "CUT") return SCORE_PENALTIES.CUT + (score ?? 999);
  return score ?? 999;
}

export function getPositionChangeForTeam(team: {
  pastPosition: string | null;
  position: string | null;
}): number {
  if (!team.pastPosition || !team.position) return 0;
  return (
    Number(team.pastPosition.replace("T", "")) -
    Number(team.position.replace("T", ""))
  );
}

export function sortPgaRows(rows: LeaderboardPgaRow[]): LeaderboardPgaRow[] {
  const nonCut = rows.filter((r) => !isPlayerCut(r.position));
  const cut = rows.filter((r) => isPlayerCut(r.position));

  nonCut.sort(
    (a, b) =>
      calculateScoreForSorting(a.position, a.score) -
      calculateScoreForSorting(b.position, b.score),
  );

  cut
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    )
    .sort((a, b) => (a.group ?? 999) - (b.group ?? 999))
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));

  return [...nonCut, ...cut];
}

export function sortTeamRows(rows: LeaderboardTeamRow[]): LeaderboardTeamRow[] {
  const next = [...rows];
  next
    .sort((a, b) => (a.thru ?? 0) - (b.thru ?? 0))
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    );
  return next;
}

export function filterTeamRowsByTour(
  rows: LeaderboardTeamRow[],
  activeTourId: string,
  variant: LeaderboardVariant,
): LeaderboardTeamRow[] {
  const sorted = sortTeamRows(rows);

  if (variant === "playoff") {
    const playoffLevel =
      activeTourId === "gold" ? 1 : activeTourId === "silver" ? 2 : 1;
    return sorted.filter((t) => (t.tourCard.playoff ?? 0) === playoffLevel);
  }

  return sorted.filter((t) => (t.tourCard.tourId ?? "") === activeTourId);
}

export function getLeaderboardRowClass(args: {
  type: "PGC" | "PGA";
  isCut: boolean;
  isUser: boolean;
  isFriend: boolean;
}): string {
  const classes = [
    "col-span-10 grid grid-flow-row grid-cols-10 py-0.5 sm:grid-cols-33",
  ];

  if (args.type === "PGC") {
    if (args.isUser) classes.push("bg-slate-200 font-semibold");
    else if (args.isFriend) classes.push("bg-slate-100");
    if (args.isCut) classes.push("text-gray-400");
  }

  if (args.type === "PGA") {
    if (args.isUser) classes.push("bg-slate-100");
    if (args.isCut) classes.push("text-gray-400");
  }

  return classes.join(" ");
}

const DATAGOLF_BASE_URL = "https://feeds.datagolf.com/";

/**
 * Fetches data from the DataGolf API with proper error handling and caching.
 * Adds a cache-busting `_t` query param.
 * Adapted for Convex environment.
 *
 * @param endpoint - The DataGolf API endpoint (e.g., "preds/live-hole-stats")
 * @param params - Optional query parameters as an object
 * @param apiKey - DataGolf API key (usually from environment)
 * @returns Parsed JSON data from the API
 * @throws Error if the request fails or the API key is missing
 */
export async function fetchDataGolf(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  apiKey?: string,
): Promise<unknown> {
  if (!apiKey) {
    throw new Error("Missing DataGolf API key (EXTERNAL_DATA_API_KEY)");
  }

  const url = new URL(endpoint, DATAGOLF_BASE_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("_t", Date.now().toString());

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      url.searchParams.set(k, String(v));
    }
  }

  console.log(`🌐 Fetching DataGolf API: ${endpoint}`, {
    timestamp: new Date().toISOString(),
    url: url.toString().replace(apiKey, "[REDACTED]"),
  });

  const res = await fetch(url.toString(), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "User-Agent": "PGC-Tour-App/1.0",
    },
  });

  if (!res.ok) {
    console.error(`❌ DataGolf API error: ${res.status} ${res.statusText}`, {
      endpoint,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    });
    throw new Error(`DataGolf API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as unknown;
  console.log(`✅ DataGolf API success: ${endpoint}`, {
    timestamp: new Date().toISOString(),
    dataSize: JSON.stringify(data).length,
  });

  return data;
}

/**
 * Batches async operations to avoid rate limits
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processor Function to process each item
 * @param delayMs Delay between batches in milliseconds
 * @returns Promise that resolves when all batches are processed
 */
export async function batchProcess<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
  delayMs = 50,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    await Promise.all(batch.map(processor));
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Batches async operations and returns results
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processor Function to process each item and return a result
 * @param delayMs Delay between batches in milliseconds
 * @returns Promise that resolves with array of results
 */
export async function batchProcessWithResults<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs = 50,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Type guard for number values
 * @param value - Value to check
 * @returns True if value is a number (excluding NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

/**
 * Validates if a value is a valid golf score
 * @param score - Score to validate
 * @returns True if valid golf score
 */
export function isValidGolfScore(score: unknown): score is number {
  return isNumber(score) && score >= -40 && score <= 99;
}

/**
 * Validates if a value is a valid hole number (1-18)
 * @param hole - Hole number to validate
 * @returns True if valid hole number
 */
export function isValidHole(hole: unknown): hole is number {
  return isNumber(hole) && Number.isInteger(hole) && hole >= 1 && hole <= 18;
}

/**
 * Validates if a value is a valid round number (1-4)
 * @param round - Round number to validate
 * @returns True if valid round number
 */
export function isValidRound(round: unknown): round is number {
  return isNumber(round) && Number.isInteger(round) && round >= 1 && round <= 4;
}

/**
 * Validates if a value is a valid tournament status
 * @param status - Status to validate
 * @returns True if valid tournament status
 */
export function isValidTournamentStatus(
  status: unknown,
): status is "upcoming" | "current" | "completed" {
  return (
    status === "upcoming" || status === "current" || status === "completed"
  );
}

/**
 * Safely gets a nested property from an object using a dot-separated path string.
 * Returns undefined if any part of the path is missing.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path string (e.g., 'a.b.c')
 * @returns The value at the given path, or undefined if not found
 */
export function getPath<T = unknown, R = unknown>(
  obj: T,
  path: string,
): R | undefined {
  if (!obj || typeof path !== "string" || !path) return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && key in (acc as object)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    ) as R | undefined;
}

/**
 * Extracts a human-readable error message from any error-like value.
 * Handles Error objects, fetch errors, and plain strings.
 *
 * @param error - The error value to extract a message from
 * @returns The error message as a string
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    return "Unserializable error";
  }
}

/**
 * Groups array items by a key function
 * @param array - Array to group
 * @param keyFn - Function to extract grouping key
 * @returns Object with grouped items
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * Generic sort function with type safety
 * @param items - Items to sort
 * @param key - Key to sort by
 * @param direction - Sort direction
 * @returns Sorted array
 */
export function sortItems<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "desc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal == null || bVal == null) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}
