import { v } from "convex/values";
import type { ValidateMemberDataInput } from "../types/members";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

export const membersValidators = {
  args: {
    createMembers: {
      data: v.object({
        clerkId: v.string(),
        email: v.string(),
        firstname: v.optional(v.string()),
        lastname: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        role: v.optional(
          v.union(
            v.literal("admin"),
            v.literal("moderator"),
            v.literal("regular"),
          ),
        ),
        account: v.optional(v.number()),
        friends: v.optional(v.array(v.union(v.string(), v.id("members")))),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          initialBalance: v.optional(v.number()),
          recordLogin: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeFriends: v.optional(v.boolean()),
        }),
      ),
    },
    getMembers: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("members")),
          ids: v.optional(v.array(v.id("members"))),
          clerkId: v.optional(v.string()),
          filter: v.optional(
            v.object({
              clerkId: v.optional(v.string()),
              email: v.optional(v.string()),
              role: v.optional(
                v.union(
                  v.literal("admin"),
                  v.literal("moderator"),
                  v.literal("regular"),
                ),
              ),
              hasBalance: v.optional(v.boolean()),
              minBalance: v.optional(v.number()),
              maxBalance: v.optional(v.number()),
              hasFriends: v.optional(v.boolean()),
              isOnline: v.optional(v.boolean()),
              joinedAfter: v.optional(v.number()),
              joinedBefore: v.optional(v.number()),
              lastLoginAfter: v.optional(v.number()),
              lastLoginBefore: v.optional(v.number()),
              searchTerm: v.optional(v.string()),
              createdAfter: v.optional(v.number()),
              createdBefore: v.optional(v.number()),
              updatedAfter: v.optional(v.number()),
              updatedBefore: v.optional(v.number()),
            }),
          ),
          sort: v.optional(
            v.object({
              sortBy: v.optional(
                v.union(
                  v.literal("firstname"),
                  v.literal("lastname"),
                  v.literal("email"),
                  v.literal("account"),
                  v.literal("role"),
                  v.literal("createdAt"),
                  v.literal("updatedAt"),
                  v.literal("lastLoginAt"),
                ),
              ),
              sortOrder: v.optional(
                v.union(v.literal("asc"), v.literal("desc")),
              ),
            }),
          ),
          pagination: v.optional(
            v.object({
              limit: v.optional(v.number()),
              offset: v.optional(v.number()),
            }),
          ),
          enhance: v.optional(
            v.object({
              includeFriends: v.optional(v.boolean()),
              includeTransactions: v.optional(v.boolean()),
              includeTourCards: v.optional(v.boolean()),
              includeTeams: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          adminOnly: v.optional(v.boolean()),
          onlineOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },
    ensureMemberForCurrentClerkUser: {
      clerkId: v.string(),
      profile: v.object({
        email: v.string(),
        firstname: v.optional(v.string()),
        lastname: v.optional(v.string()),
      }),
    },
    adminLinkMemberToClerkUser: {
      adminClerkId: v.optional(v.string()),
      memberId: v.id("members"),
      clerkId: v.string(),
    },
    adminCreateMemberForClerkUser: {
      adminClerkId: v.optional(v.string()),
      clerkId: v.string(),
      email: v.string(),
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
    },
    getMembersPage: {
      paginationOpts: v.object({
        numItems: v.number(),
        cursor: v.union(v.string(), v.null()),
        id: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          filter: v.optional(
            v.object({
              clerkId: v.optional(v.string()),
              email: v.optional(v.string()),
              role: v.optional(
                v.union(
                  v.literal("admin"),
                  v.literal("moderator"),
                  v.literal("regular"),
                ),
              ),
              searchTerm: v.optional(v.string()),
            }),
          ),
        }),
      ),
    },
    listMembersForClerkLinking: {
      cursor: v.optional(v.string()),
      numItems: v.optional(v.number()),
    },
    updateMembers: {
      clerkId: v.optional(v.string()),
      memberId: v.id("members"),
      data: v.object({
        email: v.optional(v.string()),
        firstname: v.optional(v.string()),
        lastname: v.optional(v.string()),
        displayName: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        role: v.optional(
          v.union(
            v.literal("admin"),
            v.literal("moderator"),
            v.literal("regular"),
          ),
        ),
        account: v.optional(v.number()),
        friends: v.optional(v.array(v.union(v.string(), v.id("members")))),
        lastLoginAt: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          recordLogin: v.optional(v.boolean()),
          autoUpdateDisplayName: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeFriends: v.optional(v.boolean()),
          includeTourCards: v.optional(v.boolean()),
          includeTeams: v.optional(v.boolean()),
        }),
      ),
    },
    getMyTournamentHistory: {
      options: v.optional(
        v.object({
          limit: v.optional(v.number()),
        }),
      ),
    },
    recomputeMemberActiveFlags: {},
    normalizeMemberNamesAndTourCardDisplayNames: {
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
          limit: v.optional(v.number()),
        }),
      ),
    },
    deleteMembers: {
      adminClerkId: v.optional(v.string()),
      memberId: v.id("members"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          cascadeDelete: v.optional(v.boolean()),
          transferToMember: v.optional(v.id("members")),
          removeFriendships: v.optional(v.boolean()),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
    adminGetMemberMergePreview: {
      sourceMemberId: v.id("members"),
      targetMemberId: v.optional(v.id("members")),
    },
    adminMergeMembers: {
      sourceMemberId: v.id("members"),
      targetMemberId: v.id("members"),
      options: v.optional(
        v.object({
          overwriteTargetClerkId: v.optional(v.boolean()),
        }),
      ),
    },
    listClerkUsers: {
      clerkId: v.optional(v.string()),
      options: v.optional(
        v.object({
          limit: v.optional(v.number()),
          offset: v.optional(v.number()),
        }),
      ),
    },
  },
  validateMemberData: (data: ValidateMemberDataInput): ValidationResult => {
    const errors: string[] = [];

    const clerkIdErr = validators.stringLength(
      data.clerkId,
      3,
      100,
      "Clerk ID",
    );
    if (clerkIdErr) errors.push(clerkIdErr);

    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push("Invalid email format");
      }
    }

    const firstnameErr = validators.stringLength(
      data.firstname,
      0,
      50,
      "First name",
    );
    if (firstnameErr) errors.push(firstnameErr);

    const lastnameErr = validators.stringLength(
      data.lastname,
      0,
      50,
      "Last name",
    );
    if (lastnameErr) errors.push(lastnameErr);

    const displayNameErr = validators.stringLength(
      data.displayName,
      0,
      100,
      "Display name",
    );
    if (displayNameErr) errors.push(displayNameErr);

    if (data.account !== undefined) {
      if (!Number.isFinite(data.account)) {
        errors.push("Account balance must be a finite number of cents");
      } else if (Math.trunc(data.account) !== data.account) {
        errors.push("Account balance must be an integer number of cents");
      }
    }

    if (data.friends && data.friends.length > 500) {
      errors.push("Too many friends (maximum 500)");
    }

    return { isValid: errors.length === 0, errors };
  },
} as const;
