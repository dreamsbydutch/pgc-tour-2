/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as functions__auditLog from "../functions/_auditLog.js";
import type * as functions__authByClerkId from "../functions/_authByClerkId.js";
import type * as functions__constants from "../functions/_constants.js";
import type * as functions__externalFetch from "../functions/_externalFetch.js";
import type * as functions__utils from "../functions/_utils.js";
import type * as functions_courses from "../functions/courses.js";
import type * as functions_cronGroups from "../functions/cronGroups.js";
import type * as functions_cronJobs from "../functions/cronJobs.js";
import type * as functions_cronTeams from "../functions/cronTeams.js";
import type * as functions_datagolf from "../functions/datagolf.js";
import type * as functions_emailData from "../functions/emailData.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_golfers from "../functions/golfers.js";
import type * as functions_members from "../functions/members.js";
import type * as functions_seasons from "../functions/seasons.js";
import type * as functions_teams from "../functions/teams.js";
import type * as functions_tiers from "../functions/tiers.js";
import type * as functions_tourCards from "../functions/tourCards.js";
import type * as functions_tournaments from "../functions/tournaments.js";
import type * as functions_tours from "../functions/tours.js";
import type * as functions_transactions from "../functions/transactions.js";
import type * as types_datagolf from "../types/datagolf.js";
import type * as types_functionUtils from "../types/functionUtils.js";
import type * as types_types from "../types/types.js";
import type * as utils from "../utils.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  "functions/_auditLog": typeof functions__auditLog;
  "functions/_authByClerkId": typeof functions__authByClerkId;
  "functions/_constants": typeof functions__constants;
  "functions/_externalFetch": typeof functions__externalFetch;
  "functions/_utils": typeof functions__utils;
  "functions/courses": typeof functions_courses;
  "functions/cronGroups": typeof functions_cronGroups;
  "functions/cronJobs": typeof functions_cronJobs;
  "functions/cronTeams": typeof functions_cronTeams;
  "functions/datagolf": typeof functions_datagolf;
  "functions/emailData": typeof functions_emailData;
  "functions/emails": typeof functions_emails;
  "functions/golfers": typeof functions_golfers;
  "functions/members": typeof functions_members;
  "functions/seasons": typeof functions_seasons;
  "functions/teams": typeof functions_teams;
  "functions/tiers": typeof functions_tiers;
  "functions/tourCards": typeof functions_tourCards;
  "functions/tournaments": typeof functions_tournaments;
  "functions/tours": typeof functions_tours;
  "functions/transactions": typeof functions_transactions;
  "types/datagolf": typeof types_datagolf;
  "types/functionUtils": typeof types_functionUtils;
  "types/types": typeof types_types;
  utils: typeof utils;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
