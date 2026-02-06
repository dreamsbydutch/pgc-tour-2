import { v } from "convex/values";
import type { ValidateCourseDataInput } from "../types/courses";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateCourseData = (
  data: ValidateCourseDataInput,
): ValidationResult => {
  const errors: string[] = [];

  if (data.apiId && data.apiId.trim().length === 0) {
    errors.push("API ID cannot be empty");
  }

  const nameErr = validators.stringLength(data.name, 2, 200, "Course name");
  if (nameErr) errors.push(nameErr);

  const locationErr = validators.stringLength(
    data.location,
    2,
    200,
    "Location",
  );
  if (locationErr) errors.push(locationErr);

  const parErr = validators.numberRange(data.par, 54, 90, "Par");
  if (parErr) errors.push(parErr);

  const frontErr = validators.numberRange(data.front, 27, 45, "Front 9 par");
  if (frontErr) errors.push(frontErr);

  const backErr = validators.numberRange(data.back, 27, 45, "Back 9 par");
  if (backErr) errors.push(backErr);

  if (
    data.front !== undefined &&
    data.back !== undefined &&
    data.par !== undefined
  ) {
    if (data.front + data.back !== data.par) {
      errors.push("Front 9 par + Back 9 par must equal total par");
    }
  }

  const timeZoneErr = validators.numberRange(
    data.timeZoneOffset,
    -12,
    14,
    "Time zone offset",
  );
  if (timeZoneErr) errors.push(timeZoneErr);

  return { isValid: errors.length === 0, errors };
};

export const coursesValidators = {
  args: {
    createCourses: {
      clerkId: v.optional(v.string()),
      data: v.object({
        apiId: v.string(),
        name: v.string(),
        location: v.string(),
        par: v.number(),
        front: v.number(),
        back: v.number(),
        timeZoneOffset: v.number(),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
        }),
      ),
    },

    getCourses: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("courses")),
          ids: v.optional(v.array(v.id("courses"))),
          filter: v.optional(
            v.object({
              apiId: v.optional(v.string()),
              name: v.optional(v.string()),
              location: v.optional(v.string()),
              minPar: v.optional(v.number()),
              maxPar: v.optional(v.number()),
              searchTerm: v.optional(v.string()),
              createdAfter: v.optional(v.number()),
              createdBefore: v.optional(v.number()),
              updatedAfter: v.optional(v.number()),
              updatedBefore: v.optional(v.number()),
            }),
          ),
          sort: v.optional(
            v.object({
              sortBy: v.optional(
                v.union(
                  v.literal("name"),
                  v.literal("location"),
                  v.literal("par"),
                  v.literal("createdAt"),
                  v.literal("updatedAt"),
                ),
              ),
              sortOrder: v.optional(
                v.union(v.literal("asc"), v.literal("desc")),
              ),
            }),
          ),
          pagination: v.optional(
            v.object({
              limit: v.optional(v.number()),
              offset: v.optional(v.number()),
            }),
          ),
          enhance: v.optional(
            v.object({
              includeTournaments: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
              includeTotals: v.optional(v.boolean()),
            }),
          ),
          championshipOnly: v.optional(v.boolean()),
          internationalOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },

    getCourseByApiId: {
      apiId: v.string(),
    },

    getCoursesByLocation: {
      location: v.string(),
    },

    updateCourses: {
      clerkId: v.optional(v.string()),
      courseId: v.id("courses"),
      data: v.object({
        apiId: v.optional(v.string()),
        name: v.optional(v.string()),
        location: v.optional(v.string()),
        par: v.optional(v.number()),
        front: v.optional(v.number()),
        back: v.optional(v.number()),
        timeZoneOffset: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
        }),
      ),
    },

    deleteCourses: {
      clerkId: v.optional(v.string()),
      courseId: v.id("courses"),
      options: v.optional(
        v.object({
          cascadeDelete: v.optional(v.boolean()),
          replacementCourseId: v.optional(v.id("courses")),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },

  validateCourseData,
} as const;
