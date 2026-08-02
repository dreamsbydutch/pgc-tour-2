import { isPlayerCut } from "@/lib";
import type { BuildTeamAverageScorecardArgs, TeamAverageGolfer } from "@/types";

/**
 * Builds hole values using the same denominator as the live team score.
 * Unplayed golfers contribute par until they complete the hole, so one stroke
 * changes a weekday cell by 0.1 and a weekend cell by 0.2.
 */
export function buildTeamAverageScorecard(args: BuildTeamAverageScorecardArgs) {
  const scorecards = Array.isArray(args.scorecards) ? args.scorecards : [];
  const scorecardByGolferId = new Map(
    scorecards.map((scorecard) => [String(scorecard.golferId), scorecard]),
  );

  return {
    rounds: [1, 2, 3, 4].map((roundNumber) => {
      const countingGolfers = selectCountingGolfersForRound({
        ...args,
        roundNumber,
      });
      const holes = Array.from({ length: 18 }, (_, index) => {
        const holeNumber = index + 1;
        const completedScores = countingGolfers.flatMap((golfer) => {
          const scorecard = scorecardByGolferId.get(String(golfer.golferId));
          const score = scorecard?.rounds
            .find((round) => round.round === roundNumber)
            ?.holes.find((hole) => hole.hole === holeNumber);
          return score ? [score] : [];
        });
        const firstScore = completedScores[0];
        if (!firstScore || countingGolfers.length === 0) return [];

        const holePar = firstScore.strokes - firstScore.relativeToPar;
        const teamRelativeToPar =
          completedScores.reduce((sum, score) => sum + score.relativeToPar, 0) /
          countingGolfers.length;
        return [
          {
            hole: holeNumber,
            strokes: holePar + teamRelativeToPar,
            relativeToPar: teamRelativeToPar,
            completion: {
              completed: completedScores.length,
              total: countingGolfers.length,
            },
          },
        ];
      }).flat();
      return { round: roundNumber, holes };
    }),
  };
}

function selectCountingGolfersForRound(
  args: BuildTeamAverageScorecardArgs & { roundNumber: number },
) {
  if (args.roundNumber <= 2) return args.teamGolfers.slice(0, 10);
  if (!args.tournamentCompleted && args.roundNumber > args.currentRound) {
    return [];
  }

  const eligible = args.teamGolfers.filter(
    (golfer) => !isPlayerCut(golfer.position),
  );
  if (eligible.length < 5) return [];
  const isCompletedRound =
    args.tournamentCompleted || args.roundNumber < args.currentRound;
  if (isCompletedRound) {
    const withRoundScores = eligible.filter(
      (golfer) =>
        typeof getGolferRoundScore(golfer, args.roundNumber) === "number",
    );
    if (withRoundScores.length < 5) return [];
    return withRoundScores
      .sort((a, b) => {
        const scoreDifference =
          getGolferRoundScore(a, args.roundNumber)! -
          getGolferRoundScore(b, args.roundNumber)!;
        return scoreDifference !== 0
          ? scoreDifference
          : (a.apiId ?? Number.POSITIVE_INFINITY) -
              (b.apiId ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 5);
  }

  return [...eligible]
    .sort((a, b) => {
      const todayDifference =
        (a.today ?? Number.POSITIVE_INFINITY) -
        (b.today ?? Number.POSITIVE_INFINITY);
      if (todayDifference !== 0) return todayDifference;
      const thruDifference =
        (a.thru ?? Number.POSITIVE_INFINITY) -
        (b.thru ?? Number.POSITIVE_INFINITY);
      if (thruDifference !== 0) return thruDifference;
      return (
        (a.apiId ?? Number.POSITIVE_INFINITY) -
        (b.apiId ?? Number.POSITIVE_INFINITY)
      );
    })
    .slice(0, 5);
}

function getGolferRoundScore(golfer: TeamAverageGolfer, roundNumber: number) {
  return roundNumber === 1
    ? golfer.roundOne
    : roundNumber === 2
      ? golfer.roundTwo
      : roundNumber === 3
        ? golfer.roundThree
        : golfer.roundFour;
}
