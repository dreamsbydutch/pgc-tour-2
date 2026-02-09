import type { ValidateTierDataInput } from "../types/tiers";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateTierData = (data: ValidateTierDataInput): ValidationResult => {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tier name");
  if (nameErr) errors.push(nameErr);

  if (data.payouts && data.payouts.length === 0) {
    errors.push("At least one payout amount must be defined");
  }

  if (data.payouts && data.payouts.some((payout) => payout < 0)) {
    errors.push("All payout amounts must be non-negative");
  }

  if (data.points && data.points.length === 0) {
    errors.push("At least one points value must be defined");
  }

  if (data.points && data.points.some((point) => point < 0)) {
    errors.push("All points values must be non-negative");
  }

  if (
    data.payouts &&
    data.points &&
    data.payouts.length !== data.points.length
  ) {
    errors.push("Payouts and points arrays must have the same length");
  }

  if (data.minimumParticipants !== undefined && data.minimumParticipants < 1) {
    errors.push("Minimum participants must be at least 1");
  }

  if (data.maximumParticipants !== undefined && data.maximumParticipants < 1) {
    errors.push("Maximum participants must be at least 1");
  }

  if (
    data.minimumParticipants !== undefined &&
    data.maximumParticipants !== undefined &&
    data.minimumParticipants > data.maximumParticipants
  ) {
    errors.push("Minimum participants cannot exceed maximum participants");
  }

  return { isValid: errors.length === 0, errors };
};

export const tiersValidators = {
  args: {},

  validateTierData,
} as const;
