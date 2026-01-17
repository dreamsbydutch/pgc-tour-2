import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTournamentGolfersPaginated } from "./useTournamentGolfersPaginated";

/**
 * Hook that replaces api.functions.golfers.getTournamentLeaderboardGolfers
 * with paginated loading. Returns the same enriched golfer data shape.
 */
export function useTournamentLeaderboardGolfers(args: {
  tournamentId?: Id<"tournaments"> | null;
}) {
  const tournamentId = args.tournamentId ?? null;

  const {
    records: tournamentGolferRecords,
    loadMore,
    isDone,
    isLoading: recordsLoading,
  } = useTournamentGolfersPaginated({ tournamentId });

  useEffect(() => {
    if (!tournamentId) return;
    if (isDone) return;
    if (recordsLoading) return;
    loadMore();
  }, [tournamentId, isDone, recordsLoading, loadMore]);

  const golferIds = useMemo(
    () => [...new Set(tournamentGolferRecords.map((r) => r.golferId))],
    [tournamentGolferRecords],
  );

  const golfersQuery = useQuery(
    api.functions.golfers.getGolfers,
    golferIds.length > 0 ? { options: { ids: golferIds } } : "skip",
  );

  const golfers = useMemo(() => {
    if (!golfersQuery) return [];
    return Array.isArray(golfersQuery) ? golfersQuery : [];
  }, [golfersQuery]);

  const golferMap = useMemo(() => {
    const map = new Map<string, (typeof golfers)[0]>();
    for (const golfer of golfers) {
      if (golfer && "_id" in golfer) {
        map.set(golfer._id, golfer);
      }
    }
    return map;
  }, [golfers]);

  const enrichedGolfers = useMemo(() => {
    return tournamentGolferRecords
      .map((tg) => {
        const golfer = golferMap.get(tg.golferId);
        if (!golfer) return null;

        return {
          ...golfer,
          tournamentId: tg.tournamentId,
          tournamentGolferId: tg._id,
          position: tg.position,
          posChange: tg.posChange,
          thru: tg.thru,
          today: tg.today,
          score: tg.score,
          round: tg.round,
          endHole: tg.endHole,
          group: tg.group,
          roundOneTeeTime: tg.roundOneTeeTime,
          roundOne: tg.roundOne,
          roundTwoTeeTime: tg.roundTwoTeeTime,
          roundTwo: tg.roundTwo,
          roundThreeTeeTime: tg.roundThreeTeeTime,
          roundThree: tg.roundThree,
          roundFourTeeTime: tg.roundFourTeeTime,
          roundFour: tg.roundFour,
          updatedAt: tg.updatedAt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [tournamentGolferRecords, golferMap]);

  const isLoading =
    recordsLoading || (golferIds.length > 0 && golfersQuery === undefined);

  return {
    golfers: enrichedGolfers,
    isLoading,
  };
}
