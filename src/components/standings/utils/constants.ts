/**
 * Constants and configuration for StandingsView component
 */

/**
 * Position thresholds for different playoff tiers
 */
export const PLAYOFF_THRESHOLDS = {
  /** Maximum position for gold playoff qualification */
  GOLD_CUTOFF: 15,
  /** Maximum position for silver playoff qualification */
  SILVER_CUTOFF: 35,
} as const;

/**
 * Points thresholds and configurations
 */
export const POINTS_CONFIG = {
  /** Minimum points to be considered active */
  MIN_ACTIVE_POINTS: 0,
  /** Points display precision */
  DECIMAL_PLACES: 0,
} as const;

/**
 * Loading skeleton configuration
 */
export const LOADING_CONFIG = {
  /** Number of skeleton rows to show */
  SKELETON_ROWS: 20,
  /** Animation duration for loading states */
  ANIMATION_DURATION: 200,
} as const;

/**
 * Table column configurations
 */
export const TABLE_COLUMNS = {
  /** Column widths for different screen sizes */
  WIDTHS: {
    POSITION: "w-12",
    NAME: "flex-1",
    POINTS: "w-20",
    CHANGE: "w-16",
  },
  /** Column headers */
  HEADERS: {
    POSITION: "Pos",
    NAME: "Name",
    POINTS: "Points",
    CHANGE: "Change",
  },
} as const;

/**
 * CSS classes for different standings states
 */
export const STANDINGS_CLASSES = {
  /** Gold playoff qualification styling */
  GOLD_QUALIFIED: "bg-yellow-50 border-yellow-200",
  /** Silver playoff qualification styling */
  SILVER_QUALIFIED: "bg-gray-50 border-gray-200",
  /** Current user row styling */
  CURRENT_USER: "bg-blue-50 font-semibold border-blue-200",
  /** Friend row styling */
  FRIEND: "bg-green-50 border-green-200",
  /** Bumped into playoffs styling */
  BUMPED: "bg-orange-50 border-orange-200",
} as const;

/**
 * Position change styling
 */
export const POSITION_CHANGE_CLASSES = {
  /** Improvement in position */
  IMPROVEMENT: "text-green-600",
  /** Decline in position */
  DECLINE: "text-red-600",
  /** No change in position */
  NEUTRAL: "text-gray-500",
} as const;

/**
 * Tour display configurations
 */
export const TOUR_CONFIG = {
  /** Default tour to show if none specified */
  DEFAULT_TOUR_TIER: 1,
  /** Maximum number of tours to display in toggle */
  MAX_TOURS_DISPLAY: 10,
} as const;

/**
 * Friend management configurations
 */
export const FRIEND_CONFIG = {
  /** Maximum number of friends allowed */
  MAX_FRIENDS: 50,
  /** Debounce delay for friend operations */
  OPERATION_DELAY: 300,
} as const;

/**
 * Animation configurations
 */
export const ANIMATION_CONFIG = {
  /** Fade in duration */
  FADE_IN: "duration-200",
  /** Slide in duration */
  SLIDE_IN: "duration-300",
  /** Hover transition */
  HOVER: "transition-colors duration-150",
} as const;

/**
 * Responsive design breakpoints
 */
export const BREAKPOINTS = {
  /** Mobile breakpoint */
  MOBILE: 640,
  /** Tablet breakpoint */
  TABLET: 768,
  /** Desktop breakpoint */
  DESKTOP: 1024,
} as const;
