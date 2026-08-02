import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import {
  projectMajorChampionBadgesByMemberId,
  projectPublicAppState,
  projectPublicTournament,
  projectPublicTournamentGolfer,
  projectViewerMember,
} from "./publicDtos";
import { CANADIAN_OPEN_BADGE_LOGO_URL } from "./tournamentBadges";

const sensitiveFields = [
  "clerkId",
  "payoutEmail",
  "espnId",
  "espnRounds",
  "espnScorecardUpdatedAt",
  "dataGolfInPlayLastUpdate",
  "liveSyncChainId",
  "liveSyncLeaseUntil",
  "groupsEmailSentAt",
  "reminderEmailSentAt",
  "updatedAt",
  "futureSensitiveField",
];

function collectKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
  return keys;
}

describe("public DTO projectors", () => {
  it("fails closed when source documents contain sensitive or future fields", () => {
    const tournament = {
      _id: "tournament",
      _creationTime: 1,
      name: "Public Event",
      startDate: 1,
      endDate: 2,
      seasonId: "season",
      tierId: "tier",
      courseId: "course",
      espnId: "espn-event",
      dataGolfInPlayLastUpdate: "private-marker",
      groupsEmailSentAt: 3,
      reminderEmailSentAt: 4,
      futureSensitiveField: "must-not-escape",
    } as unknown as Doc<"tournaments">;
    const golfer = {
      _id: "tournament-golfer",
      _creationTime: 1,
      golferId: "golfer",
      tournamentId: "tournament",
      playerName: "Player",
      espnRounds: [{ round: 1, holes: [] }],
      espnScorecardUpdatedAt: 10,
      futureSensitiveField: "must-not-escape",
    } as unknown as Doc<"tournamentGolfers">;
    const state = {
      currentSeasonId: "season",
      seasonPhase: "in-season",
      publicVersion: 1,
      liveSyncChainId: "private-chain",
      liveSyncLeaseUntil: 10,
      futureSensitiveField: "must-not-escape",
    } as unknown as Doc<"appState">;

    const keys = collectKeys({
      tournament: projectPublicTournament({ tournament }),
      golfer: projectPublicTournamentGolfer(golfer),
      state: projectPublicAppState(state),
    });
    for (const field of sensitiveFields) expect(keys.has(field)).toBe(false);
  });

  it("exposes viewer-only identity fields without leaking the Clerk subject", () => {
    const member = {
      _id: "member",
      _creationTime: 1,
      clerkId: "private-subject",
      email: "viewer@example.com",
      firstname: "Viewer",
      lastname: "Member",
      role: "regular",
      account: 100,
      friends: [],
      isActive: true,
      updatedAt: 10,
      futureSensitiveField: "must-not-escape",
    } as unknown as Doc<"members">;
    const dto = projectViewerMember(member);

    expect(dto).toMatchObject({
      _id: "member",
      email: "viewer@example.com",
      account: 100,
    });
    expect(dto).not.toHaveProperty("clerkId");
    expect(dto).not.toHaveProperty("updatedAt");
    expect(dto).not.toHaveProperty("futureSensitiveField");
  });

  it("protects the Canadian Open champion badge from tournament-logo data", () => {
    const badge = {
      _id: "badge",
      _creationTime: 1,
      seasonId: "season",
      memberId: "member",
      tournamentId: "tournament",
      tournamentName: "RBC Canadian Open",
      logoUrl: "https://example.com/canadian-open.png",
      updatedAt: 1,
    } as unknown as Doc<"majorChampionBadges">;

    expect(projectMajorChampionBadgesByMemberId([badge])).toEqual({
      member: [
        {
          tournamentId: "tournament",
          tournamentName: "RBC Canadian Open",
          logoUrl: CANADIAN_OPEN_BADGE_LOGO_URL,
        },
      ],
    });
  });
});
