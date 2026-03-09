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
import type * as functions_auth from "../functions/auth.js";
import type * as functions_cronJobs from "../functions/cronJobs.js";
import type * as functions_datagolf from "../functions/datagolf.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_golfers from "../functions/golfers.js";
import type * as functions_members from "../functions/members.js";
import type * as functions_migrations from "../functions/migrations.js";
import type * as functions_seasons from "../functions/seasons.js";
import type * as functions_teams from "../functions/teams.js";
import type * as functions_tiers from "../functions/tiers.js";
import type * as functions_tourCards from "../functions/tourCards.js";
import type * as functions_tournaments from "../functions/tournaments.js";
import type * as functions_tours from "../functions/tours.js";
import type * as functions_utils from "../functions/utils.js";
import type * as types_datagolf from "../types/datagolf.js";
import type * as types_emails from "../types/emails.js";
import type * as types_types from "../types/types.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_batchProcess from "../utils/batchProcess.js";
import type * as utils_datagolf from "../utils/datagolf.js";
import type * as utils_emails from "../utils/emails.js";
import type * as utils_externalFetch from "../utils/externalFetch.js";
import type * as utils_golfers from "../utils/golfers.js";
import type * as utils_index from "../utils/index.js";
import type * as utils_misc from "../utils/misc.js";
import type * as utils_tourCards from "../utils/tourCards.js";
import type * as validators_common from "../validators/common.js";
import type * as validators_datagolf from "../validators/datagolf.js";

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
  "functions/auth": typeof functions_auth;
  "functions/cronJobs": typeof functions_cronJobs;
  "functions/datagolf": typeof functions_datagolf;
  "functions/emails": typeof functions_emails;
  "functions/golfers": typeof functions_golfers;
  "functions/members": typeof functions_members;
  "functions/migrations": typeof functions_migrations;
  "functions/seasons": typeof functions_seasons;
  "functions/teams": typeof functions_teams;
  "functions/tiers": typeof functions_tiers;
  "functions/tourCards": typeof functions_tourCards;
  "functions/tournaments": typeof functions_tournaments;
  "functions/tours": typeof functions_tours;
  "functions/utils": typeof functions_utils;
  "types/datagolf": typeof types_datagolf;
  "types/emails": typeof types_emails;
  "types/types": typeof types_types;
  "utils/auth": typeof utils_auth;
  "utils/batchProcess": typeof utils_batchProcess;
  "utils/datagolf": typeof utils_datagolf;
  "utils/emails": typeof utils_emails;
  "utils/externalFetch": typeof utils_externalFetch;
  "utils/golfers": typeof utils_golfers;
  "utils/index": typeof utils_index;
  "utils/misc": typeof utils_misc;
  "utils/tourCards": typeof utils_tourCards;
  "validators/common": typeof validators_common;
  "validators/datagolf": typeof validators_datagolf;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
