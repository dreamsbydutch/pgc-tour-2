import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import type { LeaderboardTourToggle } from "../utils/types";

export function ToursToggle({
  tours,
  activeTourId,
  onChangeTourId,
}: {
  tours: LeaderboardTourToggle[];
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
}) {
  return (
    <div className="mx-auto my-4 flex w-full max-w-xl items-center justify-center gap-4">
      {tours.map((tour) => {
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
                className="h-5 w-5 rounded-sm object-contain"
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
