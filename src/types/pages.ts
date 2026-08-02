import type {
  EnhancedTournamentDoc,
  MemberDoc,
  SeasonDoc,
  TourCardDoc,
  TourDoc,
} from "convex/types/types";
import type { Doc } from "@/convex";

export type DataFreshness = "live" | "stale";

export type HomePageModel =
  | { kind: "loading" }
  | {
      kind: "failed";
      message: string;
      retry: () => void;
      isRetrying: boolean;
    }
  | {
      kind: "noSeason";
      role: string | null;
      freshness: DataFreshness;
    }
  | {
      kind: "ready";
      currentSeason: SeasonDoc;
      nextTournament: EnhancedTournamentDoc | null;
      seasonTournaments: EnhancedTournamentDoc[];
      member: MemberDoc | null;
      tours: TourDoc[];
      seasonTourCards: TourCardDoc[];
      role: string | null;
      account: number | null;
      freshness: DataFreshness;
    };

export type TournamentSearch = {
  tournamentId?: string;
  tourId?: string;
  variant?: "regular" | "playoff";
};

export type TournamentPageProps = {
  search: TournamentSearch;
  navigate: (search: TournamentSearch, options?: { replace?: boolean }) => void;
};

export type StandingsSearch = {
  season?: string;
  tour?: string;
};

export type MemberForAccount = {
  _id: Doc<"members">["_id"];
  firstname?: string | null;
  lastname?: string | null;
  account: number;
};
