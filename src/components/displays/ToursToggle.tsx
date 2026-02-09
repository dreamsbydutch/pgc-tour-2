import { useMemo } from "react";

import { Button } from "@/ui";
import { cn } from "@/lib";

/**
 * ToursToggle
 *
 * Renders a responsive list of tour toggle buttons (optionally with tour logos) and reports
 * selection changes via `onChangeTourId`.
 *
 * Data sources:
 * - None. This is a pure presentational component; fetch/compose tours upstream.
 *
 * Major render states:
 * - No tours/extras: returns `null`.
 * - Otherwise: renders one button per tour.
 *
 * Behavior notes:
 * - The active tour uses the `default` button variant and a subtle shadow.
 * - Toggle ordering is deterministic:
 *   - First: tours from the DB (`props.tours`, preserving their given order).
 *   - Then: `PGA`, `Gold`, `Silver`, `Playoff`/`Playoffs`.
 *   - Finally: any remaining extra toggles in their given order.
 * - `sort` (when true) alphabetically sorts only the DB-tour group by `shortForm`.
 * - When the active tour is not `PGA`, `Gold`, or `Silver`, its logo is inverted for contrast.
 *
 * @param props - Component props.
 * @param props.tours - Base set of tours to toggle between.
 * @param props.activeTourId - Currently selected tour id.
 * @param props.onChangeTourId - Callback invoked when a tour is selected.
 * @param props.extraToggles - Optional extra toggle items appended after base tours.
 * @param props.sort - Whether to sort base tours by `shortForm` (default: `true`).
 * @param props.loading - Whether to render a skeleton state (default: `false`).
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
  tours,
  activeTourId,
  onChangeTourId,
  extraToggles,
}: {
  tours: {
    _id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  extraToggles?: {
    _id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
}) {
  const { combinedToggles } = useToursToggle({ tours, extraToggles });

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
 * Builds a combined, display-ready list of tour toggle items.
 */
function useToursToggle({
  tours,
  extraToggles,
}: {
  tours: {
    _id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
  extraToggles?: {
    _id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
}) {
  const combinedToggles = useMemo(() => {
    const all = [
      ...tours.map((tour, index) => ({ tour, index })),
      ...(extraToggles ?? []).map((tour, extraIndex) => ({
        tour,
        index: tours.length + extraIndex,
      })),
    ];

    const normalize = (value: string) => value.trim().toLowerCase();
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

      if (isPga) return 1;
      if (isGold) return 2;
      if (isSilver) return 3;
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
  }, [extraToggles, tours]);

  return { combinedToggles };
}
