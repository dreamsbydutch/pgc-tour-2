import type { CourseEnhancementOptions } from "../types/courses";
import type {
  AnalyticsResult,
  CourseDoc,
  CourseFilterOptions,
  CourseOptimizedQueryOptions,
  CourseSortFunction,
  CourseSortOptions,
  DatabaseContext,
  EnhancedCourseDoc,
} from "../types/types";

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
 * Generate course difficulty category
 */
export function getDifficultyCategory(
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
export function getCourseRating(par: number): string {
  if (par >= 72) return "Championship Course";
  if (par >= 70) return "Standard Course";
  if (par >= 62) return "Executive Course";
  return "Par 3 Course";
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

/**
 * Get optimized courses based on query options using indexes
 */
export async function getOptimizedCourses(
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
export function applyFilters(
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
export function getSortFunction(sort: CourseSortOptions): CourseSortFunction {
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
export async function enhanceCourse(
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
export async function generateAnalytics(
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
