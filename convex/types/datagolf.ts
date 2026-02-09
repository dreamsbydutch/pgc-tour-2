/**
 * DataGolf API Schema Types
 *
 * These types model the JSON payloads (requests/options + responses) for the
 * public DataGolf HTTP API.
 *
 * They are intentionally named with a `DataGolf*` prefix to avoid confusion
 * with Convex table document types.
 */

// ========================================
// BASE TYPES
// ========================================

export type DataGolfTour =
  | "pga"
  | "euro"
  | "kft"
  | "opp"
  | "alt"
  | "liv"
  | "all";
export type DataGolfFileFormat = "json" | "csv";
export type DataGolfOddsFormat = "percent" | "american" | "decimal" | "fraction";
export type DataGolfDisplay = "value" | "rank";

export type DataGolfSkillRatingCategoryKey =
  | "sg_putt"
  | "sg_arg"
  | "sg_app"
  | "sg_ott"
  | "sg_total"
  | "driving_acc"
  | "driving_dist";

export type DataGolfYesNo = "yes" | "no";

/**
 * DataGolf commonly returns event IDs as strings in JSON.
 * Keep this flexible because some examples show numbers.
 */
export type DataGolfEventId = string | number;

// ========================================
// GENERAL USE TYPES
// ========================================

export interface DataGolfPlayerListOptions {
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  filterByAmateur?: boolean;
  sortByName?: boolean;
  limit?: number;
  skip?: number;
}

export interface DataGolfPlayer {
  amateur: number;
  country: string;
  country_code: string;
  dg_id: number;
  player_name: string;
}

export interface DataGolfTourScheduleOptions {
  tour?: DataGolfTour;
  season?: number;
  format?: DataGolfFileFormat;
  filterByLocation?: string;
  sortByDate?: boolean;
  upcomingOnly?: boolean;
  limit?: number;
  skip?: number;
}

export interface DataGolfScheduleEvent {
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

export interface DataGolfTourScheduleResponse {
  tour: string;
  season: number;
  upcoming_only: DataGolfYesNo;
  schedule: DataGolfScheduleEvent[];
}

export interface DataGolfFieldUpdatesOptions {
  tour?: DataGolfTour;
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  filterWithdrawn?: boolean;
  sortBySalary?: boolean;
  sortByName?: boolean;
  minSalary?: number;
  maxSalary?: number;
  limit?: number;
  skip?: number;
}

export interface DataGolfFieldPlayer {
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

export interface DataGolfFieldUpdatesResponse {
  course_name: string;
  current_round: number;
  event_name: string;
  field: DataGolfFieldPlayer[];
}

// ========================================
// MODEL PREDICTIONS TYPES
// ========================================

export interface DataGolfRankingsOptions {
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  filterByTour?: string;
  topN?: number;
  minSkillEstimate?: number;
  sortBySkill?: boolean;
  limit?: number;
  skip?: number;
}

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

export interface DataGolfPreTournamentPredictionsOptions {
  tour?: DataGolfTour;
  addPosition?: number[];
  deadHeat?: boolean;
  oddsFormat?: DataGolfOddsFormat;
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  minWinProbability?: number;
  maxWinOdds?: number;
  sortByWinProbability?: boolean;
  model?: string;
  limit?: number;
  skip?: number;
}

export type DataGolfFinishPositionKey = `top_${number}`;

export type DataGolfOddsValueForFormat<F extends DataGolfOddsFormat> =
  F extends "percent"
  ? number
  : F extends "decimal"
    ? number
    : string;

export type DataGolfOddsValue = number | string;

export type DataGolfPredictionPlayer<F extends DataGolfOddsFormat = "percent"> = {
  am: number;
  country: string;
  dg_id: number;
  make_cut: DataGolfOddsValueForFormat<F>;
  player_name: string;
  sample_size: number;
  top_10: DataGolfOddsValueForFormat<F>;
  top_20: DataGolfOddsValueForFormat<F>;
  top_5: DataGolfOddsValueForFormat<F>;
  win: DataGolfOddsValueForFormat<F>;
} & Partial<Record<DataGolfFinishPositionKey, DataGolfOddsValueForFormat<F>>>;

export interface DataGolfPreTournamentPredictionsResponse {
  event_name: string;
  last_updated: string;
  dead_heats: string;
  models_available: string[];
  baseline: DataGolfPredictionPlayer[];
  baseline_history_fit?: DataGolfPredictionPlayer[];
  [key: string]:
    | string
    | number
    | string[]
    | DataGolfPredictionPlayer[]
    | undefined;
}

export type DataGolfPreTournamentArchivePlayer<
  F extends DataGolfOddsFormat = "percent",
> = {
  dg_id: number;
  player_name: string;
  fin_text: string;
  win: DataGolfOddsValueForFormat<F>;
  top_5?: DataGolfOddsValueForFormat<F>;
  top_10?: DataGolfOddsValueForFormat<F>;
  top_20?: DataGolfOddsValueForFormat<F>;
  make_cut?: DataGolfOddsValueForFormat<F>;
  mc?: DataGolfOddsValueForFormat<F>;
  first_round_leader?: DataGolfOddsValueForFormat<F>;
} & Partial<Record<DataGolfFinishPositionKey, DataGolfOddsValueForFormat<F>>>;

export interface DataGolfPreTournamentPredictionsArchiveResponse {
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  models_available: string[];
  baseline: DataGolfPreTournamentArchivePlayer[];
  baseline_history_fit?: DataGolfPreTournamentArchivePlayer[];
  [key: string]:
    | string
    | number
    | string[]
    | DataGolfPreTournamentArchivePlayer[]
    | undefined;
}

export interface DataGolfSkillDecompositionsOptions {
  tour?: DataGolfTour;
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  minPrediction?: number;
  sortByPrediction?: boolean;
  includeAdjustments?: boolean;
  limit?: number;
  skip?: number;
}

export interface DataGolfSkillDecompositionPlayer {
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

export interface DataGolfSkillDecompositionsResponse {
  course_name: string;
  event_name: string;
  last_updated: string;
  notes: string;
  players: DataGolfSkillDecompositionPlayer[];
}

export interface DataGolfSkillRatingsOptions {
  display?: DataGolfDisplay;
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  minTotalSG?: number;
  sortByCategory?: string;
  topNInCategory?: number;
  limit?: number;
  skip?: number;
}

export interface DataGolfSkillRatingPlayer {
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

export interface DataGolfSkillRatingsResponse {
  last_updated: string;
  players: DataGolfSkillRatingPlayer[];
}

export interface DataGolfApproachSkillOptions {
  period?: string;
  format?: DataGolfFileFormat;
  filterByCountry?: string;
  minShotCount?: number;
  sortByProximity?: boolean;
  distanceRange?: string;
  limit?: number;
  skip?: number;
}

export type DataGolfApproachSkillMetric =
  | "shot_count"
  | "low_data_indicator"
  | "sg_per_shot"
  | "proximity_per_shot"
  | "gir_rate"
  | "good_shot_rate"
  | "poor_shot_avoid_rate";

export type DataGolfApproachSkillFieldKey =
  `${string}_${DataGolfApproachSkillMetric}`;

export type DataGolfApproachSkillPlayer = {
  player_name: string;
  dg_id: number;
} & Partial<Record<DataGolfApproachSkillFieldKey, number>>;

export interface DataGolfApproachSkillResponse {
  time_period: string;
  last_updated: string;
  data: DataGolfApproachSkillPlayer[];
}

export type DataGolfFantasySite = "draftkings" | "fanduel" | "yahoo";
export type DataGolfFantasySlate =
  | "main"
  | "showdown"
  | "showdown_late"
  | "weekend"
  | "captain";

export interface DataGolfFantasyProjectionOptions {
  tour?: DataGolfTour;
  site?: DataGolfFantasySite;
  slate?: DataGolfFantasySlate;
  format?: DataGolfFileFormat;
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

export interface DataGolfFantasyProjectionPlayer {
  player_name: string;
  dg_id: number;
  site_name_id: string;
  salary: number;
  r1_teetime: string;
  early_late_wave: number;
  proj_points: number;
  proj_ownership: number;
}

export interface DataGolfFantasyProjectionResponse {
  tour: string;
  site: string;
  slate: string;
  event_name: string;
  last_updated: string;
  note: string;
  projections: DataGolfFantasyProjectionPlayer[];
}

export type DataGolfLiveStrokesGainedView = "raw" | "relative";

export type DataGolfLiveStrokesGainedRoundKey = `R${1 | 2 | 3 | 4}`;

export type DataGolfLiveStrokesGainedBreakdown = {
  app: number;
  arg: number;
  ott: number;
  putt: number;
  t2g: number;
  total: number;
};

export type DataGolfLiveStrokesGainedPlayer = {
  dg_id: number;
  player_name: string;
  pos: string;
  score: number;
  thru: number;
  today: number;
} &
  Partial<
    Record<DataGolfLiveStrokesGainedRoundKey, DataGolfLiveStrokesGainedBreakdown>
  >;

export interface DataGolfLiveStrokesGainedResponse {
  current_round: number;
  event_name: string;
  last_update: string;
  strokes_gained_values: string;
  data: DataGolfLiveStrokesGainedPlayer[];
}

export type DataGolfBettingMarketOutright =
  | "win"
  | "top_5"
  | "top_10"
  | "top_20"
  | "mc"
  | "make_cut"
  | "frl";

export type DataGolfBettingMarketMatchups =
  | "tournament_matchups"
  | "round_matchups"
  | "3_balls";

export type DataGolfSportsbookName =
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

export type DataGolfBettingOddsValue = number | string;

export type DataGolfBettingToolOutrightOddsEntry = {
  dg_id: number;
  player_name: string;
  datagolf?: Record<string, DataGolfBettingOddsValue>;
} & Partial<Record<DataGolfSportsbookName, DataGolfBettingOddsValue>>;

export interface DataGolfBettingToolOutrightsResponse {
  event_name: string;
  last_updated: string;
  market: DataGolfBettingMarketOutright;
  odds: DataGolfBettingToolOutrightOddsEntry[];
}

export type DataGolfThreeWayOdds = {
  p1: DataGolfBettingOddsValue;
  p2: DataGolfBettingOddsValue;
  p3: DataGolfBettingOddsValue;
};

export type DataGolfTwoWayOdds = {
  p1: DataGolfBettingOddsValue;
  p2: DataGolfBettingOddsValue;
};

export type DataGolfBettingToolMatchupsOdds = Partial<
  Record<DataGolfSportsbookName, DataGolfTwoWayOdds | DataGolfThreeWayOdds>
>;

export interface DataGolfBettingToolMatchupEntry {
  odds: DataGolfBettingToolMatchupsOdds;
  p1_dg_id: number;
  p1_player_name: string;
  p2_dg_id: number;
  p2_player_name: string;
  p3_dg_id?: number;
  p3_player_name?: string;
  ties: string;
}

export interface DataGolfBettingToolMatchupsResponse {
  event_name: string;
  last_updated: string;
  market: DataGolfBettingMarketMatchups;
  round_num?: number;
  match_list: DataGolfBettingToolMatchupEntry[];
}

export interface DataGolfBettingToolAllPairingsResponse {
  event_name: string;
  last_update: string;
  round: number;
  pairings: {
    course: string;
    group: number;
    p1: { dg_id: number; name: string; odds: DataGolfBettingOddsValue };
    p2: { dg_id: number; name: string; odds: DataGolfBettingOddsValue };
    p3: { dg_id: number; name: string; odds: DataGolfBettingOddsValue };
    start_hole: number;
    teetime: string;
  }[];
}

// ========================================
// LIVE MODEL TYPES
// ========================================

export interface DataGolfLiveModelPredictionsOptions {
  tour?: DataGolfTour;
  deadHeat?: boolean;
  oddsFormat?: DataGolfOddsFormat;
  format?: DataGolfFileFormat;
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
  top_10?: number;
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

export interface DataGolfLiveTournamentStatsOptions {
  stats?: DataGolfLiveTournamentStat[];
  round?: string;
  display?: DataGolfDisplay;
  format?: DataGolfFileFormat;
  filterByPosition?: number;
  sortByStat?: DataGolfLiveTournamentStat;
  minValue?: {
    stat: DataGolfLiveTournamentStat;
    value: number;
  };
  onlyCompleteRounds?: boolean;
  limit?: number;
  skip?: number;
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

export interface DataGolfLiveHoleStatsOptions {
  tour?: DataGolfTour;
  format?: DataGolfFileFormat;
  filterByHole?: number;
  filterByPar?: number;
  sortByDifficulty?: boolean;
  wave?: string;
}

export interface DataGolfHoleStats {
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

export interface DataGolfLiveHoleStatsResponse {
  event_name: string;
  last_update: string;
  current_round: number;
  courses: {
    course_code: string;
    rounds: {
      round_num: number;
      holes: DataGolfHoleStats[];
    }[];
  }[];
}

// ========================================
// HISTORICAL DATA TYPES
// ========================================

export interface DataGolfHistoricalEventListOptions {
  format?: DataGolfFileFormat;
  filterByTour?: string;
  filterByYear?: number;
  onlyWithSG?: boolean;
  sortByDate?: boolean;
  limit?: number;
  skip?: number;
}

export interface DataGolfHistoricalEvent {
  calendar_year: number;
  date: string;
  event_id: number;
  event_name: string;
  sg_categories: string;
  traditional_stats: string;
  tour: string;
}

export interface DataGolfHistoricalRoundDataOptions {
  tour: string;
  eventId: string | number;
  year: number;
  format?: DataGolfFileFormat;
  filterByPlayer?: string;
  filterByRound?: number;
  minScore?: number;
  maxScore?: number;
  sortByScore?: boolean;
  includeStats?: boolean;
  limit?: number;
  skip?: number;
}

export interface DataGolfRoundData {
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

export interface DataGolfSlimRoundData {
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
  round_1?: DataGolfHistoricalRound;
  round_2?: DataGolfHistoricalRound;
  round_3?: DataGolfHistoricalRound;
  round_4?: DataGolfHistoricalRound;
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

export type DataGolfHistoricalOddsTour = "pga" | "euro" | "alt";

export interface DataGolfHistoricalOddsEventListEntry {
  archived_preds: DataGolfYesNo;
  calendar_year: number;
  event_id: DataGolfEventId;
  event_name: string;
  matchups: DataGolfYesNo;
  outrights: DataGolfYesNo;
}

export type DataGolfHistoricalOddsEventListResponse =
  DataGolfHistoricalOddsEventListEntry[];

export type DataGolfHistoricalOddsMarket =
  | "win"
  | "top_5"
  | "top_10"
  | "top_20"
  | "make_cut"
  | "mc";

export interface DataGolfHistoricalOddsOutrightEntry {
  bet_outcome_numeric: number;
  bet_outcome_text: string;
  close_odds: DataGolfBettingOddsValue;
  close_time: string;
  dg_id: number;
  open_odds: DataGolfBettingOddsValue;
  open_time: string;
  outcome: string;
  player_name: string;
}

export interface DataGolfHistoricalOddsOutrightsResponse {
  book: DataGolfSportsbookName;
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  market: DataGolfHistoricalOddsMarket;
  season: number;
  year: number;
  odds: DataGolfHistoricalOddsOutrightEntry[];
}

export interface DataGolfHistoricalOddsMatchupEntry {
  bet_type: string;
  close_time: string;
  open_time: string;
  p1_close: DataGolfBettingOddsValue;
  p1_dg_id: number;
  p1_open: DataGolfBettingOddsValue;
  p1_outcome: number;
  p1_outcome_text: string;
  p1_player_name: string;
  p2_close: DataGolfBettingOddsValue;
  p2_dg_id: number;
  p2_open: DataGolfBettingOddsValue;
  p2_outcome: number;
  p2_outcome_text: string;
  p2_player_name: string;
  p3_close?: DataGolfBettingOddsValue;
  p3_dg_id?: number;
  p3_open?: DataGolfBettingOddsValue;
  p3_outcome?: number;
  p3_outcome_text?: string;
  p3_player_name?: string;
  tie_rule: string;
}

export interface DataGolfHistoricalOddsMatchupsResponse {
  book: DataGolfSportsbookName;
  event_completed: string;
  event_id: DataGolfEventId;
  event_name: string;
  season: number;
  year: number;
  odds: DataGolfHistoricalOddsMatchupEntry[];
}

export interface DataGolfHistoricalDfsEventListEntry {
  calendar_year: number;
  date: string;
  event_id: DataGolfEventId;
  event_name: string;
  tour: "pga" | "euro";
  dk_ownerships: DataGolfYesNo;
  dk_salaries: DataGolfYesNo;
  fd_ownerships: DataGolfYesNo;
  fd_salaries: DataGolfYesNo;
}

export type DataGolfHistoricalDfsEventListResponse =
  DataGolfHistoricalDfsEventListEntry[];

export type DataGolfHistoricalDfsSite = "draftkings" | "fanduel";

export interface DataGolfHistoricalDfsPointsEntry {
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

export interface DataGolfHistoricalDfsPointsResponse {
  tour: string;
  year: number;
  season: number;
  event_name: string;
  event_id: DataGolfEventId;
  event_completed: string;
  ownerships_from: string;
  site: string;
  dfs_points: DataGolfHistoricalDfsPointsEntry[];
}

// ========================================
// END
