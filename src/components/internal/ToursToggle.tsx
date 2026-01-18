import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ToursToggleProps } from "@/lib/types";
import { useMemo } from "react";

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
 * - `loading`: returns the local skeleton UI.
 * - No tours/extras: returns `null`.
 * - Otherwise: renders one button per tour.
 *
 * Behavior notes:
 * - The active tour uses the `default` button variant and a subtle shadow.
 * - `sort` controls alphabetic sorting of the main `tours` list by `shortForm`.
 * - `extraToggles` are appended after the base list and ordered to prefer `Gold`, `Silver`, then `PGA`.
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
  sort = true,
  loading = false,
}: ToursToggleProps) {
  if (loading) {
    return <ToursToggleSkeleton />;
  }

  const { combinedToggles } = useToursToggle({ tours, extraToggles, sort });

  if (combinedToggles.length === 0) return null;

  return (
    <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
      {combinedToggles.map((tour) => {
        const isActive = tour.id === activeTourId;

        return (
          <Button
            key={tour.id}
            type="button"
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onChangeTourId(tour.id)}
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
 *
 * This hook is responsible for shaping the input lists into a single array used by the UI.
 * It handles sorting of base tours, a deterministic ordering for common “extra” toggles
 * (`Gold`, `Silver`, `PGA`), and preserves the original order for unknown extras.
 *
 * @param input - Hook inputs.
 * @param input.tours - Base tours that can be optionally sorted.
 * @param input.extraToggles - Optional extra toggle items appended after base tours.
 * @param input.sort - Whether to sort base tours by `shortForm`.
 * @returns An object containing `combinedToggles`, the final ordered list.
 */
function useToursToggle({
  tours,
  extraToggles,
  sort,
}: Pick<ToursToggleProps, "tours" | "extraToggles" | "sort">) {
  const baseToggles = useMemo(() => {
    if (!sort) return tours;
    return tours.slice().sort((a, b) => a.shortForm.localeCompare(b.shortForm));
  }, [sort, tours]);

  const sortedExtras = useMemo(() => {
    const getExtraSortOrder = (shortForm: string) => {
      if (shortForm === "Gold") return 0;
      if (shortForm === "Silver") return 1;
      if (shortForm === "PGA") return 2;
      return 999;
    };

    const extras = extraToggles ?? [];
    return extras
      .map((tour, index) => ({ tour, index }))
      .sort((a, b) => {
        return (
          getExtraSortOrder(a.tour.shortForm) -
            getExtraSortOrder(b.tour.shortForm) || a.index - b.index
        );
      })
      .map(({ tour }) => tour);
  }, [extraToggles]);

  const combinedToggles = useMemo(() => {
    return [...baseToggles, ...sortedExtras];
  }, [baseToggles, sortedExtras]);

  return { combinedToggles };
}

/**
 * Lightweight loading state for `ToursToggle`.
 */
function ToursToggleSkeleton() {
  return (
    <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
      <Skeleton className="h-9 w-28 rounded-md" />
      <Skeleton className="h-9 w-28 rounded-md" />
      <Skeleton className="h-9 w-28 rounded-md" />
    </div>
  );
}
