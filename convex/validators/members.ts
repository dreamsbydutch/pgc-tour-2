import type { ValidateMemberDataInput } from "../types/members";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

export const membersValidators = {
  validateMemberData: (data: ValidateMemberDataInput): ValidationResult => {
    const errors: string[] = [];

    const clerkIdErr = validators.stringLength(
      data.clerkId,
      3,
      100,
      "Clerk ID",
    );
    if (clerkIdErr) errors.push(clerkIdErr);

    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push("Invalid email format");
      }
    }

    const firstnameErr = validators.stringLength(
      data.firstname,
      0,
      50,
      "First name",
    );
    if (firstnameErr) errors.push(firstnameErr);

    const lastnameErr = validators.stringLength(
      data.lastname,
      0,
      50,
      "Last name",
    );
    if (lastnameErr) errors.push(lastnameErr);

    const displayNameErr = validators.stringLength(
      data.displayName,
      0,
      100,
      "Display name",
    );
    if (displayNameErr) errors.push(displayNameErr);

    if (data.account !== undefined) {
      if (!Number.isFinite(data.account)) {
        errors.push("Account balance must be a finite number of cents");
      } else if (Math.trunc(data.account) !== data.account) {
        errors.push("Account balance must be an integer number of cents");
      }
    }

    if (data.friends && data.friends.length > 500) {
      errors.push("Too many friends (maximum 500)");
    }

    return { isValid: errors.length === 0, errors };
  },
} as const;
