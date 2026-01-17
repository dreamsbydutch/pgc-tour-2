export type LeaderboardVariant = "regular" | "playoff" | "historical";

export type LeaderboardTourToggle = {
  id: string;
  shortForm: string;
  name: string;
  logoUrl?: string | null;
};

export type LeaderboardTournamentLite = {
  name: string;
  currentRound: number | null;
  livePlay?: boolean | null;
};

export type LeaderboardViewerContext = {
  tourCardId?: string | null;
  /** May contain member IDs and/or Clerk IDs (migration-safe). */
  friendIds?: string[] | null;
  teamGolferApiIds?: number[] | null;
};

export type LeaderboardPgaRow = {
  kind: "pga";
  id: string;
  apiId: number;

  position: string | null;
  posChange: number | null;
  playerName: string;

  score: number | null;
  today: number | null;
  thru: number | null;
  endHole: number | null;

  group: number | null;
  rating: number | null;

  roundOne: number | null;
  roundTwo: number | null;
  roundThree: number | null;
  roundFour: number | null;

  usage: number | null;
  makeCut: number | null;
  topTen: number | null;
  win: number | null;
  worldRank: number | null;

  country: string | null;

  /** Optional preformatted tee time string for the current round. */
  teeTimeDisplay?: string | null;
};

export type LeaderboardTourCardLite = {
  id: string;
  /** Team owner identity for highlighting (typically Clerk user id). */
  ownerClerkId?: string | null;
  displayName: string;
  tourId?: string | null;
  playoff?: number | null;
};

export type LeaderboardTeamRow = {
  kind: "pgc";
  id: string;

  pastPosition: string | null;
  position: string | null;

  golferApiIds: number[];

  today: number | null;
  thru: number | null;
  score: number | null;

  points: number | null;
  earnings: number | null;

  roundOne: number | null;
  roundTwo: number | null;
  roundThree: number | null;
  roundFour: number | null;

  tourCard: LeaderboardTourCardLite;

  /** Optional tiny “champion marker” data for parity (icon/count). */
  championsCount?: number | null;

  /** Optional preformatted tee time string for the current round. */
  teeTimeDisplay?: string | null;
};

export type LeaderboardViewModelReady = {
  kind: "ready";
  tournament: LeaderboardTournamentLite;
  toggleTours: LeaderboardTourToggle[];

  /** PGA rows (used both for PGA leaderboard and for team golfer dropdown tables). */
  pgaRows: LeaderboardPgaRow[];

  /** PGC team rows (filtered by activeTourId/playoff in UI). */
  pgcRows: LeaderboardTeamRow[];

  viewer?: LeaderboardViewerContext;
};

export type LeaderboardViewModelLoading = {
  kind: "loading";
};

export type LeaderboardViewModelError = {
  kind: "error";
  message: string;
};

export type LeaderboardViewModel =
  | LeaderboardViewModelLoading
  | LeaderboardViewModelError
  | LeaderboardViewModelReady;
