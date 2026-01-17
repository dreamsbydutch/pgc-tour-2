/**
 * HomePageListings - Constants and configuration
 */

/**
 * Maximum number of teams to display in each tour list
 */
export const MAX_TEAMS_DISPLAY = 15;

/**
 * Default view type for HomePageListings
 */
export const DEFAULT_VIEW_TYPE = "standings" as const;

/**
 * Major tournament names that qualify for championship badges
 */
export const MAJOR_TOURNAMENTS = [
  "TOUR Championship",
  "The Masters",
  "U.S. Open",
  "The Open Championship",
] as const;

/**
 * Thru values for leaderboard display
 */
export const THRU_DISPLAY = {
  NOT_STARTED: "-",
  FINISHED: "F",
  HOLES_COMPLETED: 18,
} as const;

/**
 * Default tournament scores
 */
export const DEFAULT_SCORES = {
  MISSING_SCORE: 999,
} as const;

/**
 * UI styling constants
 */
export const UI_CONSTANTS = {
  LOGO_SIZE: 512,
  TOUR_LOGO_SIZE: 128,
  DISPLAYED_LOGO_SIZE: {
    MAIN: { width: 14, height: 14 },
    TOUR: { width: 8, height: 8 },
  },
  BORDER_RADIUS: "rounded-lg",
  SHADOW: "shadow-sm",
} as const;
