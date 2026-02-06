import type { Doc, Id } from "../_generated/dataModel";
import type { FieldPlayer, RankedPlayer } from "./datagolf";

export type FieldPlayerWithAllTeeTimes = Omit<
  FieldPlayer,
  "r1_teetime" | "r2_teetime" | "r3_teetime" | "r4_teetime"
> & {
  r1_teetime?: string | null;
  r2_teetime?: string | null;
  r3_teetime?: string | null;
  r4_teetime?: string | null;
};

export type EnhancedGolfer = FieldPlayer & {
  ranking?: RankedPlayer;
};



export type TeamsCronGolferSnap = {
  apiId: number;
  position: string | null;
  score: number | null;
  today: number | null;
  thru: number | null;
  makeCut: number | null;
  topTen: number | null;
  win: number | null;
  roundOneTeeTime: string | null;
  roundOne: number | null;
  roundTwoTeeTime: string | null;
  roundTwo: number | null;
  roundThreeTeeTime: string | null;
  roundThree: number | null;
  roundFourTeeTime: string | null;
  roundFour: number | null;
};

export type TeamsCronTournamentSnap = {
  tournamentId: Id<"tournaments">;
  tournamentApiId: string | null;
  tournamentName: string;
  seasonId: Id<"seasons">;
  startDate: number;
  currentRound: number;
  livePlay: boolean;
  par: number;
  tierPoints: number[];
  tierPayouts: number[];
  isPlayoff: boolean;
  eventIndex: 0 | 1 | 2 | 3;
  firstPlayoffTournamentId: Id<"tournaments"> | null;
  teams: Doc<"teams">[];
  tourCards: Doc<"tourCards">[];
  golfers: TeamsCronGolferSnap[];
};

export type TeamsCronPlayoffContext =
  | {
      isPlayoff: false;
      eventIndex: 0;
      carryInByTourCardId: Record<string, number>;
    }
  | {
      isPlayoff: true;
      eventIndex: 1 | 2 | 3;
      carryInByTourCardId: Record<string, number>;
    };

export type TeamsCronUpdate = {
  teamId: Id<"teams">;
  round: 1 | 2 | 3 | 4 | 5;
  roundOne?: number;
  roundTwo?: number;
  roundThree?: number;
  roundFour?: number;
  today?: number;
  thru?: number;
  score?: number;
  position?: string;
  pastPosition?: string;
  points?: number;
  earnings?: number;
  makeCut?: number;
  topTen?: number;
  win?: number;
  roundOneTeeTime?: string;
  roundTwoTeeTime?: string;
  roundThreeTeeTime?: string;
  roundFourTeeTime?: string;
  _isCut: boolean;
};

export type CronJobName =
  | "live_tournament_sync"
  | "recompute_standings"
  | "create_groups_for_next_tournament";

export type CronRunOk = {
  ok: true;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  result: unknown;
};

export type CronRunErr = {
  ok: false;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  error: {
    message: string;
    stack?: string;
  };
};

export type BuildUsageRateByGolferApiIdTeam = {
  golferIds: number[];
};

export type BuildUsageRateByGolferApiIdOptions = {
  teams: BuildUsageRateByGolferApiIdTeam[];
};

export type GroupLimits = {
  GROUP_1: { percentage: number; maxCount: number };
  GROUP_2: { percentage: number; maxCount: number };
  GROUP_3: { percentage: number; maxCount: number };
  GROUP_4: { percentage: number; maxCount: number };
};
