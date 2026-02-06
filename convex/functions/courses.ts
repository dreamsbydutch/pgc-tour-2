/**
 * Course Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { processData } from "../utils/processData";
import { requireAdmin } from "../auth";
import {
  applyFilters,
  enhanceCourse,
  formatParDisplay,
  formatTimeZone,
  generateAnalytics,
  generateDisplayName,
  getCourseRating,
  getDifficultyCategory,
  getOptimizedCourses,
  getSortFunction,
  isInternational,
} from "../utils/courses";
import { coursesValidators } from "../validators/courses";
import type { DeleteResponse, CourseDoc } from "../types/types";

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
  args: coursesValidators.args.createCourses,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    if (!options.skipValidation) {
      const validation = coursesValidators.validateCourseData(args.data);
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
  args: coursesValidators.args.getCourses,
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
  args: coursesValidators.args.getCourseByApiId,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("courses")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.apiId))
      .first();
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
  args: coursesValidators.args.updateCourses,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }
    if (!options.skipValidation) {
      const validation = coursesValidators.validateCourseData(args.data);
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
  args: coursesValidators.args.deleteCourses,
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
