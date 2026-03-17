import { useMemo } from "react";
import { Button, Skeleton } from "@/ui";
import { cn } from "@/lib";
import { TournamentFetchResult } from "convex/types/tournaments";
import { useQuery } from "convex/react";
import { api } from "@/convex";

type ToursToggleItem = {
  _id: string;
  shortForm: string;
  logoUrl?: string | null;
};

/**
 * ToursToggle
 *
 * Renders a responsive list of tour toggle buttons (optionally with tour logos) and reports
 * selection changes via `onChangeTourId`.
 *
 * Data sources:
 * - `api.functions.tours.getTours` for the tournament's season tours.
 *
 * Major render states:
 * - Loading: renders an internal skeleton while tours are being fetched.
 * - Empty: returns `null` when there are no toggles to show.
 * - Ready: renders one button per tour.
 *
 * Behavior notes:
 * - The active tour uses the `default` button variant and a subtle shadow.
 * - Toggle ordering is deterministic:
 *   - First: tours from the DB (preserving their given order).
 *   - Then: `PGA`, `Gold`, `Silver`, `Playoff`/`Playoffs`.
 *   - Finally: any remaining extra toggles in their given order.
 * - When the active tour is not `PGA`, `Gold`, or `Silver`, its logo is inverted for contrast.
 *
 * @param props - Component props.
 * @param props.tournament - Tournament that determines which season's tours are fetched.
 * @param props.activeTourId - Currently selected tour id.
 * @param props.onChangeTourId - Callback invoked when a tour is selected.
 * @param props.extraToggles - Optional extra toggle items appended after base tours.
 * @returns A set of tour toggle buttons, a skeleton while loading, or `null` when empty.
 *
 * @example
 * <ToursToggle
 *   tours={tours}
 *   activeTourId={activeTourId}
 *   onChangeTourId={setActiveTourId}
 *   extraToggles={[{ id: "gold", shortForm: "Gold" }]}
 * />
 */
export function ToursToggle({
  tournament,
  activeTourId,
  onChangeTourId,
  extraToggles,
}: {
  tournament: TournamentFetchResult;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  extraToggles?: ToursToggleItem[];
}) {
  const { combinedToggles, isLoading } = useToursToggle(
    tournament,
    extraToggles,
  );

  if (isLoading) {
    return (
      <ToursToggleSkeleton count={Math.max(3, extraToggles?.length ?? 0)} />
    );
  }

  if (combinedToggles.length === 0) return null;

  return (
    <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
      {combinedToggles.map((tour) => {
        const isActive = tour._id === activeTourId;
        return (
          <Button
            key={tour._id}
            type="button"
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onChangeTourId(tour._id)}
            className={cn("gap-2", isActive && "shadow")}
          >
            {tour.logoUrl ? (
              <img
                src={tour.logoUrl}
                alt={tour.shortForm}
                className={cn(
                  "h-5 w-5 rounded-sm object-contain",
                  isActive &&
                    tour.shortForm !== "PGA" &&
                    tour.shortForm !== "Gold" &&
                    tour.shortForm !== "Silver" &&
                    "invert",
                )}
                loading="lazy"
              />
            ) : null}
            <span className="font-varela text-xs sm:text-sm">
              {tour.shortForm}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Fetches season tours and builds the display-ready list of toggle items.
 */
function useToursToggle(
  tournament: TournamentFetchResult,
  extraToggles?: ToursToggleItem[],
): {
  combinedToggles: ToursToggleItem[];
  isLoading: boolean;
} {
  const tours = useQuery(api.functions.tours.getTours, {
    options: { filter: { seasonId: tournament.seasonId } },
  });
  const isLoading = tours === undefined;

  const combinedToggles = useMemo<ToursToggleItem[]>(() => {
    if (!tours) {
      return [];
    }

    if (
      tournament.tier.name.toLowerCase() === "playoff" &&
      (tours[0]?.playoffSpots.length ?? 0) > 0
    ) {
      return [
        {
          _id: "gold",
          shortForm: "Gold",
          logoUrl:
            "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPHn0reMa1Sl6K8NiXDVstIvkZcpyWUmEoY3xj",
        },
        {
          _id: "silver",
          shortForm: "Silver",
          logoUrl:
            "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPHn0reMa1Sl6K8NiXDVstIvkZcpyWUmEoY3xj",
        },
        ...(extraToggles ?? []),
      ];
    }

    const all = [
      ...tours.map((tour, index) => ({ tour, index })),
      ...(extraToggles ?? []).map((tour, extraIndex) => ({
        tour,
        index: tours.length + extraIndex,
      })),
    ];

    const normalize = (value: string) =>
      value ? value.trim().toLowerCase() : "";
    const playoffLike = (value: string) => normalize(value).includes("playoff");

    const rank = (item: {
      tour: { _id: string; shortForm: string; logoUrl?: string | null };
    }) => {
      const id = normalize(item.tour._id);
      const shortForm = normalize(item.tour.shortForm);

      const isPga = id === "pga" || shortForm === "pga";
      const isGold = id === "gold" || shortForm === "gold";
      const isSilver = id === "silver" || shortForm === "silver";
      const isPlayoffs =
        id === "playoff" || id === "playoffs" || playoffLike(shortForm);

      if (isGold) return 1;
      if (isSilver) return 2;
      if (isPga) return 3;
      if (isPlayoffs) return 4;

      const isDbTour = !isPga && !isGold && !isSilver && !isPlayoffs;
      return isDbTour ? 0 : 5;
    };

    return all
      .slice()
      .sort((a, b) => {
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.index - b.index;
      })
      .map(({ tour }) => tour);
  }, [extraToggles, tournament.tier.name, tours]);

  return { combinedToggles, isLoading };
}

/**
 * Renders button-shaped placeholders while the season tours are loading.
 *
 * @param props - Skeleton props.
 * @param props.count - Number of placeholder toggles to render.
 * @returns A responsive skeleton row that matches the toggle layout.
 */
function ToursToggleSkeleton(props: { count: number }) {
  return (
    <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
      {Array.from({ length: props.count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input px-3",
            index === 0 ? "w-20" : index % 3 === 0 ? "w-28" : "w-24",
          )}
        >
          <Skeleton className="h-5 w-5 rounded-sm" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
