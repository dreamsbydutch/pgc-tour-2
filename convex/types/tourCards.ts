import type { Doc, Id } from "../_generated/dataModel";

type TourCardMutableFields = Pick<
  Doc<"tourCards">,
  | "displayName"
  | "earnings"
  | "points"
  | "wins"
  | "topTen"
  | "topFive"
  | "madeCut"
  | "appearances"
  | "playoff"
  | "currentPosition"
>;

export type TourCardQueryOptions = {
  id?: Id<"tourCards">;
  memberId?: Id<"members">;
  clerkId?: string;
  seasonId?: Id<"seasons">;
  tourId?: Id<"tours">;
};

export type TourCardCreatePayload = TourCardMutableFields & {
  memberId?: Id<"members">;
  tourId: Id<"tours">;
  seasonId: Id<"seasons">;
};

export type TourCardUpdatePayload = Partial<TourCardMutableFields> & {
  tourId?: Id<"tours">;
};

export type TourCardWithMember = Doc<"tourCards"> & {
  member: Doc<"members">;
};
