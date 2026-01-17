/**
 * Course Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { processData, validators } from "./_utils";
import { requireAdmin } from "../auth";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  CourseDoc,
  EnhancedCourseDoc,
  CourseSortFunction,
  DatabaseContext,
  CourseFilterOptions,
  CourseOptimizedQueryOptions,
  CourseSortOptions,
} from "../types/types";

interface CourseEnhancementOptions {
  includeTournaments?: boolean;
  includeStatistics?: boolean;
}

/**
 * Validate course data
 */
function validateCourseData(data: {
  apiId?: string;
  name?: string;
  location?: string;
  par?: number;
  front?: number;
  back?: number;
  timeZoneOffset?: number;
}): ValidationResult {
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
}

/**
 * Generate display name for course
 */
function generateDisplayName(name: string, location: string): string {
  return `${name.trim()} - ${location.trim()}`;
}

/**
 * Format par display string
 */
function formatParDisplay(par: number): string {
  return `Par ${par}`;
}

/**
 * Generate course difficulty category
 */
function getDifficultyCategory(
  par: number,
): "championship" | "standard" | "executive" | "par3" {
  if (par >= 72) return "championship";
  if (par >= 70) return "standard";
  if (par >= 62) return "executive";
  return "par3";
}

/**
 * Calculate course rating category
 */
function getCourseRating(par: number): string {
  if (par >= 72) return "Championship Course";
  if (par >= 70) return "Standard Course";
  if (par >= 62) return "Executive Course";
  return "Par 3 Course";
}

/**
 * Format timezone display
 */
function formatTimeZone(offset: number): string {
  const sign = offset >= 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

/**
 * Determine if course is internationally located
 */
function isInternational(location: string): boolean {
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

/**
 * Create courses with comprehensive options
 *
 * @example
 * Basic course creation
 * const course = await ctx.runMutation(api.functions.courses.createCourses, {
 *   data: {
 *     apiId: "course123",
 *     name: "Augusta National Golf Club",
 *     location: "Augusta, GA",
 *     par: 72,
 *     front: 36,
 *     back: 36,
 *     timeZoneOffset: -5
 *   }
 * });
 *
 * With advanced options
 * const course = await ctx.runMutation(api.functions.courses.createCourses, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const createCourses = mutation({
  args: {
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    if (!options.skipValidation) {
      const validation = validateCourseData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }
    const existingByApiId = await ctx.db
      .query("courses")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.data.apiId))
      .first();

    if (existingByApiId) {
      throw new Error(`Course with API ID "${args.data.apiId}" already exists`);
    }
    const courseId = await ctx.db.insert("courses", {
      apiId: args.data.apiId,
      name: args.data.name,
      location: args.data.location,
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
    if (options.returnEnhanced) {
      return await enhanceCourse(ctx, course, {
        includeStatistics: options.includeStatistics,
        includeTournaments: options.includeTournaments,
      });
    }

    return course;
  },
});

/**
 * Get courses with comprehensive filtering, sorting, and enhancement options
 *
 * @example
 * Get all courses
 * const courses = await ctx.runQuery(api.functions.courses.getCourses, {});
 *
 * Get by ID
 * const course = await ctx.runQuery(api.functions.courses.getCourses, {
 *   options: { id: "course123" }
 * });
 *
 * Advanced query with filters and enhancements
 * const courses = await ctx.runQuery(api.functions.courses.getCourses, {
 *   options: {
 *     filter: {
 *       location: "Augusta, GA",
 *       minPar: 70,
 *       maxPar: 74
 *     },
 *     sort: {
 *       sortBy: "name",
 *       sortOrder: "asc"
 *     },
 *     pagination: {
 *       limit: 10,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeTournaments: true,
 *       includeStatistics: true
 *     }
 *   }
 * });
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
            includeTotals: v.optional(v.boolean()),
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

      return await enhanceCourse(ctx, course, options.enhance || {});
    }
    if (options.ids) {
      const courses = await Promise.all(
        options.ids.map(async (id) => {
          const course = await ctx.db.get(id);
          return course
            ? await enhanceCourse(ctx, course, options.enhance || {})
            : null;
        }),
      );
      return courses.filter(Boolean);
    }
    let courses = await getOptimizedCourses(ctx, options);
    courses = applyFilters(courses, options.filter || {});
    if (options.championshipOnly) {
      courses = courses.filter((c) => c.par >= 72);
    }
    if (options.internationalOnly) {
      courses = courses.filter((c) => isInternational(c.location));
    }
    const processedCourses = processData(courses, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });
    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedCourses = await Promise.all(
        processedCourses.map((course) =>
          enhanceCourse(ctx, course, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          courses: enhancedCourses,
          analytics: await generateAnalytics(ctx, courses),
          meta: {
            total: courses.length,
            filtered: processedCourses.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedCourses;
    }
    const basicCourses = processedCourses.map((course) => ({
      ...course,
      displayName: generateDisplayName(course.name, course.location),
      parDisplay: formatParDisplay(course.par),
      difficultyCategory: getDifficultyCategory(course.par),
      courseRating: getCourseRating(course.par),
      timeZoneDisplay: formatTimeZone(course.timeZoneOffset),
      isInternational: isInternational(course.location),
      isChampionship: course.par >= 72,
    }));

    if (options.includeAnalytics) {
      return {
        courses: basicCourses,
        analytics: await generateAnalytics(ctx, courses),
        meta: {
          total: courses.length,
          filtered: basicCourses.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicCourses;
  },
});

/**
 * Get a course by API ID
 */
export const getCourseByApiId = query({
  args: {
    apiId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("courses")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.apiId))
      .first();
  },
});

/**
 * Get courses by location
 */
export const getCoursesByLocation = query({
  args: {
    location: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("courses")
      .withIndex("by_location", (q) => q.eq("location", args.location))
      .collect();
  },
});

/**
 * Update courses with comprehensive options
 *
 * @example
 * Basic update
 * const updatedCourse = await ctx.runMutation(api.functions.courses.updateCourses, {
 *   courseId: "course123",
 *   data: { par: 71, front: 35, back: 36 }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.courses.updateCourses, {
 *   courseId: "course123",
 *   data: { name: "New Name" },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const updateCourses = mutation({
  args: {
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }
    if (!options.skipValidation) {
      const validation = validateCourseData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }
    if (args.data.apiId && args.data.apiId !== course.apiId) {
      const existingByApiId = await ctx.db
        .query("courses")
        .withIndex("by_api_id", (q) => q.eq("apiId", args.data.apiId!))
        .first();

      if (existingByApiId && existingByApiId._id !== args.courseId) {
        throw new Error(
          `Course with API ID "${args.data.apiId}" already exists`,
        );
      }
    }
    const updateData: Partial<CourseDoc> = { ...args.data };

    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }
    await ctx.db.patch(args.courseId, updateData);

    const updatedCourse = await ctx.db.get(args.courseId);
    if (!updatedCourse) {
      throw new Error("Failed to retrieve updated course");
    }
    if (options.returnEnhanced) {
      return await enhanceCourse(ctx, updatedCourse, {
        includeStatistics: options.includeStatistics,
        includeTournaments: options.includeTournaments,
      });
    }

    return updatedCourse;
  },
});

/**
 * Delete courses (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * Requires either cascadeDelete or replacementCourseId if tournaments reference this course.
 *
 * @example
 * Delete course with cascade
 * const result = await ctx.runMutation(api.functions.courses.deleteCourses, {
 *   courseId: "course123",
 *   options: {
 *     cascadeDelete: true
 *   }
 * });
 *
 * Delete with data migration to another course
 * const result = await ctx.runMutation(api.functions.courses.deleteCourses, {
 *   courseId: "course123",
 *   options: {
 *     replacementCourseId: "newCourse456"
 *   }
 * });
 */
export const deleteCourses = mutation({
  args: {
    clerkId: v.optional(v.string()),
    courseId: v.id("courses"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
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
    if (options.replacementCourseId) {
      const replacementCourse = await ctx.db.get(options.replacementCourseId);
      if (!replacementCourse) {
        throw new Error("Replacement course not found");
      }
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
        .collect();

      for (const tournament of tournaments) {
        await ctx.db.patch(tournament._id, {
          courseId: options.replacementCourseId,
          updatedAt: Date.now(),
        });
        replacedCount++;
      }
    }
    if (options.cascadeDelete && !options.replacementCourseId) {
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
        .collect();

      for (const tournament of tournaments) {
        await ctx.db.delete(tournament._id);
      }
    }
    if (!options.cascadeDelete && !options.replacementCourseId) {
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
        .collect();

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

/**
 * Get optimized courses based on query options using indexes
 */
async function getOptimizedCourses(
  ctx: DatabaseContext,
  options: CourseOptimizedQueryOptions,
): Promise<CourseDoc[]> {
  const filter = options.filter || {};
  if (filter.apiId) {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_api_id", (q) => q.eq("apiId", filter.apiId!))
      .first();
    return course ? [course] : [];
  }

  if (filter.name) {
    return await ctx.db
      .query("courses")
      .withIndex("by_name", (q) => q.eq("name", filter.name!))
      .collect();
  }

  if (filter.location) {
    return await ctx.db
      .query("courses")
      .withIndex("by_location", (q) => q.eq("location", filter.location!))
      .collect();
  }

  return await ctx.db.query("courses").collect();
}

/**
 * Apply comprehensive filters to courses
 */
function applyFilters(
  courses: CourseDoc[],
  filter: CourseFilterOptions,
): CourseDoc[] {
  return courses.filter((course) => {
    if (filter.minPar !== undefined && course.par < filter.minPar) {
      return false;
    }

    if (filter.maxPar !== undefined && course.par > filter.maxPar) {
      return false;
    }
    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [course.name, course.location, course.apiId]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }
    if (
      filter.createdAfter !== undefined &&
      course._creationTime < filter.createdAfter
    ) {
      return false;
    }

    if (
      filter.createdBefore !== undefined &&
      course._creationTime > filter.createdBefore
    ) {
      return false;
    }

    if (
      filter.updatedAfter !== undefined &&
      (course.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }

    if (
      filter.updatedBefore !== undefined &&
      (course.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
function getSortFunction(sort: CourseSortOptions): CourseSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: CourseDoc, b: CourseDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "location":
      return (a: CourseDoc, b: CourseDoc) =>
        a.location.localeCompare(b.location) * sortOrder;
    case "par":
      return (a: CourseDoc, b: CourseDoc) => (a.par - b.par) * sortOrder;
    case "createdAt":
      return (a: CourseDoc, b: CourseDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: CourseDoc, b: CourseDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single course with related data
 */
async function enhanceCourse(
  ctx: DatabaseContext,
  course: CourseDoc,
  enhance: CourseEnhancementOptions,
): Promise<EnhancedCourseDoc> {
  const enhanced: EnhancedCourseDoc = {
    ...course,
    fullLocation: course.location,
    parDisplay: formatParDisplay(course.par),
    timeZoneDisplay: formatTimeZone(course.timeZoneOffset),
    hasFullDetails: !!(course.front && course.back && course.par),
  };

  if (enhance.includeTournaments || enhance.includeStatistics) {
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .collect();

    if (enhance.includeTournaments) {
      enhanced.tournaments = tournaments;
    }

    if (enhance.includeStatistics) {
      const now = Date.now();
      const upcomingTournaments = tournaments.filter((t) => t.startDate > now);
      const activeTournaments = tournaments.filter(
        (t) => t.startDate <= now && t.endDate >= now,
      );

      enhanced.statistics = {
        totalTournaments: tournaments.length,
        activeTournaments: activeTournaments.length,
        upcomingTournaments: upcomingTournaments.length,
        totalRounds: tournaments.length * 4,
        usageByYear: tournaments.reduce(
          (acc, t) => {
            const year = new Date(t.startDate).getFullYear().toString();
            acc[year] = (acc[year] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    }
  }

  return enhanced;
}

/**
 * Generate analytics for courses
 */
async function generateAnalytics(
  _ctx: DatabaseContext,
  courses: CourseDoc[],
): Promise<AnalyticsResult> {
  const locationBreakdown = courses.reduce(
    (acc, course) => {
      acc[course.location] = (acc[course.location] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const timeZoneBreakdown = courses.reduce(
    (acc, course) => {
      const tzKey = formatTimeZone(course.timeZoneOffset);
      acc[tzKey] = (acc[tzKey] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const internationalCourses = courses.filter((c) =>
    isInternational(c.location),
  );
  const championshipCourses = courses.filter((c) => c.par >= 72);

  return {
    total: courses.length,
    active: courses.length,
    inactive: 0,
    statistics: {
      averagePar:
        courses.length > 0
          ? courses.reduce((sum, c) => sum + c.par, 0) / courses.length
          : 0,
      minPar: courses.length > 0 ? Math.min(...courses.map((c) => c.par)) : 0,
      maxPar: courses.length > 0 ? Math.max(...courses.map((c) => c.par)) : 0,
      uniqueLocations: Object.keys(locationBreakdown).length,
      internationalCourses: internationalCourses.length,
      championshipCourses: championshipCourses.length,
      uniqueTimeZones: Object.keys(timeZoneBreakdown).length,
    },
    breakdown: {
      active: courses.length,
      inactive: 0,
    },
  };
}
