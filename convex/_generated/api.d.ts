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
import type * as crons from "../crons.js";
import type * as functions__constants from "../functions/_constants.js";
import type * as functions_courses from "../functions/courses.js";
import type * as functions_cronJobs from "../functions/cronJobs.js";
import type * as functions_datagolf from "../functions/datagolf.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_golfers from "../functions/golfers.js";
import type * as functions_members from "../functions/members.js";
import type * as functions_membersAdmin from "../functions/membersAdmin.js";
import type * as functions_seasons from "../functions/seasons.js";
import type * as functions_teams from "../functions/teams.js";
import type * as functions_tiers from "../functions/tiers.js";
import type * as functions_tourCards from "../functions/tourCards.js";
import type * as functions_tournaments from "../functions/tournaments.js";
import type * as functions_tours from "../functions/tours.js";
import type * as functions_transactions from "../functions/transactions.js";
import type * as types_auditLog from "../types/auditLog.js";
import type * as types_datagolf from "../types/datagolf.js";
import type * as types_emails from "../types/emails.js";
import type * as types_externalFetch from "../types/externalFetch.js";
import type * as types_functionUtils from "../types/functionUtils.js";
import type * as types_golfers from "../types/golfers.js";
import type * as types_members from "../types/members.js";
import type * as types_seasons from "../types/seasons.js";
import type * as types_teams from "../types/teams.js";
import type * as types_tiers from "../types/tiers.js";
import type * as types_tourCards from "../types/tourCards.js";
import type * as types_tournaments from "../types/tournaments.js";
import type * as types_tours from "../types/tours.js";
import type * as types_transactions from "../types/transactions.js";
import type * as types_types from "../types/types.js";
import type * as utils_auditLog from "../utils/auditLog.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_batchProcess from "../utils/batchProcess.js";
import type * as utils_courses from "../utils/courses.js";
import type * as utils_datagolf from "../utils/datagolf.js";
import type * as utils_dateUtils from "../utils/dateUtils.js";
import type * as utils_emails from "../utils/emails.js";
import type * as utils_externalFetch from "../utils/externalFetch.js";
import type * as utils_golfers from "../utils/golfers.js";
import type * as utils_index from "../utils/index.js";
import type * as utils_members from "../utils/members.js";
import type * as utils_misc from "../utils/misc.js";
import type * as utils_seasons from "../utils/seasons.js";
import type * as utils_sumArray from "../utils/sumArray.js";
import type * as utils_teams from "../utils/teams.js";
import type * as utils_tiers from "../utils/tiers.js";
import type * as utils_tourCards from "../utils/tourCards.js";
import type * as utils_tournaments from "../utils/tournaments.js";
import type * as utils_tours from "../utils/tours.js";
import type * as utils_transactions from "../utils/transactions.js";
import type * as utils_validation from "../utils/validation.js";
import type * as validators_common from "../validators/common.js";
import type * as validators_datagolf from "../validators/datagolf.js";
import type * as validators_emails from "../validators/emails.js";
import type * as validators_members from "../validators/members.js";
import type * as validators_seasons from "../validators/seasons.js";
import type * as validators_teams from "../validators/teams.js";
import type * as validators_tiers from "../validators/tiers.js";
import type * as validators_tourCards from "../validators/tourCards.js";
import type * as validators_tournaments from "../validators/tournaments.js";
import type * as validators_tours from "../validators/tours.js";
import type * as validators_transactions from "../validators/transactions.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "functions/_constants": typeof functions__constants;
  "functions/courses": typeof functions_courses;
  "functions/cronJobs": typeof functions_cronJobs;
  "functions/datagolf": typeof functions_datagolf;
  "functions/emails": typeof functions_emails;
  "functions/golfers": typeof functions_golfers;
  "functions/members": typeof functions_members;
  "functions/membersAdmin": typeof functions_membersAdmin;
  "functions/seasons": typeof functions_seasons;
  "functions/teams": typeof functions_teams;
  "functions/tiers": typeof functions_tiers;
  "functions/tourCards": typeof functions_tourCards;
  "functions/tournaments": typeof functions_tournaments;
  "functions/tours": typeof functions_tours;
  "functions/transactions": typeof functions_transactions;
  "types/auditLog": typeof types_auditLog;
  "types/datagolf": typeof types_datagolf;
  "types/emails": typeof types_emails;
  "types/externalFetch": typeof types_externalFetch;
  "types/functionUtils": typeof types_functionUtils;
  "types/golfers": typeof types_golfers;
  "types/members": typeof types_members;
  "types/seasons": typeof types_seasons;
  "types/teams": typeof types_teams;
  "types/tiers": typeof types_tiers;
  "types/tourCards": typeof types_tourCards;
  "types/tournaments": typeof types_tournaments;
  "types/tours": typeof types_tours;
  "types/transactions": typeof types_transactions;
  "types/types": typeof types_types;
  "utils/auditLog": typeof utils_auditLog;
  "utils/auth": typeof utils_auth;
  "utils/batchProcess": typeof utils_batchProcess;
  "utils/courses": typeof utils_courses;
  "utils/datagolf": typeof utils_datagolf;
  "utils/dateUtils": typeof utils_dateUtils;
  "utils/emails": typeof utils_emails;
  "utils/externalFetch": typeof utils_externalFetch;
  "utils/golfers": typeof utils_golfers;
  "utils/index": typeof utils_index;
  "utils/members": typeof utils_members;
  "utils/misc": typeof utils_misc;
  "utils/seasons": typeof utils_seasons;
  "utils/sumArray": typeof utils_sumArray;
  "utils/teams": typeof utils_teams;
  "utils/tiers": typeof utils_tiers;
  "utils/tourCards": typeof utils_tourCards;
  "utils/tournaments": typeof utils_tournaments;
  "utils/tours": typeof utils_tours;
  "utils/transactions": typeof utils_transactions;
  "utils/validation": typeof utils_validation;
  "validators/common": typeof validators_common;
  "validators/datagolf": typeof validators_datagolf;
  "validators/emails": typeof validators_emails;
  "validators/members": typeof validators_members;
  "validators/seasons": typeof validators_seasons;
  "validators/teams": typeof validators_teams;
  "validators/tiers": typeof validators_tiers;
  "validators/tourCards": typeof validators_tourCards;
  "validators/tournaments": typeof validators_tournaments;
  "validators/tours": typeof validators_tours;
  "validators/transactions": typeof validators_transactions;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
