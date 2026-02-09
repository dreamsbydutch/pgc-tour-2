import { TIME } from "../functions/_constants";
import { fetchWithRetry } from "./externalFetch";
import type { AuthCtx } from "../types/functionUtils";
import type {
  ClerkUser,
  FetchClerkUsersOptions,
  MembersOrderBy,
  MembersWhereCondition,
  MembersWhereOp,
  MembersWhereValue,
} from "../types/members";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhancedMemberDoc,
  MemberDoc,
  MemberEnhancementOptions,
  MemberFilterOptions,
  MemberOptimizedQueryOptions,
  MemberSortFunction,
  MemberSortOptions,
} from "../types/types";
import { dateUtils, formatCents, normalize } from "./misc";

export function buildFullName(user: ClerkUser): string {
  const fromFull = (user.full_name ?? "").trim();
  if (fromFull) return fromFull;
  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  return `${first} ${last}`.trim().replace(/\s+/g, " ");
}

export function pickPrimaryEmail(user: ClerkUser): string | null {
  const emails = Array.isArray(user.email_addresses)
    ? user.email_addresses
    : [];
  const first = emails[0]?.email_address;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

export async function fetchClerkUsers(
  options: FetchClerkUsersOptions,
): Promise<ClerkUser[]> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Missing CLERK_SECRET_KEY in Convex environment variables.",
    );
  }

  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("offset", String(options.offset));

  const result = await fetchWithRetry<ClerkUser[]>(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    },
    {
      timeout: 30000,
      retries: 3,
      validateResponse: (json): json is ClerkUser[] =>
        Array.isArray(json) &&
        json.every(
          (u) =>
            u && typeof u === "object" && "id" in u && typeof u.id === "string",
        ),
      logPrefix: "Clerk API",
    },
  );

  if (!result.ok) {
    throw new Error(`Clerk API error: ${result.error}`);
  }

  return result.data;
}

export async function getActingClerkId(
  ctx: AuthCtx,
  clerkId: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    if (clerkId && identity.subject !== clerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }
    return identity.subject;
  }

  if (!clerkId) {
    throw new Error("Unauthorized: You must be signed in");
  }
  return clerkId;
}

export async function getActingMemberByClerkId(
  ctx: DatabaseContext,
  clerkId: string,
) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();

  if (!member) {
    throw new Error(
      "Member profile not found. Please contact an administrator.",
    );
  }

  return member;
}

export async function getActingMember(
  ctx: AuthCtx,
  clerkId: string | undefined,
) {
  const effective = (clerkId ?? "").trim() || undefined;
  const actingClerkId = await getActingClerkId(ctx, effective);
  return await getActingMemberByClerkId(ctx, actingClerkId);
}

export function generateFullName(
  firstname?: string,
  lastname?: string,
): string {
  const first = (firstname || "").trim();
  const last = (lastname || "").trim();

  if (first && last) {
    return `${first} ${last}`;
  } else if (first) {
    return first;
  } else if (last) {
    return last;
  } else {
    return "";
  }
}

export function normalizeNameToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let out = "";
  let shouldCapitalize = true;

  for (const ch of trimmed) {
    const isLetter = /[A-Za-z]/.test(ch);
    if (isLetter) {
      out += shouldCapitalize ? ch.toUpperCase() : ch.toLowerCase();
      shouldCapitalize = false;
      continue;
    }

    out += ch;
    shouldCapitalize = ch === "-" || ch === "'" || ch === "’";
  }

  return out;
}

export function normalizePersonName(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const tokens = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(normalizeNameToken);

  return tokens.join(" ");
}

export function generateDisplayName(
  displayName?: string,
  firstname?: string,
  lastname?: string,
  email?: string,
): string {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }

  const fullName = generateFullName(firstname, lastname);
  if (fullName) {
    return fullName;
  }

  if (email) {
    return email.split("@")[0];
  }

  return "Anonymous User";
}

export function readOptionalDisplayName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const dn = (value as { displayName?: unknown }).displayName;
  return typeof dn === "string" && dn.trim() ? dn.trim() : undefined;
}

export function calculateDaysSinceLastLogin(
  lastLoginAt?: number,
): number | undefined {
  if (!lastLoginAt) return undefined;
  return dateUtils.daysSince(lastLoginAt);
}

export function isOnline(lastLoginAt?: number): boolean {
  if (!lastLoginAt) return false;
  const now = Date.now();
  const threshold = now - TIME.FIFTEEN_MINUTES;
  return lastLoginAt > threshold;
}

export async function getOptimizedMembers(
  ctx: DatabaseContext,
  options: MemberOptimizedQueryOptions,
): Promise<MemberDoc[]> {
  const filter = options.filter || {};

  if (filter.clerkId) {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
      .first();
    return member ? [member] : [];
  }

  if (filter.email) {
    const normalized = normalize.email(filter.email);
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();

    if (member) return [member];

    const raw = filter.email.trim();
    if (raw !== normalized) {
      const byRaw = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", raw))
        .first();
      return byRaw ? [byRaw] : [];
    }

    return [];
  }

  if (filter.role) {
    return await ctx.db
      .query("members")
      .withIndex("by_role", (q) => q.eq("role", filter.role!))
      .collect();
  }

  return await ctx.db.query("members").collect();
}

export function applyFilters(
  members: MemberDoc[],
  filter: MemberFilterOptions,
): MemberDoc[] {
  const {
    role,
    minBalance,
    maxBalance,
    hasBalance,
    searchTerm,
    hasFriends,
    isOnline: filterIsOnline,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
    lastLoginAfter,
    lastLoginBefore,
  } = filter;

  return members.filter((member) => {
    if (role && member.role !== role) {
      return false;
    }

    if (minBalance !== undefined && member.account < minBalance) {
      return false;
    }

    if (maxBalance !== undefined && member.account > maxBalance) {
      return false;
    }

    if (hasBalance !== undefined) {
      const memberHasBalance = member.account > 0;
      if (memberHasBalance !== hasBalance) {
        return false;
      }
    }

    if (hasFriends !== undefined) {
      const memberHasFriends = member.friends.length > 0;
      if (memberHasFriends !== hasFriends) {
        return false;
      }
    }

    if (filterIsOnline && !isOnline(member.lastLoginAt)) {
      return false;
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchableText = [
        member.email,
        member.firstname || "",
        member.lastname || "",
        member.clerkId || "",
        member.role,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(search)) {
        return false;
      }
    }

    if (createdAfter !== undefined && member._creationTime < createdAfter) {
      return false;
    }

    if (createdBefore !== undefined && member._creationTime > createdBefore) {
      return false;
    }

    if (updatedAfter !== undefined && (member.updatedAt || 0) < updatedAfter) {
      return false;
    }

    if (
      updatedBefore !== undefined &&
      (member.updatedAt || 0) > updatedBefore
    ) {
      return false;
    }

    if (
      lastLoginAfter !== undefined &&
      (member.lastLoginAt || 0) < lastLoginAfter
    ) {
      return false;
    }

    if (
      lastLoginBefore !== undefined &&
      (member.lastLoginAt || 0) > lastLoginBefore
    ) {
      return false;
    }

    return true;
  });
}

export function getSortFunction(sort: MemberSortOptions): MemberSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "firstname":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.firstname || "").localeCompare(b.firstname || "") * sortOrder;
    case "lastname":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.lastname || "").localeCompare(b.lastname || "") * sortOrder;
    case "email":
      return (a: MemberDoc, b: MemberDoc) =>
        a.email.localeCompare(b.email) * sortOrder;
    case "account":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.account - b.account) * sortOrder;
    case "role":
      return (a: MemberDoc, b: MemberDoc) =>
        a.role.localeCompare(b.role) * sortOrder;
    case "createdAt":
      return (a: MemberDoc, b: MemberDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: MemberDoc, b: MemberDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    case "lastLoginAt":
      return (a: MemberDoc, b: MemberDoc) =>
        ((a.lastLoginAt || 0) - (b.lastLoginAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

export async function enhanceMember(
  ctx: DatabaseContext,
  member: MemberDoc,
  enhance: MemberEnhancementOptions,
): Promise<EnhancedMemberDoc> {
  const enhanced: EnhancedMemberDoc = {
    ...member,
    fullName: generateFullName(member.firstname, member.lastname),
    formattedBalance: formatCents(member.account),
    hasBalance: member.account > 0,
    isOnline: isOnline(member.lastLoginAt),
    daysSinceLastLogin: calculateDaysSinceLastLogin(member.lastLoginAt),
    friendCount: member.friends.length,
  };

  if (enhance.includeFriends && member.friends.length > 0) {
    const friendMembers = await Promise.all(
      member.friends.map(async (friendId) => {
        if (typeof friendId === "string") {
          const byClerk = await ctx.db
            .query("members")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", friendId))
            .first();
          if (byClerk) return byClerk;
          return await ctx.db
            .query("members")
            .withIndex("by_email", (q) => q.eq("email", friendId))
            .first();
        } else {
          return await ctx.db.get(friendId);
        }
      }),
    );
    enhanced.friendMembers = friendMembers.filter(
      (f): f is MemberDoc => f !== null,
    );
  }

  if (enhance.includeTourCards) {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    enhanced.tourCards = tourCards;
  }

  if (enhance.includeTeams) {
    const memberTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();

    const teams = await ctx.db.query("teams").collect();
    const memberTeams = teams.filter((team) =>
      memberTourCards.some((tc) => tc._id === team.tourCardId),
    );
    enhanced.teams = memberTeams;
  }

  if (enhance.includeTransactions) {
    enhanced.transactions = [];
  }

  return enhanced;
}

export async function generateAnalytics(
  _ctx: DatabaseContext,
  members: MemberDoc[],
): Promise<AnalyticsResult> {
  const now = Date.now();
  const weekAgo = now - 7 * TIME.MS_PER_DAY;

  const activeMembers = members;
  const onlineMembers = members.filter((m) => isOnline(m.lastLoginAt));
  const recentlyActiveMembers = members.filter(
    (m) => m.lastLoginAt && m.lastLoginAt > weekAgo,
  );

  return {
    total: members.length,
    active: activeMembers.length,
    inactive: 0,
    statistics: {
      totalBalance: members.reduce((sum, m) => sum + m.account, 0),
      averageBalance:
        members.length > 0
          ? members.reduce((sum, m) => sum + m.account, 0) / members.length
          : 0,
      membersWithBalance: members.filter((m) => m.account > 0).length,
      adminCount: members.filter((m) => m.role === "admin").length,
      moderatorCount: members.filter((m) => m.role === "moderator").length,
      regularCount: members.filter((m) => m.role === "regular").length,
      onlineMembers: onlineMembers.length,
      recentlyActive: recentlyActiveMembers.length,
      averageFriends:
        members.length > 0
          ? members.reduce((sum, m) => sum + m.friends.length, 0) /
            members.length
          : 0,
    },
    breakdown: members.reduce(
      (acc, member) => {
        acc[member.role] = (acc[member.role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}

function getMemberFieldValue(member: MemberDoc, field: string): unknown {
  if (field === "fullName") {
    return generateFullName(member.firstname, member.lastname);
  }

  if (field === "formattedBalance") {
    return formatCents(member.account);
  }

  if (field === "effectiveDisplayName") {
    return generateDisplayName(member.firstname, member.lastname, member.email);
  }

  if (field === "hasBalance") {
    return member.account > 0;
  }

  if (field === "isOnline") {
    return isOnline(member.lastLoginAt);
  }

  if (field === "daysSinceLastLogin") {
    return calculateDaysSinceLastLogin(member.lastLoginAt);
  }

  if (field === "friendCount") {
    return member.friends.length;
  }

  return (member as unknown as Record<string, unknown>)[field];
}

function asComparableString(
  value: string,
  caseInsensitive: boolean | undefined,
): string {
  return caseInsensitive ? value.toLowerCase() : value;
}

function matchesWhereCondition(
  member: MemberDoc,
  condition: MembersWhereCondition,
): boolean {
  const op: MembersWhereOp = condition.op ?? "eq";
  const fieldValue = getMemberFieldValue(member, condition.field);

  if (op === "exists") {
    if (condition.value === false) {
      return fieldValue === null || fieldValue === undefined;
    }
    return fieldValue !== null && fieldValue !== undefined;
  }

  if (op === "in") {
    const values = condition.values ?? [];
    return values.some(
      (v) => v === (fieldValue as unknown as MembersWhereValue),
    );
  }

  if (op === "includes") {
    const needle = condition.value;
    if (needle === undefined) return false;
    if (!Array.isArray(fieldValue)) return false;
    return (fieldValue as unknown[]).some((v) => v === needle);
  }

  if (op === "contains" || op === "startsWith" || op === "endsWith") {
    const needle = condition.value;
    if (typeof needle !== "string") return false;
    if (typeof fieldValue !== "string") return false;

    const haystack = asComparableString(fieldValue, condition.caseInsensitive);
    const query = asComparableString(needle, condition.caseInsensitive);

    if (op === "contains") return haystack.includes(query);
    if (op === "startsWith") return haystack.startsWith(query);
    return haystack.endsWith(query);
  }

  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    const needle = condition.value;
    if (typeof needle !== "number") return false;
    if (typeof fieldValue !== "number") return false;

    if (op === "gt") return fieldValue > needle;
    if (op === "gte") return fieldValue >= needle;
    if (op === "lt") return fieldValue < needle;
    return fieldValue <= needle;
  }

  if (op === "neq") {
    return fieldValue !== (condition.value as unknown as MembersWhereValue);
  }

  return fieldValue === (condition.value as unknown as MembersWhereValue);
}

export function applyWhereConditions(
  members: MemberDoc[],
  where: MembersWhereCondition[] | undefined,
): MemberDoc[] {
  if (!where || where.length === 0) return members;
  return members.filter((m) => where.every((c) => matchesWhereCondition(m, c)));
}

export function buildOrderByComparator(orderBy: MembersOrderBy[]) {
  const clauses = orderBy.filter((c) => typeof c.field === "string" && c.field);

  return (a: MemberDoc, b: MemberDoc): number => {
    for (const clause of clauses) {
      const direction = clause.direction ?? "asc";
      const nulls = clause.nulls ?? "last";

      const aVal = getMemberFieldValue(a, clause.field);
      const bVal = getMemberFieldValue(b, clause.field);

      const aNullish = aVal === null || aVal === undefined;
      const bNullish = bVal === null || bVal === undefined;

      if (aNullish || bNullish) {
        if (aNullish && bNullish) continue;
        const nullCmp = aNullish ? 1 : -1;
        return nulls === "first" ? -nullCmp : nullCmp;
      }

      let cmp = 0;

      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
        cmp = Number(aVal) - Number(bVal);
      } else {
        const aStr = asComparableString(String(aVal), clause.caseInsensitive);
        const bStr = asComparableString(String(bVal), clause.caseInsensitive);
        cmp = aStr.localeCompare(bStr);
      }

      if (cmp !== 0) {
        return direction === "desc" ? -cmp : cmp;
      }
    }

    return 0;
  };
}
