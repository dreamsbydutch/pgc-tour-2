export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

export function isNonEmptyString(str: unknown): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

export function isValidGolfScore(score: unknown): score is number {
  return isNumber(score) && score >= -40 && score <= 99;
}

export function isValidHole(hole: unknown): hole is number {
  return isNumber(hole) && Number.isInteger(hole) && hole >= 1 && hole <= 18;
}

export function isValidRound(round: unknown): round is number {
  return isNumber(round) && Number.isInteger(round) && round >= 1 && round <= 4;
}

export function isValidTournamentStatus(
  status: unknown,
): status is "upcoming" | "current" | "completed" {
  return (
    status === "upcoming" || status === "current" || status === "completed"
  );
}
