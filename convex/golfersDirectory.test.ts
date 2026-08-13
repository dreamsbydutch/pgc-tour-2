/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { collectMissingTournamentGolfers } from "./functions/utils";
import schema from "./schema";
import type {
  DataGolfFieldUpdatesResponse,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPredictionsResponse,
  DataGolfRankingsResponse,
} from "./types/datagolf";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  return convexTest(schema, modules);
}

describe("golfer directory synchronization", () => {
  it("inserts new identities and preserves provider-specific existing fields", async () => {
    const t = createTestBackend();
    await t.run((ctx) =>
      ctx.db.insert("golfers", {
        apiId: 101,
        espnId: "espn-101",
        playerName: "Old Name",
        country: "USA",
        worldRank: 12,
      }),
    );

    const result = await t.mutation(
      internal.functions.golfers.upsertGolfersFromDataGolfPlayerList,
      {
        players: [
          { dg_id: 101, player_name: "Player, Existing", country: "CAN" },
          { dg_id: 202, player_name: "Golfer, New", country: "USA" },
          { dg_id: -1, player_name: "Invalid", country: "USA" },
        ],
      },
    );

    expect(result).toMatchObject({
      processed: 3,
      inserted: 1,
      updated: 1,
      invalid: 1,
    });
    const golfers = await t.run((ctx) => ctx.db.query("golfers").collect());
    expect(golfers).toHaveLength(2);
    expect(golfers.find((golfer) => golfer.apiId === 101)).toMatchObject({
      espnId: "espn-101",
      playerName: "Existing Player",
      country: "CAN",
      worldRank: 12,
    });
    expect(golfers.find((golfer) => golfer.apiId === 202)).toMatchObject({
      playerName: "New Golfer",
      country: "USA",
    });

    const repeated = await t.mutation(
      internal.functions.golfers.upsertGolfersFromDataGolfPlayerList,
      {
        players: [
          { dg_id: 101, player_name: "Player, Existing", country: "CAN" },
          { dg_id: 202, player_name: "Golfer, New", country: "USA" },
        ],
      },
    );
    expect(repeated).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
  });

  it("discovers missing golfers from field, live, and historical feeds", () => {
    const missing = collectMissingTournamentGolfers({
      existingApiIds: new Set([1]),
      fieldData: {
        field: [
          {
            dg_id: 2,
            player_name: "Field Player",
            country: "CAN",
            owgr_rank: 88,
            teetimes: [
              { round_num: 1, teetime: 1234 },
              { round_num: 2, teetime: 5678 },
            ],
          },
        ],
      } as DataGolfFieldUpdatesResponse,
      rankingData: {
        rankings: [{ dg_id: 2, dg_skill_estimate: 1.25, owgr_rank: 90 }],
      } as DataGolfRankingsResponse,
      liveData: {
        data: [
          { dg_id: 1, player_name: "Known Player" },
          { dg_id: 3, player_name: "Live Addition" },
        ],
      } as DataGolfLiveModelPredictionsResponse,
      historicalData: {
        scores: [{ dg_id: 4, player_name: "Historical Addition" }],
      } as DataGolfHistoricalRoundDataResponse,
    });

    expect(missing).toEqual([
      {
        dg_id: 2,
        player_name: "Field Player",
        country: "CAN",
        worldRank: 88,
        dg_skill_estimate: 1.25,
        r1_teetime: 1234,
        r2_teetime: 5678,
      },
      { dg_id: 3, player_name: "Live Addition" },
      { dg_id: 4, player_name: "Historical Addition" },
    ]);
  });
});
