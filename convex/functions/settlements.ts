import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentMember, requireAdmin } from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import { publishNotifications } from "../utils/notifications";
import {
  NEXT_SEASON_CARD_CENTS,
  areAllSettlementItemsComplete,
  getCompletedSeasonWinningsCredit,
  getOfficialMemberSeasonEarnings,
  getSettlementAmounts,
  isSettlementSeasonComplete,
  normalizePayoutEmail,
  requirePositiveIntegerCents,
  settlementItemAmount,
  settlementItemCompleted,
  type SettlementItemKind,
} from "../utils/settlements";

const settlementItemValidator = v.union(
  v.literal("transfer"),
  v.literal("charity"),
  v.literal("league"),
  v.literal("nextSeasonCard"),
);

export const submitMyRequest = mutation({
  args: {
    seasonId: v.id("seasons"),
    transferCents: v.number(),
    charityCents: v.number(),
    leagueCents: v.number(),
    nextSeasonCardCents: v.number(),
    retainedCents: v.optional(v.number()),
    payoutEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const [season, appState, existingForMember] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("appState")
        .withIndex("by_key", (query) => query.eq("key", "primary"))
        .unique(),
      ctx.db
        .query("settlementRequests")
        .withIndex("by_member", (query) => query.eq("memberId", member._id))
        .take(100),
    ]);
    if (!season) throw new Error("Season not found");
    if (!appState?.currentSeasonId || season._id !== appState.currentSeasonId) {
      throw new Error(
        "Earnings requests are only available for the current season",
      );
    }
    if (!isSettlementSeasonComplete({ season, appState, now: Date.now() })) {
      throw new Error("Earnings requests open after the season is completed");
    }

    const activeRequest = existingForMember.find(
      (request) =>
        request.status === "pending" || request.status === "in_progress",
    );
    if (activeRequest) {
      throw new Error("You already have an earnings request being processed");
    }
    const sameSeasonRequest = existingForMember.find(
      (request) => request.seasonId === args.seasonId,
    );
    if (sameSeasonRequest?.status === "completed") {
      throw new Error("This season's earnings have already been settled");
    }

    const transferCents = requirePositiveIntegerCents(
      args.transferCents,
      "E-transfer amount",
    );
    const charityCents = requirePositiveIntegerCents(
      args.charityCents,
      "Charity amount",
    );
    const leagueCents = requirePositiveIntegerCents(
      args.leagueCents,
      "League donation amount",
    );
    const nextSeasonCardCents = requirePositiveIntegerCents(
      args.nextSeasonCardCents,
      "Next-season card amount",
    );
    const retainedCents = requirePositiveIntegerCents(
      args.retainedCents ?? 0,
      "Amount left in account",
    );
    if (
      nextSeasonCardCents !== 0 &&
      nextSeasonCardCents !== NEXT_SEASON_CARD_CENTS
    ) {
      throw new Error("The next-season tour-card allocation must be $100");
    }

    const earningsCents = await getOfficialMemberSeasonEarnings(
      ctx,
      member._id,
      args.seasonId,
    );
    const creditedEarningsCents = await getCompletedSeasonWinningsCredit(
      ctx,
      member._id,
      args.seasonId,
    );
    const { accountOffsetCents, availableCents } = getSettlementAmounts({
      earningsCents,
      accountCents: member.account,
      creditedEarningsCents,
    });
    if (availableCents <= 0) {
      throw new Error("There are no account funds available to allocate");
    }
    const allocatedCents =
      transferCents +
      charityCents +
      leagueCents +
      nextSeasonCardCents +
      retainedCents;
    if (allocatedCents !== availableCents) {
      throw new Error("Allocate the full available account balance");
    }
    const payoutEmail =
      transferCents > 0
        ? normalizePayoutEmail(args.payoutEmail ?? member.email)
        : undefined;
    const now = Date.now();
    const hasAdminWork =
      transferCents + charityCents + leagueCents + nextSeasonCardCents > 0;
    const value = {
      memberId: member._id,
      seasonId: season._id,
      earningsCents,
      accountOffsetCents,
      availableCents,
      transferCents,
      charityCents,
      leagueCents,
      nextSeasonCardCents,
      retainedCents,
      payoutEmail,
      status: hasAdminWork ? ("pending" as const) : ("completed" as const),
      submittedAt: now,
      transferCompletedAt: undefined,
      transferCompletedBy: undefined,
      charityCompletedAt: undefined,
      charityCompletedBy: undefined,
      leagueCompletedAt: undefined,
      leagueCompletedBy: undefined,
      nextSeasonCardCompletedAt: undefined,
      nextSeasonCardCompletedBy: undefined,
      completedAt: hasAdminWork ? undefined : now,
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationReason: undefined,
      updatedAt: now,
    };

    const requestId = sameSeasonRequest
      ? sameSeasonRequest._id
      : await ctx.db.insert("settlementRequests", value);
    if (sameSeasonRequest) await ctx.db.patch(sameSeasonRequest._id, value);
    await creditOfficialWinnings(ctx, {
      member,
      seasonId: season._id,
      officialEarnings: earningsCents,
      creditedEarnings: creditedEarningsCents,
      now,
      settlementRequestId: requestId,
    });

    await writeAuditLog(ctx, {
      memberId: member._id,
      entityType: "settlementRequest",
      entityId: String(requestId),
      action: sameSeasonRequest ? "restored" : "created",
      changes: {
        seasonId: String(season._id),
        earningsCents,
        accountOffsetCents,
        availableCents,
        transferCents,
        charityCents,
        leagueCents,
        nextSeasonCardCents,
        retainedCents,
      },
    });
    if (hasAdminWork) {
      const admins = await ctx.db
        .query("members")
        .withIndex("by_role", (query) => query.eq("role", "admin"))
        .take(100);
      await publishNotifications(ctx, {
        dedupeKey: `settlement-submitted:${requestId}:${now}`,
        category: "financial",
        settlementRequestId: requestId,
        recipients: admins
          .filter((admin) => admin.isActive !== false)
          .map((admin) => ({
            memberId: admin._id,
            title: "New earnings request",
            body: `${[member.firstname, member.lastname].filter(Boolean).join(" ") || member.email} submitted season earnings instructions.`,
            href: "/admin#payout-requests",
          })),
      });
    }
    return await ctx.db.get(requestId);
  },
});

export const adminListRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("settlementRequests")
      .order("desc")
      .take(500);
    const memberIds = [...new Set(requests.map((request) => request.memberId))];
    const seasonIds = [...new Set(requests.map((request) => request.seasonId))];
    const [members, seasons] = await Promise.all([
      Promise.all(memberIds.map((memberId) => ctx.db.get(memberId))),
      Promise.all(seasonIds.map((seasonId) => ctx.db.get(seasonId))),
    ]);
    const memberById = new Map(
      members.filter(Boolean).map((member) => [member!._id, member!] as const),
    );
    const seasonById = new Map(
      seasons.filter(Boolean).map((season) => [season!._id, season!] as const),
    );
    return requests.map((request) => {
      const member = memberById.get(request.memberId);
      const season = seasonById.get(request.seasonId);
      return {
        ...request,
        memberName:
          [member?.firstname, member?.lastname]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          member?.email ||
          "Member",
        memberEmail: member?.email ?? "",
        seasonLabel: season
          ? `${season.year} Season ${season.number}`
          : "Season",
      };
    });
  },
});

export const adminCreditCurrentSeasonWinnings = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await getCurrentMember(ctx);
    await requireAdmin(ctx);
    const appState = await ctx.db
      .query("appState")
      .withIndex("by_key", (query) => query.eq("key", "primary"))
      .unique();
    if (!appState?.currentSeasonId) throw new Error("Current season not found");
    const season = await ctx.db.get(appState.currentSeasonId);
    if (!season) throw new Error("Current season not found");
    if (!isSettlementSeasonComplete({ season, appState, now: Date.now() })) {
      throw new Error("Season winnings can only be credited after completion");
    }

    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100);
    const page = await ctx.db.query("members").paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });
    let creditedMembers = 0;
    let creditedCents = 0;
    let unchanged = 0;
    let noEarnings = 0;

    for (const member of page.page) {
      const officialEarnings = await getOfficialMemberSeasonEarnings(
        ctx,
        member._id,
        season._id,
      );
      if (officialEarnings === 0) {
        noEarnings += 1;
        continue;
      }
      const creditedEarnings = await getCompletedSeasonWinningsCredit(
        ctx,
        member._id,
        season._id,
      );
      const now = Date.now();
      const credited = await creditOfficialWinnings(ctx, {
        member,
        seasonId: season._id,
        officialEarnings,
        creditedEarnings,
        now,
      });
      if (credited === 0) {
        unchanged += 1;
        continue;
      }
      creditedMembers += 1;
      creditedCents += credited;
      await writeAuditLog(ctx, {
        memberId: admin._id,
        entityType: "member",
        entityId: String(member._id),
        action: "updated",
        changes: {
          reason: "season_winnings_credit",
          seasonId: String(season._id),
          amountCents: credited,
        },
      });
    }

    return {
      seasonId: season._id,
      seasonLabel: `${season.year} Season ${season.number}`,
      scanned: page.page.length,
      creditedMembers,
      creditedCents,
      unchanged,
      noEarnings,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

async function creditOfficialWinnings(
  ctx: MutationCtx,
  args: {
    member: Doc<"members">;
    seasonId: Doc<"seasons">["_id"];
    officialEarnings: number;
    creditedEarnings: number;
    now: number;
    settlementRequestId?: Doc<"settlementRequests">["_id"];
  },
) {
  if (args.creditedEarnings > args.officialEarnings) {
    throw new Error("Recorded winnings exceed the official season earnings");
  }
  const missingCredit = args.officialEarnings - args.creditedEarnings;
  if (missingCredit === 0) return 0;

  await ctx.db.insert("transactions", {
    memberId: args.member._id,
    seasonId: args.seasonId,
    settlementRequestId: args.settlementRequestId,
    amount: missingCredit,
    transactionType: "TournamentWinnings",
    status: "completed",
    processedAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.patch(args.member._id, {
    account: args.member.account + missingCredit,
    updatedAt: args.now,
  });
  return missingCredit;
}

async function ensureOfficialWinningsCredited(
  ctx: MutationCtx,
  request: Doc<"settlementRequests">,
) {
  const officialEarnings = await getOfficialMemberSeasonEarnings(
    ctx,
    request.memberId,
    request.seasonId,
  );
  if (officialEarnings !== request.earningsCents) {
    throw new Error(
      "Official earnings changed after submission. Cancel this request and ask the member to resubmit.",
    );
  }
  const credited = await getCompletedSeasonWinningsCredit(
    ctx,
    request.memberId,
    request.seasonId,
  );
  const member = await ctx.db.get(request.memberId);
  if (!member) throw new Error("Member not found");
  await creditOfficialWinnings(ctx, {
    member,
    seasonId: request.seasonId,
    officialEarnings,
    creditedEarnings: credited,
    now: Date.now(),
    settlementRequestId: request._id,
  });
}

async function recordSettlementDebit(
  ctx: MutationCtx,
  request: Doc<"settlementRequests">,
  item: Exclude<SettlementItemKind, "nextSeasonCard">,
) {
  const amount = settlementItemAmount(request, item);
  if (amount === 0) return;
  const member = await ctx.db.get(request.memberId);
  if (!member) throw new Error("Member not found");
  if (member.account - amount < 0) {
    throw new Error("The member account no longer has enough funds");
  }
  const transactionType =
    item === "transfer"
      ? ("Withdrawal" as const)
      : item === "charity"
        ? ("CharityDonation" as const)
        : ("LeagueDonation" as const);
  const now = Date.now();
  await ctx.db.insert("transactions", {
    memberId: member._id,
    seasonId: request.seasonId,
    settlementRequestId: request._id,
    amount: -amount,
    payoutEmail: item === "transfer" ? request.payoutEmail : undefined,
    transactionType,
    status: "completed",
    processedAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(member._id, {
    account: member.account - amount,
    updatedAt: now,
  });
}

export const adminCompleteItem = mutation({
  args: {
    requestId: v.id("settlementRequests"),
    item: settlementItemValidator,
  },
  handler: async (ctx, args) => {
    const admin = await getCurrentMember(ctx);
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Settlement request not found");
    if (request.status === "cancelled") {
      throw new Error("Cancelled requests cannot be processed");
    }
    if (request.status === "completed") return request;
    if (settlementItemAmount(request, args.item) === 0) {
      throw new Error("This allocation was not requested");
    }
    if (settlementItemCompleted(request, args.item)) return request;

    await ensureOfficialWinningsCredited(ctx, request);
    if (args.item !== "nextSeasonCard") {
      await recordSettlementDebit(ctx, request, args.item);
    }

    const now = Date.now();
    const completionPatch =
      args.item === "transfer"
        ? { transferCompletedAt: now, transferCompletedBy: admin._id }
        : args.item === "charity"
          ? { charityCompletedAt: now, charityCompletedBy: admin._id }
          : args.item === "league"
            ? { leagueCompletedAt: now, leagueCompletedBy: admin._id }
            : {
                nextSeasonCardCompletedAt: now,
                nextSeasonCardCompletedBy: admin._id,
              };
    await ctx.db.patch(request._id, {
      ...completionPatch,
      status: "in_progress",
      updatedAt: now,
    });
    const updated = await ctx.db.get(request._id);
    if (!updated) throw new Error("Settlement request not found");
    if (areAllSettlementItemsComplete(updated)) {
      await ctx.db.patch(updated._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
    }
    await writeAuditLog(ctx, {
      memberId: admin._id,
      entityType: "settlementRequest",
      entityId: String(request._id),
      action: "updated",
      changes: {
        completedItem: args.item,
        amountCents: settlementItemAmount(request, args.item),
      },
    });
    await publishNotifications(ctx, {
      dedupeKey: `settlement-completed:${request._id}:${args.item}`,
      category: "financial",
      settlementRequestId: request._id,
      recipients: [
        {
          memberId: request.memberId,
          title:
            args.item === "transfer"
              ? "Your e-transfer is complete"
              : "An earnings allocation is complete",
          body:
            args.item === "transfer"
              ? "The PGC administrator confirmed your transfer."
              : `Your ${args.item === "nextSeasonCard" ? "next-season card" : args.item} allocation was confirmed.`,
          href: "/account#earnings",
        },
      ],
    });
    return await ctx.db.get(request._id);
  },
});

export const adminCancelRequest = mutation({
  args: {
    requestId: v.id("settlementRequests"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await getCurrentMember(ctx);
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Settlement request not found");
    if (request.status === "cancelled") return request;
    if (request.status !== "pending") {
      throw new Error("A request cannot be cancelled after processing starts");
    }
    const reason = args.reason.trim();
    if (reason.length < 3) throw new Error("Enter a cancellation reason");
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: admin._id,
      cancellationReason: reason.slice(0, 500),
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      memberId: admin._id,
      entityType: "settlementRequest",
      entityId: String(request._id),
      action: "deleted",
      changes: { reason: reason.slice(0, 500) },
    });
    await publishNotifications(ctx, {
      dedupeKey: `settlement-cancelled:${request._id}:${now}`,
      category: "financial",
      settlementRequestId: request._id,
      recipients: [
        {
          memberId: request.memberId,
          title: "Your earnings request was cancelled",
          body: "Open your account to review the request and submit again.",
          href: "/account#earnings",
        },
      ],
    });
    return await ctx.db.get(request._id);
  },
});
