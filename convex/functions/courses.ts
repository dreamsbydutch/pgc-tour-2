/**
 * Course Management
 *
 * Simple CRUD operations for the `courses` table.
 * These functions support common options (validation, enhancement, pagination) while keeping
 * a single entry point per operation.
 */

import { GenericId, v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { processData } from "../utils/batchProcess";
import { requireAdmin } from "../utils/auth";
import {
  formatParDisplay,
  formatTimeZone,
  generateDisplayName,
  isInternational,
} from "../utils/courses";
import type {
  DeleteResponse,
  CourseDoc,
  ValidationResult,
} from "../types/types";
import { Doc } from "../_generated/dataModel";
import { validators } from "../validators/common";
import { applyFilters, getSortFunction } from "../utils/members";
import { GenericQueryCtx } from "convex/server";

/**
 * Creates a new course.
 *
 * Access:
 * - Requires admin.
 *
 * Behavior:
 * - Enforces `apiId` uniqueness.
 * - Runs schema-level validation unless `options.skipValidation` is true.
 * - Optionally returns an enhanced course view when `options.returnEnhanced` is true.
 */
export const createCourses = mutation({
  args: {
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};

    const apiId = args.data.apiId.trim();
    const name = args.data.name.trim();
    const location = args.data.location.trim();

    if (!apiId || !name || !location) {
      throw new Error("Course apiId, name, and location are required");
    }

    if (!options.skipValidation) {
      const validation = validateCourseData({
        ...args.data,
        apiId,
        name,
        location,
      });
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }
    const existingByApiId = await ctx.db
      .query("courses")
      .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
      .first();

    if (existingByApiId) {
      throw new Error(`Course with API ID "${apiId}" already exists`);
    }
    const courseId = await ctx.db.insert("courses", {
      apiId,
      name,
      location,
      par: args.data.par,
      front: args.data.front,
      back: args.data.back,
      timeZoneOffset: args.data.timeZoneOffset,
      updatedAt: Date.now(),
    });

    const course = await ctx.db.get(courseId);
    if (!course) {
      throw new Error("Failed to create course");
    }
    return course;
  },
});

/**
 * Reads courses.
 *
 * Behavior:
 * - If `options.id` is provided, returns a single course (or null).
 * - If `options.ids` is provided, returns all found courses in the provided order.
 * - Otherwise returns a list with optional filter/sort/pagination.
 * - Enhancement and analytics are optional and driven by `options.enhance` / `options.includeAnalytics`.
 */
export const getCourses = query({
  args: {
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
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
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
          }),
        ),
        championshipOnly: v.optional(v.boolean()),
        internationalOnly: v.optional(v.boolean()),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};
    if (options.id) {
      const course = await ctx.db.get(options.id);
      if (!course) return null;

      return course;
    }
    if (options.ids) {
      if (options.ids.length === 0) return [];
      const courses = await Promise.all(
        options.ids.map(async (id) => {
          const course = await ctx.db.get(id);
          return course ?? null;
        }),
      );
      return courses.filter((c): c is NonNullable<typeof c> => Boolean(c));
    }
    let courses = await ctx.db.query("courses").collect();
    const basicCourses = courses.map((course) => ({
      ...course,
      displayName: generateDisplayName(course.name, course.location),
      parDisplay: formatParDisplay(course.par),
      timeZoneDisplay: formatTimeZone(course.timeZoneOffset),
      isInternational: isInternational(course.location),
      isChampionship: course.par >= 72,
    }));

    return basicCourses;
  },
});

/**
 * Updates a course by id.
 *
 * Access:
 * - Requires admin.
 *
 * Behavior:
 * - Runs validation unless `options.skipValidation` is true.
 * - Enforces `apiId` uniqueness when `data.apiId` is changing.
 * - Updates `updatedAt` by default (disable via `options.updateTimestamp: false`).
 * - Optionally returns an enhanced course view when `options.returnEnhanced` is true.
 */
export const updateCourses = mutation({
  args: {
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }
    const data = {
      ...args.data,
      ...(typeof args.data.apiId === "string"
        ? { apiId: args.data.apiId.trim() }
        : {}),
      ...(typeof args.data.name === "string"
        ? { name: args.data.name.trim() }
        : {}),
      ...(typeof args.data.location === "string"
        ? { location: args.data.location.trim() }
        : {}),
    };

    if (!options.skipValidation) {
      const validation = validateCourseData(data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }
    if (typeof data.apiId === "string" && data.apiId !== course.apiId) {
      const nextApiId = data.apiId;
      const existingByApiId = await ctx.db
        .query("courses")
        .withIndex("by_api_id", (q) => q.eq("apiId", nextApiId))
        .first();

      if (existingByApiId && existingByApiId._id !== args.courseId) {
        throw new Error(`Course with API ID "${nextApiId}" already exists`);
      }
    }
    const updateData: Partial<CourseDoc> = { ...data };

    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }
    await ctx.db.patch(args.courseId, updateData);

    const updatedCourse = await ctx.db.get(args.courseId);
    if (!updatedCourse) {
      throw new Error("Failed to retrieve updated course");
    }

    return updatedCourse;
  },
});

/**
 * Deletes a course.
 *
 * Access:
 * - Requires admin.
 *
 * Behavior:
 * - This is a hard delete (permanent removal).
 * - If tournaments reference this course, you must either:
 *   - provide `options.replacementCourseId` (migrate references), or
 *   - set `options.cascadeDelete` to delete tournaments that reference it.
 * - `options.returnDeletedData` optionally returns the deleted course payload.
 */
export const deleteCourses = mutation({
  args: {
    courseId: v.id("courses"),
    options: v.optional(
      v.object({
        cascadeDelete: v.optional(v.boolean()),
        replacementCourseId: v.optional(v.id("courses")),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<CourseDoc>> => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    let replacedCount = 0;
    let deletedCourseData: CourseDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedCourseData = course;
    }
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    if (options.replacementCourseId) {
      const replacementCourse = await ctx.db.get(options.replacementCourseId);
      if (!replacementCourse) {
        throw new Error("Replacement course not found");
      }
      for (const tournament of tournaments) {
        await ctx.db.patch(tournament._id, {
          courseId: options.replacementCourseId,
          updatedAt: Date.now(),
        });
        replacedCount++;
      }
    }
    if (options.cascadeDelete && !options.replacementCourseId) {
      for (const tournament of tournaments) {
        await ctx.db.delete(tournament._id);
      }
    }
    if (!options.cascadeDelete && !options.replacementCourseId) {
      if (tournaments.length > 0) {
        throw new Error(
          `Cannot delete course: ${tournaments.length} tournament(s) still reference this course. Use cascadeDelete or replacementCourseId.`,
        );
      }
    }

    await ctx.db.delete(args.courseId);
    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: replacedCount > 0 ? replacedCount : undefined,
      deletedData: deletedCourseData,
    };
  },
});

const validateCourseData = (
  data: Partial<
    Pick<
      Doc<"courses">,
      | "apiId"
      | "name"
      | "location"
      | "par"
      | "front"
      | "back"
      | "timeZoneOffset"
    >
  >,
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
