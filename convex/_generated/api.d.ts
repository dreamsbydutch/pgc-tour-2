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
import type * as crons_golfers from "../crons/golfers.js";
import type * as crons_groups from "../crons/groups.js";
import type * as crons_standings from "../crons/standings.js";
import type * as crons_sync from "../crons/sync.js";
import type * as crons from "../crons.js";
import type * as functions__constants from "../functions/_constants.js";
import type * as functions_crons from "../functions/crons.js";
import type * as functions_datagolf from "../functions/datagolf.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_golfers from "../functions/golfers.js";
import type * as functions_members from "../functions/members.js";
import type * as functions_seasons from "../functions/seasons.js";
import type * as functions_teams from "../functions/teams.js";
import type * as functions_tiers from "../functions/tiers.js";
import type * as functions_tourCards from "../functions/tourCards.js";
import type * as functions_tournaments from "../functions/tournaments.js";
import type * as functions_tours from "../functions/tours.js";
import type * as types_common from "../types/common.js";
import type * as types_datagolf from "../types/datagolf.js";
import type * as types_emails from "../types/emails.js";
import type * as types_golfers from "../types/golfers.js";
import type * as types_members from "../types/members.js";
import type * as types_seasons from "../types/seasons.js";
import type * as types_teams from "../types/teams.js";
import type * as types_tiers from "../types/tiers.js";
import type * as types_tourCards from "../types/tourCards.js";
import type * as types_tournaments from "../types/tournaments.js";
import type * as types_tours from "../types/tours.js";
import type * as types_types from "../types/types.js";
import type * as utils__shared_collections from "../utils/_shared/collections.js";
import type * as utils__shared_fetch from "../utils/_shared/fetch.js";
import type * as utils__shared_object from "../utils/_shared/object.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_datagolf from "../utils/datagolf.js";
import type * as utils_emails from "../utils/emails.js";
import type * as utils_golfers from "../utils/golfers.js";
import type * as utils_seasons from "../utils/seasons.js";
import type * as utils_tiers from "../utils/tiers.js";
import type * as utils_tourCards from "../utils/tourCards.js";
import type * as utils_tournaments from "../utils/tournaments.js";
import type * as utils_tours from "../utils/tours.js";
import type * as validators__shared from "../validators/_shared.js";
import type * as validators_common from "../validators/common.js";
import type * as validators_datagolf from "../validators/datagolf.js";
import type * as validators_emails from "../validators/emails.js";
import type * as validators_golfers from "../validators/golfers.js";
import type * as validators_seasons from "../validators/seasons.js";
import type * as validators_tiers from "../validators/tiers.js";
import type * as validators_tourCards from "../validators/tourCards.js";
import type * as validators_tournaments from "../validators/tournaments.js";
import type * as validators_tours from "../validators/tours.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "crons/golfers": typeof crons_golfers;
  "crons/groups": typeof crons_groups;
  "crons/standings": typeof crons_standings;
  "crons/sync": typeof crons_sync;
  crons: typeof crons;
  "functions/_constants": typeof functions__constants;
  "functions/crons": typeof functions_crons;
  "functions/datagolf": typeof functions_datagolf;
  "functions/emails": typeof functions_emails;
  "functions/golfers": typeof functions_golfers;
  "functions/members": typeof functions_members;
  "functions/seasons": typeof functions_seasons;
  "functions/teams": typeof functions_teams;
  "functions/tiers": typeof functions_tiers;
  "functions/tourCards": typeof functions_tourCards;
  "functions/tournaments": typeof functions_tournaments;
  "functions/tours": typeof functions_tours;
  "types/common": typeof types_common;
  "types/datagolf": typeof types_datagolf;
  "types/emails": typeof types_emails;
  "types/golfers": typeof types_golfers;
  "types/members": typeof types_members;
  "types/seasons": typeof types_seasons;
  "types/teams": typeof types_teams;
  "types/tiers": typeof types_tiers;
  "types/tourCards": typeof types_tourCards;
  "types/tournaments": typeof types_tournaments;
  "types/tours": typeof types_tours;
  "types/types": typeof types_types;
  "utils/_shared/collections": typeof utils__shared_collections;
  "utils/_shared/fetch": typeof utils__shared_fetch;
  "utils/_shared/object": typeof utils__shared_object;
  "utils/auth": typeof utils_auth;
  "utils/datagolf": typeof utils_datagolf;
  "utils/emails": typeof utils_emails;
  "utils/golfers": typeof utils_golfers;
  "utils/seasons": typeof utils_seasons;
  "utils/tiers": typeof utils_tiers;
  "utils/tourCards": typeof utils_tourCards;
  "utils/tournaments": typeof utils_tournaments;
  "utils/tours": typeof utils_tours;
  "validators/_shared": typeof validators__shared;
  "validators/common": typeof validators_common;
  "validators/datagolf": typeof validators_datagolf;
  "validators/emails": typeof validators_emails;
  "validators/golfers": typeof validators_golfers;
  "validators/seasons": typeof validators_seasons;
  "validators/tiers": typeof validators_tiers;
  "validators/tourCards": typeof validators_tourCards;
  "validators/tournaments": typeof validators_tournaments;
  "validators/tours": typeof validators_tours;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
