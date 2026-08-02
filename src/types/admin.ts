import type { FunctionReturnType } from "convex/server";

import type { api } from "convex/_generated/api";

export type AdminDashboardDto = FunctionReturnType<
  typeof api.functions.readModels.adminGetDashboard
>;

export type StandingsBackfillResult = FunctionReturnType<
  typeof api.functions.standings.adminBackfillSeason
>;
