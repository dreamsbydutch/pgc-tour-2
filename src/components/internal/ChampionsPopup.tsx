import { Link } from "@tanstack/react-router";
import {
  capitalize,
  formatScore,
  hasItems,
  isNonEmptyString,
} from "@/lib/utils";
import { Skeleton } from "@/ui";

/**
 * Displays the champions of the most recent tournament.
 *
 * Render behavior:
 * - Returns `null` when `champs` is empty, `tournament` is missing, or the tournament tier is playoff.
 * - Optionally renders a loading skeleton when `loading` is true.
 * - Otherwise shows the tournament header and one clickable section per champion.
 *
 * Each champion section links to the tournament leaderboard filtered by the champion's tour.
 * Golfers are displayed in ascending score order, and special positions (CUT/WD/DQ) are shown as-is.
 *
 * @param props.champs Champions to display.
 * @param props.tournament Tournament info for the header and playoff gating.
 * @param props.loading Whether to render a loading skeleton.
 * @returns Champions popup UI or `null`.
 */
export function ChampionsPopup(props: {
  champs?: {
    id: number;
    displayName: string;
    score: number;
    tournament: {
      id: string;
      name: string;
      logoUrl: string | null;
      startDate: Date;
      currentRound: number | null;
      tier?: { name?: string };
    };
    tour: { id: string; name: string; logoUrl: string | null };
    golfers: {
      id: number;
      position: string;
      playerName: string;
      score: number;
    }[];
  }[];
  tournament?: {
    id: string;
    name: string;
    logoUrl: string | null;
    startDate: Date;
    currentRound: number | null;
    tier?: { name?: string };
  };
  loading?: boolean;
}) {
  const model = useChampionsPopup(props);
  if (model.status === "loading") return <ChampionsPopupSkeleton />;
  if (model.status === "hidden") return null;

  return (
    <div className="mx-auto my-3 rounded-2xl bg-amber-100 bg-opacity-70 shadow-lg md:w-10/12 lg:w-7/12">
      <div className="mx-auto max-w-3xl p-2 text-center">
        <h1 className="flex items-center justify-center px-3 py-2 text-2xl font-bold sm:text-3xl md:text-4xl">
          {isNonEmptyString(model.tournament.logoUrl) && (
            <img
              alt={`${model.tournament.name} Logo`}
              src={model.tournament.logoUrl}
              className="h-24 w-24 object-contain"
              width={128}
              height={128}
            />
          )}
          {model.tournament.name} Champions
        </h1>

        {model.champs.map((champ) => (
          <Link
            key={champ.id}
            to="/tournament"
            search={{
              tournamentId: champ.tournamentId,
              tourId: champ.tourId,
              variant: "regular",
            }}
            className="block transition-colors duration-200 hover:bg-amber-50"
          >
            <div className="mx-auto w-11/12 border-b border-slate-800" />
            <div className="py-2">
              <div className="mb-2 flex items-center justify-center gap-4">
                {isNonEmptyString(champ.tourLogoUrl) && (
                  <img
                    alt={`${champ.tourName || "Tour"} Logo`}
                    src={champ.tourLogoUrl}
                    className="h-12 w-12 object-contain"
                    width={128}
                    height={128}
                  />
                )}
                <div className="flex gap-2 text-xl font-semibold">
                  {capitalize(champ.displayName)}
                </div>
                <div className="text-lg font-semibold">
                  {formatScore(champ.score)}
                </div>
              </div>

              <div className="mx-auto my-1 grid w-5/6 grid-cols-2 items-center justify-center gap-x-8 gap-y-1">
                {hasItems(champ.golfers) &&
                  champ.golfers.map((golfer) => (
                    <div
                      key={golfer.id}
                      className="grid grid-cols-8 items-center justify-center"
                    >
                      <div className="col-span-1 text-xs">
                        {golfer.position}
                      </div>
                      <div className="col-span-6 text-xs">
                        {golfer.playerName}
                      </div>
                      <div className="text-xs">
                        {golfer.specialPosition
                          ? golfer.position
                          : formatScore(golfer.score)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Composes a view-model for `ChampionsPopup`.
 *
 * @param args.champs Champions list.
 * @param args.tournament Tournament metadata.
 * @param args.loading Loading flag.
 * @returns A discriminated model that drives render states.
 */
function useChampionsPopup(args: {
  champs?: {
    id: number;
    displayName: string;
    score: number;
    tournament: {
      id: string;
      name: string;
      logoUrl: string | null;
      startDate: Date;
      currentRound: number | null;
      tier?: { name?: string };
    };
    tour: { id: string; name: string; logoUrl: string | null };
    golfers: {
      id: number;
      position: string;
      playerName: string;
      score: number;
    }[];
  }[];
  tournament?: {
    id: string;
    name: string;
    logoUrl: string | null;
    startDate: Date;
    currentRound: number | null;
    tier?: { name?: string };
  };
  loading?: boolean;
}) {
  type Model =
    | { status: "loading" }
    | { status: "hidden" }
    | {
        status: "ready";
        tournament: NonNullable<typeof args.tournament>;
        champs: Array<{
          id: number;
          displayName: string;
          score: number;
          tournamentId: string;
          tourId: string;
          tourName: string;
          tourLogoUrl: string | null;
          golfers: Array<{
            id: number;
            position: string;
            playerName: string;
            score: number;
            specialPosition: boolean;
          }>;
        }>;
      };

  if (args.loading) return { status: "loading" } as const satisfies Model;
  if (!hasItems(args.champs))
    return { status: "hidden" } as const satisfies Model;
  if (!args.tournament) return { status: "hidden" } as const satisfies Model;
  if (args.tournament.tier?.name?.toLowerCase() === "playoff") {
    return { status: "hidden" } as const satisfies Model;
  }

  const champs = args.champs.map((champ) => {
    const golfers = hasItems(champ.golfers)
      ? [...champ.golfers]
          .sort((a, b) => a.score - b.score)
          .map((g) => ({
            ...g,
            specialPosition: ["CUT", "WD", "DQ"].includes(g.position ?? ""),
          }))
      : [];

    return {
      id: champ.id,
      displayName: champ.displayName,
      score: champ.score,
      tournamentId: champ.tournament.id,
      tourId: champ.tour.id,
      tourName: champ.tour.name,
      tourLogoUrl: champ.tour.logoUrl,
      golfers,
    };
  });

  return {
    status: "ready",
    tournament: args.tournament,
    champs,
  } as const satisfies Model;
}

/**
 * Loading UI for `ChampionsPopup`.
 */
function ChampionsPopupSkeleton() {
  return (
    <div className="mx-auto my-3 rounded-2xl bg-amber-100 bg-opacity-70 shadow-lg md:w-10/12 lg:w-7/12">
      <div className="mx-auto max-w-3xl p-2 text-center">
        <div className="flex items-center justify-center gap-3 px-3 py-2">
          <Skeleton className="h-24 w-24 rounded-xl" />
          <Skeleton className="h-10 w-64 max-w-[70vw]" />
        </div>
        <div className="space-y-3">
          <Skeleton className="mx-auto h-24 w-11/12 rounded-xl" />
          <Skeleton className="mx-auto h-24 w-11/12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
