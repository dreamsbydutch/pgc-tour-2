import { isDate } from "@/lib/utils";

/**
 * LittleFucker Component
 *
 * Displays a row of trophy icons for champion teams, each with a tournament logo and optional season/year text.
 *
 * @param champions - Array of champion objects, each with an id and tournament details
 * @param showSeasonText - Whether to display the tournament year below the trophy icon
 */
export function LittleFucker({
  champions,
  showSeasonText = false,
}: {
  /**
   * Array of champion objects, each with an id and tournament details
   */
  champions:
    | {
        id: number;
        tournament: {
          name: string;
          logoUrl: string | null;
          startDate: Date;
          currentRound: number | null;
        };
      }[]
    | null
    | undefined;
  /**
   * Whether to display the tournament year below the trophy icon
   */
  showSeasonText?: boolean;
}) {
  if (!champions || champions.length === 0) return null;
  return (
    <div className="flex flex-row">
      {champions
        .filter(
          (c) =>
            [
              "TOUR Championship",
              "The Masters",
              "U.S. Open",
              "The Open Championship",
              "PGA Championship",
              "Canadian Open",
              "RBC Canadian Open",
            ].includes(c.tournament.name) &&
            (c.tournament.currentRound ?? 0) > 4,
        )
        .map((champion) => (
          <TrophyIcon
            key={champion.id}
            logoUrl={champion.tournament.logoUrl}
            tournamentName={champion.tournament.name}
            year={
              isDate(champion.tournament.startDate)
                ? champion.tournament.startDate.getFullYear()
                : undefined
            }
            showSeasonText={showSeasonText}
          />
        ))}
    </div>
  );
}

function TrophyIcon({
  logoUrl,
  tournamentName,
  year,
  showSeasonText,
}: {
  logoUrl: string | null;
  tournamentName: string;
  year?: number;
  showSeasonText: boolean;
}) {
  return (
    <div className="mx-1 flex flex-col items-center">
      <div className="relative">
        <div className="relative h-8 w-8 overflow-hidden rounded-full bg-amber-500">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${tournamentName} Logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
              🏆
            </div>
          )}
        </div>

        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-xs">
          🏆
        </div>
      </div>

      {showSeasonText && year && (
        <div className="mt-1 text-xs font-semibold text-amber-700">{year}</div>
      )}
    </div>
  );
}
