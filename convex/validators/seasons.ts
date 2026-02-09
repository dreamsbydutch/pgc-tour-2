import { TIME } from "../functions/_constants";
import type { ValidateSeasonDataInput } from "../types/seasons";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateSeasonData = (
  data: ValidateSeasonDataInput,
): ValidationResult => {
  const errors: string[] = [];

  const currentYear = new Date().getFullYear();

  const yearErr = validators.numberRange(
    data.year,
    2020,
    currentYear + 5,
    "Season year",
  );
  if (yearErr) errors.push(yearErr);

  const numberErr = validators.numberRange(data.number, 1, 10, "Season number");
  if (numberErr) errors.push(numberErr);

  if (data.startDate && data.endDate && data.startDate >= data.endDate) {
    errors.push("Season start date must be before end date");
  }

  if (
    data.registrationDeadline &&
    data.endDate &&
    data.registrationDeadline > data.endDate
  ) {
    errors.push("Registration deadline must be on or before season end date");
  }

  const now = Date.now();
  if (data.endDate && data.endDate < now - 365 * TIME.MS_PER_DAY) {
    errors.push("Season end date cannot be more than 1 year in the past");
  }

  return { isValid: errors.length === 0, errors };
};

export const seasonsValidators = {
  validateSeasonData,
} as const;
