import type { Doc } from "../_generated/dataModel";

export type ValidateTierDataInput = Partial<
  Pick<Doc<"tiers">, "name" | "payouts" | "points">
> & {
  minimumParticipants?: number;
  maximumParticipants?: number;
  description?: string;
};
