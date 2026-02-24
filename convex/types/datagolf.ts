/**
 * DataGolf API Schema Types
 *
 * These types model the JSON payloads (requests/options + responses) for the
 * public DataGolf HTTP API.
 *
 * They are intentionally named with a `DataGolf*` prefix to avoid confusion
 * with Convex table document types.
 */

import { Doc } from "../_generated/dataModel";

// ========================================
// BASE TYPES
// ========================================

// ========================================
// GENERAL USE TYPES
// ========================================

export interface DataGolfPlayer {
  amateur: number;
  country: string;
  country_code: string;
  dg_id: number;
  player_name: string;
}

export interface DataGolfFieldPlayer {
  am: number;
  country: string;
  dg_id: number;
  dg_rank: number;
  owgr_rank: number;
  player_name: string;
  player_num: number;
  pre_tourn_pageviews: number;
  teetimes: {
    course_code: string;
    course_name: string;
    course_num: number;
    round_num: number;
    start_hole: number;
    teetime: number | undefined;
    wave: "early" | "late";
  }[];
  tour_rank: string;
}
export interface DataGolfFieldUpdatesResponse {
  tour: string;
  event_name: string;
  event_id: number;
  date_end: string;
  date_start: string;
  course_name: string;
  multi_course: string;
  tz_offset: number;
  current_round: number;
  field: DataGolfFieldPlayer[];
}

// ========================================
// MODEL PREDICTIONS TYPES
// ========================================

export interface DataGolfRankedPlayer {
  am: number;
  country: string;
  datagolf_rank: number;
  dg_id: number;
  dg_skill_estimate: number;
  owgr_rank: number;
  player_name: string;
  primary_tour: string;
}

export interface DataGolfRankingsResponse {
  last_updated: string;
  notes: string;
  rankings: DataGolfRankedPlayer[];
}

export type DataGolfLiveStrokesGainedView = "raw" | "relative";

type DataGolfLiveStrokesGainedRoundKey = `R${1 | 2 | 3 | 4}`;

type DataGolfLiveStrokesGainedBreakdown = {
  app: number;
  arg: number;
  ott: number;
  putt: number;
  t2g: number;
  total: number;
};

type DataGolfLiveStrokesGainedPlayer = {
  dg_id: number;
  player_name: string;
  pos: string;
  score: number;
  thru: number;
  today: number;
} & Partial<
  Record<DataGolfLiveStrokesGainedRoundKey, DataGolfLiveStrokesGainedBreakdown>
>;

export interface DataGolfLiveStrokesGainedResponse {
  current_round: number;
  event_name: string;
  last_update: string;
  strokes_gained_values: string;
  data: DataGolfLiveStrokesGainedPlayer[];
}

// ========================================
// LIVE MODEL TYPES
// ========================================

export interface DataGolfLiveModelPlayer {
  country?: string | undefined;
  current_pos: string;
  current_score: number;
  dg_id: number;
  end_hole: number;
  make_cut: number;
  player_name: string;
  round: number;
  thru: string;
  today: number;
  // DataGolf includes per-round scoring fields in the in-play feed.
  // Keep these optional to be resilient to feed changes.
  R1?: number;
  R2?: number;
  R3?: number;
  R4?: number;
  top_10: number;
  top_20: number;
  top_5: number;
  win: number;
}

export interface DataGolfLiveModelPredictionsResponse {
  info: {
    current_round: number;
    dead_heat_rules: string;
    event_name: string;
    last_update: string;
  };
  data: DataGolfLiveModelPlayer[];
}

export type DataGolfLiveTournamentStat =
  | "sg_putt"
  | "sg_arg"
  | "sg_app"
  | "sg_ott"
  | "sg_t2g"
  | "sg_bs"
  | "sg_total"
  | "distance"
  | "accuracy"
  | "gir"
  | "prox_fw"
  | "prox_rgh"
  | "scrambling"
  | "great_shots"
  | "poor_shots";

export type DataGolfLiveStatsPlayer = {
  player_name: string;
  dg_id: number;
  position: string;
  thru: number;
  today: number;
  total: number;
} & Partial<Record<DataGolfLiveTournamentStat, number>>;

export interface DataGolfLiveTournamentStatsResponse {
  course_name: string;
  event_name: string;
  last_updated: string;
  stat_display: string;
  stat_round: string;
  live_stats: DataGolfLiveStatsPlayer[];
}

// ========================================
// HISTORICAL DATA TYPES
// ========================================

export interface DataGolfHistoricalEvent {
  calendar_year: number;
  date: string;
  event_id: number;
  event_name: string;
  sg_categories: string;
  traditional_stats: string;
  tour: string;
}

interface DataGolfRoundData {
  birdies: number;
  bogies: number;
  course_name: string;
  course_num: number;
  course_par: number;
  doubles_or_worse: number;
  driving_acc?: number;
  driving_dist?: number;
  eagles_or_better: number;
  gir?: number;
  great_shots?: number;
  pars: number;
  poor_shots?: number;
  prox_fw?: number;
  prox_rgh?: number;
  score: number;
  scrambling?: number;
  sg_app?: number;
  sg_arg?: number;
  sg_ott?: number;
  sg_putt?: number;
  sg_t2g?: number;
  sg_total?: number;
  start_hole: number;
  teetime: string;
}

interface DataGolfSlimRoundData {
  score: number;
  birdies: number;
  bogies: number;
  eagles_or_better: number;
  doubles_or_worse: number;
}

export type DataGolfHistoricalRound = DataGolfRoundData | DataGolfSlimRoundData;

export interface DataGolfHistoricalPlayer {
  dg_id: number;
  fin_text: string;
  player_name: string;
  round_1?: { score: number; teetime: number | undefined; course_par: number };
  round_2?: { score: number; teetime: number | undefined; course_par: number };
  round_3?: { score: number; teetime: number | undefined; course_par: number };
  round_4?: { score: number; teetime: number | undefined; course_par: number };
}

export interface DataGolfHistoricalRoundDataResponse {
  event_name: string;
  event_id: string;
  tour: string;
  event_completed: string;
  year: number;
  season: number;
  sg_categories: string;
  scores: DataGolfHistoricalPlayer[];
}

export interface DataGolfHistoricalEventDataStat {
  dg_id: number;
  dg_points: number;
  earnings: number;
  fec_points: number;
  fin_text: string;
  player_name: string;
}

export interface DataGolfHistoricalEventDataResponse {
  event_completed: string;
  tour: string;
  season: number;
  year: number;
  event_id: string;
  event_name: string;
  event_stats: DataGolfHistoricalEventDataStat[];
}

// ========================================
// END

export type dataGolfToDataBaseTranslatorResult =
  | {
      ok: true;
      skipped: false;
      tournamentId: Doc<"tournaments">["_id"];
      eventName: string | undefined;
      currentRound: number | undefined;
      tournamentStatus: Doc<"tournaments">["status"];
      tournamentCompleted: boolean;
      golfersInserted: number;
      golfersUpdated: number;
      tournamentGolfersInserted: number;
      tournamentGolfersPatchedFromField: number;
      tournamentGolfersUpdated: number;
      livePlayers: number;
    }
  | undefined;
