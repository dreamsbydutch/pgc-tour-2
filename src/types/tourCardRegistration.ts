import type { Doc } from "@/convex";
import type {
  EnhancedTournamentDoc,
  SeasonDoc,
  TourCardDoc,
} from "convex/types/types";

export type TourRegistrationOption = {
  tour: Doc<"tours">;
  tourCards: TourCardDoc[];
  registeredCount: number;
  spotsRemaining: number;
};

export type TourCardFormProps = {
  currentSeason: SeasonDoc;
  tours: Doc<"tours">[];
  member: Doc<"members"> | null;
  seasonTourCards: TourCardDoc[];
  tournaments: EnhancedTournamentDoc[];
};

export type UseTourCardRegistrationArgs = TourCardFormProps;
