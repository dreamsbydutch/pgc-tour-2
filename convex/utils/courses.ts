
/**
 * Generate display name for course
 */
export function generateDisplayName(name: string, location: string): string {
  return `${name.trim()} - ${location.trim()}`;
}

/**
 * Format par display string
 */
export function formatParDisplay(par: number): string {
  return `Par ${par}`;
}

/**
 * Format timezone display
 */
export function formatTimeZone(offset: number): string {
  const sign = offset >= 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

/**
 * Determine if course is internationally located
 */
export function isInternational(location: string): boolean {
  const usStates = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
  ];

  const locationUpper = location.toUpperCase();
  const hasUSState = usStates.some((state) => locationUpper.includes(state));
  const hasUSA =
    locationUpper.includes("USA") ||
    locationUpper.includes("U.S.A") ||
    locationUpper.includes("UNITED STATES");

  return !hasUSState && !hasUSA;
}
