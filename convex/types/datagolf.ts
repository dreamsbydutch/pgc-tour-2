/**
 * DataGolf API Type Definitions
 *
 * Comprehensive TypeScript interfaces for all DataGolf API endpoints,
 * options objects, and response types.
 */

// ========================================
// BASE TYPES
// ========================================

export type Tour = "pga" | "euro" | "kft" | "opp" | "alt" | "liv" | "all";
export type FileFormat = "json" | "csv";
export type OddsFormat = "percent" | "american" | "decimal" | "fraction";
export type Display = "value" | "rank";

export type SkillRatingCategoryKey =
  | "sg_putt"
  | "sg_arg"
  | "sg_app"
  | "sg_ott"
  | "sg_total"
  | "driving_acc"
  | "driving_dist";

export type YesNo = "yes" | "no";

/**
 * DataGolf commonly returns event IDs as strings in JSON.
 * Keep this flexible because some examples show numbers.
 */
export type DataGolfEventId = string | number;

// ========================================
// GENERAL USE TYPES
// ========================================

export interface PlayerListOptions {
  format?: FileFormat;
  filterByCountry?: string;
  filterByAmateur?: boolean;
  sortByName?: boolean;
  limit?: number;
  skip?: number;
}

export interface Player {
  amateur: number;
  country: string;
  country_code: string;
  dg_id: number;
  player_name: string;
}

export interface TourScheduleOptions {
  tour?: Tour;
  season?: number;
  format?: FileFormat;
  filterByLocation?: string;
  sortByDate?: boolean;
  upcomingOnly?: boolean;
  limit?: number;
  skip?: number;
}

export interface ScheduleEvent {
  country: string;
  course: string;
  course_key: string;
  event_id: DataGolfEventId;
  event_name: string;
  latitude: number;
  location: string;
  longitude: number;
  start_date: string;
  status: string;
  tour: string;
  winner: string;
}

export interface TourScheduleResponse {
  tour: string;
  season: number;
  upcoming_only: YesNo;
  schedule: ScheduleEvent[];
}

export interface FieldUpdatesOptions {
  tour?: Tour;
  format?: FileFormat;
  filterByCountry?: string;
  filterWithdrawn?: boolean;
  sortBySalary?: boolean;
  sortByName?: boolean;
  minSalary?: number;
  maxSalary?: number;
  limit?: number;
  skip?: number;
}

export interface FieldPlayer {
  am: number;
  country: string;
  dg_id: number;
  dk_id?: string;
  dk_salary?: number;
  early_late?: number;
  fd_id?: string;
  fd_salary?: number;
  flag?: string;
  pga_number?: number;
  player_name: string;
  r1_teetime?: string | null;
  r2_teetime?: string | null;
  r3_teetime?: string | null;
  r4_teetime?: string | null;
  start_hole?: number;
  unofficial?: number;
  yh_id?: string;
  yh_salary?: number;
}

export interface FieldUpdatesResponse {
  course_name: string;
  current_round: number;
  event_name: string;
  field: FieldPlayer[];
}

// ========================================
// MODEL PREDICTIONS TYPES
// ========================================

export interface DataGolfRankingsOptions {
  format?: FileFormat;
  filterByCountry?: string;
  filterByTour?: string;
  topN?: number;
  minSkillEstimate?: number;
  sortBySkill?: boolean;
  limit?: number;
  skip?: number;
}

export interface RankedPlayer {
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
  rankings: RankedPlayer[];
}

export interface PreTournamentPredictionsOptions {
  tour?: Tour;
  addPosition?: number[];
  deadHeat?: boolean;
  oddsFormat?: OddsFormat;
  format?: FileFormat;
  filterByCountry?: string;
  minWinProbability?: number;
  maxWinOdds?: number;
  sortByWinProbability?: boolean;
  model?: string;
  limit?: number;
  skip?: number;
}

export type FinishPositionKey = `top_${number}`;

export type OddsValueForFormat<F extends OddsFormat> = F extends "percent"
  ? number
  : F extends "decimal"
    ? number
    : string;

export type OddsValue = number | string;

export type PredictionPlayer<F extends OddsFormat = "percent"> = {
  am: number;
  country: string;
  dg_id: number;
  make_cut: OddsValueForFormat<F>;
  player_name: string;
  sample_size: number;
  top_10: OddsValueForFormat<F>;
  top_20: OddsValueForFormat<F>;
  top_5: OddsValueForFormat<F>;
  win: OddsValueForFormat<F>;
} & Partial<Record<FinishPositionKey, OddsValueForFormat<F>>>;

export interface PreTournamentPredictionsResponse {
  event_name: string;
  last_updated: string;
  dead_heats: string;
  models_available: string[];
  baseline: PredictionPlayer[];
  baseline_history_fit?: PredictionPlayer[];
  [key: string]: string | number | string[] | PredictionPlayer[] | undefined;
}

export type PreTournamentArchivePlayer<F extends OddsFormat = "percent"> = {
  dg_id: number;
  player_name: string;
  fin_text: string;
  win: OddsValueForFormat<F>;
  top_5?: OddsValueForFormat<F>;
  top_10?: OddsValueForFormat<F>;
  top_20?: OddsValueForFormat<F>;
  make_cut?: OddsValueForFormat<F>;
  mc?: OddsValueForFormat<F>;
  first_round_leader?: OddsValueForFormat<F>;
} & Partial<Record<FinishPositionKey, OddsValueForFormat<F>>>;

export interface PreTournamentPredictionsArchiveResponse {
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  models_available: string[];
  baseline: PreTournamentArchivePlayer[];
  baseline_history_fit?: PreTournamentArchivePlayer[];
  [key: string]:
    | string
    | number
    | string[]
    | PreTournamentArchivePlayer[]
    | undefined;
}

export interface SkillDecompositionsOptions {
  tour?: Tour;
  format?: FileFormat;
  filterByCountry?: string;
  minPrediction?: number;
  sortByPrediction?: boolean;
  includeAdjustments?: boolean;
  limit?: number;
  skip?: number;
}

export interface SkillDecompositionPlayer {
  age: number;
  age_adjustment: number;
  am: number;
  baseline_pred: number;
  country: string;
  course_experience_adjustment: number;
  course_history_adjustment: number;
  dg_id: number;
  driving_accuracy_adjustment: number;
  driving_distance_adjustment: number;
  final_pred: number;
  player_name: string;
  other_fit_adjustment: number;
  sample_size: number;
  std_deviation: number;
  strokes_gained_category_adjustment: number;
  total_course_history_adjustment: number;
  total_fit_adjustment: number;
  true_sg_adjustments: number;
}

export interface SkillDecompositionsResponse {
  course_name: string;
  event_name: string;
  last_updated: string;
  notes: string;
  players: SkillDecompositionPlayer[];
}

export interface SkillRatingsOptions {
  display?: Display;
  format?: FileFormat;
  filterByCountry?: string;
  minTotalSG?: number;
  sortByCategory?: string;
  topNInCategory?: number;
  limit?: number;
  skip?: number;
}

export interface SkillRatingPlayer {
  player_name: string;
  dg_id: number;
  sg_putt: number;
  sg_arg: number;
  sg_app: number;
  sg_ott: number;
  sg_total: number;
  driving_acc: number;
  driving_dist: number;
}

export interface SkillRatingsResponse {
  last_updated: string;
  players: SkillRatingPlayer[];
}

export interface ApproachSkillOptions {
  period?: string;
  format?: FileFormat;
  filterByCountry?: string;
  minShotCount?: number;
  sortByProximity?: boolean;
  distanceRange?: string;
  limit?: number;
  skip?: number;
}

export type ApproachSkillMetric =
  | "shot_count"
  | "low_data_indicator"
  | "sg_per_shot"
  | "proximity_per_shot"
  | "gir_rate"
  | "good_shot_rate"
  | "poor_shot_avoid_rate";

export type ApproachSkillFieldKey = `${string}_${ApproachSkillMetric}`;

export type ApproachSkillPlayer = {
  player_name: string;
  dg_id: number;
} & Partial<Record<ApproachSkillFieldKey, number>>;

export interface ApproachSkillResponse {
  time_period: string;
  last_updated: string;
  data: ApproachSkillPlayer[];
}

export type FantasySite = "draftkings" | "fanduel" | "yahoo";
export type FantasySlate =
  | "main"
  | "showdown"
  | "showdown_late"
  | "weekend"
  | "captain";

export interface FantasyProjectionOptions {
  tour?: Tour;
  site?: FantasySite;
  slate?: FantasySlate;
  format?: FileFormat;
  filterByOwnership?: {
    min?: number;
    max?: number;
  };
  sortBySalary?: boolean;
  sortByProjection?: boolean;
  minSalary?: number;
  maxSalary?: number;
  limit?: number;
  skip?: number;
}

export interface FantasyProjectionPlayer {
  player_name: string;
  dg_id: number;
  site_name_id: string;
  salary: number;
  r1_teetime: string;
  early_late_wave: number;
  proj_points: number;
  proj_ownership: number;
}

export interface FantasyProjectionResponse {
  tour: string;
  site: string;
  slate: string;
  event_name: string;
  last_updated: string;
  note: string;
  projections: FantasyProjectionPlayer[];
}

export type LiveStrokesGainedView = "raw" | "relative";

export type LiveStrokesGainedRoundKey = `R${1 | 2 | 3 | 4}`;

export type LiveStrokesGainedBreakdown = {
  app: number;
  arg: number;
  ott: number;
  putt: number;
  t2g: number;
  total: number;
};

export type LiveStrokesGainedPlayer = {
  dg_id: number;
  player_name: string;
  pos: string;
  score: number;
  thru: number;
  today: number;
} & Partial<Record<LiveStrokesGainedRoundKey, LiveStrokesGainedBreakdown>>;

export interface LiveStrokesGainedResponse {
  current_round: number;
  event_name: string;
  last_update: string;
  strokes_gained_values: string;
  data: LiveStrokesGainedPlayer[];
}

export type BettingMarketOutright =
  | "win"
  | "top_5"
  | "top_10"
  | "top_20"
  | "mc"
  | "make_cut"
  | "frl";

export type BettingMarketMatchups =
  | "tournament_matchups"
  | "round_matchups"
  | "3_balls";

export type SportsbookName =
  | "5dimes"
  | "bet365"
  | "betcris"
  | "betfair"
  | "betmgm"
  | "betonline"
  | "betway"
  | "bovada"
  | "caesars"
  | "circa"
  | "corale"
  | "draftkings"
  | "fanduel"
  | "pinnacle"
  | "skybet"
  | "sportsbook"
  | "unibet"
  | "williamhill"
  | "datagolf";

export type BettingOddsValue = number | string;

export type BettingToolOutrightOddsEntry = {
  dg_id: number;
  player_name: string;
  datagolf?: Record<string, BettingOddsValue>;
} & Partial<Record<SportsbookName, BettingOddsValue>>;

export interface BettingToolOutrightsResponse {
  event_name: string;
  last_updated: string;
  market: BettingMarketOutright;
  odds: BettingToolOutrightOddsEntry[];
}

export type ThreeWayOdds = {
  p1: BettingOddsValue;
  p2: BettingOddsValue;
  p3: BettingOddsValue;
};

export type TwoWayOdds = {
  p1: BettingOddsValue;
  p2: BettingOddsValue;
};

export type BettingToolMatchupsOdds = Partial<
  Record<SportsbookName, TwoWayOdds | ThreeWayOdds>
>;

export interface BettingToolMatchupEntry {
  odds: BettingToolMatchupsOdds;
  p1_dg_id: number;
  p1_player_name: string;
  p2_dg_id: number;
  p2_player_name: string;
  p3_dg_id?: number;
  p3_player_name?: string;
  ties: string;
}

export interface BettingToolMatchupsResponse {
  event_name: string;
  last_updated: string;
  market: BettingMarketMatchups;
  round_num?: number;
  match_list: BettingToolMatchupEntry[];
}

export interface BettingToolAllPairingsResponse {
  event_name: string;
  last_update: string;
  round: number;
  pairings: {
    course: string;
    group: number;
    p1: { dg_id: number; name: string; odds: BettingOddsValue };
    p2: { dg_id: number; name: string; odds: BettingOddsValue };
    p3: { dg_id: number; name: string; odds: BettingOddsValue };
    start_hole: number;
    teetime: string;
  }[];
}

// ========================================
// LIVE MODEL TYPES
// ========================================

export interface LiveModelPredictionsOptions {
  tour?: Tour;
  deadHeat?: boolean;
  oddsFormat?: OddsFormat;
  format?: FileFormat;
  filterByPosition?: {
    current?: string;
    maxPosition?: number;
  };
  minWinProbability?: number;
  sortByPosition?: boolean;
  onlyActivePlayers?: boolean;
  limit?: number;
  skip?: number;
}

export interface LiveModelPlayer {
  country: string;
  current_pos: string;
  current_score: number;
  dg_id: number;
  end_hole: number;
  make_cut: number;
  player_name: string;
  player_num: number;
  round: number;
  thru: string;
  today: number;
  // DataGolf includes per-round scoring fields in the in-play feed.
  // Keep these optional to be resilient to feed changes.
  R1?: number;
  R2?: number;
  R3?: number;
  R4?: number;
  top_10?: number;
  top_20: number;
  top_5: number;
  win: number;
}

export interface LiveModelPredictionsResponse {
  info: {
    current_round: number;
    dead_heat_rules: string;
    event_name: string;
    last_update: string;
  };
  data: LiveModelPlayer[];
}

export interface LiveTournamentStatsOptions {
  stats?: LiveTournamentStat[];
  round?: string;
  display?: Display;
  format?: FileFormat;
  filterByPosition?: number;
  sortByStat?: LiveTournamentStat;
  minValue?: {
    stat: LiveTournamentStat;
    value: number;
  };
  onlyCompleteRounds?: boolean;
  limit?: number;
  skip?: number;
}

export type LiveTournamentStat =
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

export type LiveStatsPlayer = {
  player_name: string;
  dg_id: number;
  position: string;
  thru: number;
  today: number;
  total: number;
} & Partial<Record<LiveTournamentStat, number>>;

export interface LiveTournamentStatsResponse {
  course_name: string;
  event_name: string;
  last_updated: string;
  stat_display: string;
  stat_round: string;
  live_stats: LiveStatsPlayer[];
}

export interface LiveHoleStatsOptions {
  tour?: Tour;
  format?: FileFormat;
  filterByHole?: number;
  filterByPar?: number;
  sortByDifficulty?: boolean;
  wave?: string;
}

export interface HoleStats {
  hole: number;
  par: number;
  yardage: number;
  total: {
    avg_score: number;
    players_thru: number;
    eagles_or_better: number;
    birdies: number;
    pars: number;
    bogeys: number;
    doubles_or_worse: number;
  };
  morning_wave: {
    avg_score: number;
    players_thru: number;
    eagles_or_better: number;
    birdies: number;
    pars: number;
    bogeys: number;
    doubles_or_worse: number;
  };
  afternoon_wave: {
    avg_score: number;
    players_thru: number;
    eagles_or_better: number;
    birdies: number;
    pars: number;
    bogeys: number;
    doubles_or_worse: number;
  };
}

export interface LiveHoleStatsResponse {
  event_name: string;
  last_update: string;
  current_round: number;
  courses: {
    course_code: string;
    rounds: {
      round_num: number;
      holes: HoleStats[];
    }[];
  }[];
}

// ========================================
// HISTORICAL DATA TYPES
// ========================================

export interface HistoricalEventListOptions {
  format?: FileFormat;
  filterByTour?: string;
  filterByYear?: number;
  onlyWithSG?: boolean;
  sortByDate?: boolean;
  limit?: number;
  skip?: number;
}

export interface HistoricalEvent {
  calendar_year: number;
  date: string;
  event_id: number;
  event_name: string;
  sg_categories: string;
  traditional_stats: string;
  tour: string;
}

export interface HistoricalRoundDataOptions {
  tour: string;
  eventId: string | number;
  year: number;
  format?: FileFormat;
  filterByPlayer?: string;
  filterByRound?: number;
  minScore?: number;
  maxScore?: number;
  sortByScore?: boolean;
  includeStats?: boolean;
  limit?: number;
  skip?: number;
}

export interface RoundData {
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

export interface SlimRoundData {
  score: number;
  birdies: number;
  bogies: number;
  eagles_or_better: number;
  doubles_or_worse: number;
}

export type HistoricalRound = RoundData | SlimRoundData;

export interface HistoricalPlayer {
  dg_id: number;
  fin_text: string;
  player_name: string;
  round_1?: HistoricalRound;
  round_2?: HistoricalRound;
  round_3?: HistoricalRound;
  round_4?: HistoricalRound;
}

export interface HistoricalRoundDataResponse {
  event_name: string;
  event_id: string;
  tour: string;
  event_completed: string;
  year: number;
  season: number;
  sg_categories: string;
  scores: HistoricalPlayer[];
}

export interface HistoricalEventDataStat {
  dg_id: number;
  dg_points: number;
  earnings: number;
  fec_points: number;
  fin_text: string;
  player_name: string;
}

export interface HistoricalEventDataResponse {
  event_completed: string;
  tour: string;
  season: number;
  year: number;
  event_id: string;
  event_name: string;
  event_stats: HistoricalEventDataStat[];
}

export type HistoricalOddsTour = "pga" | "euro" | "alt";

export interface HistoricalOddsEventListEntry {
  archived_preds: YesNo;
  calendar_year: number;
  event_id: DataGolfEventId;
  event_name: string;
  matchups: YesNo;
  outrights: YesNo;
}

export type HistoricalOddsEventListResponse = HistoricalOddsEventListEntry[];

export type HistoricalOddsMarket =
  | "win"
  | "top_5"
  | "top_10"
  | "top_20"
  | "make_cut"
  | "mc";

export interface HistoricalOddsOutrightEntry {
  bet_outcome_numeric: number;
  bet_outcome_text: string;
  close_odds: BettingOddsValue;
  close_time: string;
  dg_id: number;
  open_odds: BettingOddsValue;
  open_time: string;
  outcome: string;
  player_name: string;
}

export interface HistoricalOddsOutrightsResponse {
  book: SportsbookName;
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  market: HistoricalOddsMarket;
  season: number;
  year: number;
  odds: HistoricalOddsOutrightEntry[];
}

export interface HistoricalOddsMatchupEntry {
  bet_type: string;
  close_time: string;
  open_time: string;
  p1_close: BettingOddsValue;
  p1_dg_id: number;
  p1_open: BettingOddsValue;
  p1_outcome: number;
  p1_outcome_text: string;
  p1_player_name: string;
  p2_close: BettingOddsValue;
  p2_dg_id: number;
  p2_open: BettingOddsValue;
  p2_outcome: number;
  p2_outcome_text: string;
  p2_player_name: string;
  p3_close?: BettingOddsValue;
  p3_dg_id?: number;
  p3_open?: BettingOddsValue;
  p3_outcome?: number;
  p3_outcome_text?: string;
  p3_player_name?: string;
  tie_rule: string;
}

export interface HistoricalOddsMatchupsResponse {
  book: SportsbookName;
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  season: number;
  year: number;
  odds: HistoricalOddsMatchupEntry[];
}

export interface HistoricalDfsEventListEntry {
  calendar_year: number;
  date: string;
  event_id: DataGolfEventId;
  event_name: string;
  tour: "pga" | "euro";
  dk_ownerships: YesNo;
  dk_salaries: YesNo;
  fd_ownerships: YesNo;
  fd_salaries: YesNo;
}

export type HistoricalDfsEventListResponse = HistoricalDfsEventListEntry[];

export type HistoricalDfsSite = "draftkings" | "fanduel";

export interface HistoricalDfsPointsEntry {
  bogey_free_pts: number;
  dg_id: number;
  fin_text: string;
  finish_pts: number;
  hole_in_one_pts: number;
  hole_score_pts: number;
  player_name: string;
  salary: number;
  ownership: number;
  streak_pts: number;
  sub_70_pts: number;
  total_pts: number;
}

export interface HistoricalDfsPointsResponse {
  tour: string;
  year: number;
  season: number;
  event_name: string;
  event_id: DataGolfEventId;
  event_completed: string;
  ownerships_from: string;
  site: string;
  dfs_points: HistoricalDfsPointsEntry[];
}

// ========================================
// UTILITY TYPES
// ========================================

export interface DataProcessingOptions<T> {
  filter?: (item: T) => boolean;
  sort?: (a: T, b: T) => number;
  limit?: number;
  skip?: number;
}

export interface DataGolfErrorResponse {
  error: string;
  message: string;
  status: number;
}

// ========================================
// FUNCTION RESPONSE TYPES
// ========================================

export type DataGolfResponse<T> = T | DataGolfErrorResponse;

// Union types for all possible API responses
export type DataGolfAPIResponse =
  | Player[]
  | TourScheduleResponse
  | FieldUpdatesResponse
  | DataGolfRankingsResponse
  | PreTournamentPredictionsResponse
  | PreTournamentPredictionsArchiveResponse
  | SkillDecompositionsResponse
  | SkillRatingsResponse
  | ApproachSkillResponse
  | FantasyProjectionResponse
  | LiveModelPredictionsResponse
  | LiveStrokesGainedResponse
  | LiveTournamentStatsResponse
  | LiveHoleStatsResponse
  | HistoricalEvent[]
  | HistoricalRoundDataResponse
  | HistoricalEventDataResponse
  | BettingToolOutrightsResponse
  | BettingToolMatchupsResponse
  | BettingToolAllPairingsResponse
  | HistoricalOddsEventListResponse
  | HistoricalOddsOutrightsResponse
  | HistoricalOddsMatchupsResponse
  | HistoricalDfsEventListResponse
  | HistoricalDfsPointsResponse;
