import type { Doc } from "@/convex";
import type { TourCardDoc } from "convex/types/types";

export type TourRegistrationOption = {
  tour: Doc<"tours">;
  tourCards: TourCardDoc[];
  registeredCount: number;
  spotsRemaining: number;
};
