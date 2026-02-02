import type { ReactNode } from "react";

import { cn } from "@/lib";

/**
 * Renders the standings table header row for both regular tours and playoffs.
 *
 * This is presentational-only: it does not read router/auth/data hooks.
 * Callers provide any interactive UI (like the friends-only toggle) via slots.
 *
 * @param props.variant - Controls styling and optional title copy.
 * @param props.friendsOnlyToggle - Slot rendered in the far-right column.
 * @param props.playoffDetails - Optional content shown beneath the playoff title.
 * @returns A responsive grid header matching standings listing rows.
 */
export function StandingsTableHeader(props: {
  variant: "regular" | "gold" | "silver" | "bumped";
  friendsOnlyToggle: ReactNode;
  playoffDetails?: ReactNode;
}) {
  const title =
    props.variant === "gold"
      ? "PGC GOLD PLAYOFF"
      : props.variant === "silver"
        ? "PGC SILVER PLAYOFF"
        : props.variant === "bumped"
          ? "KNOCKED OUT"
          : null;

  const wrapperClass =
    props.variant === "gold"
      ? "mt-4 rounded-xl bg-gradient-to-b from-yellow-200"
      : props.variant === "silver"
        ? "mt-12 rounded-xl bg-gradient-to-b from-zinc-300"
        : props.variant === "bumped"
          ? "mt-12 rounded-xl bg-gradient-to-b from-red-200 text-red-900"
          : "";

  const titleTextClass =
    props.variant === "gold"
      ? "text-yellow-900"
      : props.variant === "silver"
        ? "text-zinc-600"
        : props.variant === "bumped"
          ? "text-red-900"
          : "";

  return (
    <div
      className={cn(
        "grid grid-flow-row grid-cols-16 text-center",
        wrapperClass,
        props.variant === "regular" && "text-slate-700",
      )}
    >
      {title && props.variant !== "regular" ? (
        props.playoffDetails &&
        (props.variant === "gold" || props.variant === "silver") ? (
          <details className="col-span-16">
            <summary
              className={cn(
                "col-span-16 my-2 cursor-pointer list-none font-varela text-2xl font-extrabold",
                titleTextClass,
              )}
            >
              {title}
            </summary>
            <div className="mx-auto w-full max-w-xl px-2 pb-3">
              {props.playoffDetails}
            </div>
          </details>
        ) : (
          <div
            className={cn(
              "col-span-16 my-2 font-varela text-2xl font-extrabold",
              titleTextClass,
            )}
          >
            {title}
          </div>
        )
      ) : null}

      <div
        className={cn(
          "col-span-2 place-self-center font-varela text-xs font-bold sm:text-sm",
          props.variant !== "regular" && titleTextClass,
        )}
      >
        Rank
      </div>
      <div
        className={cn(
          "col-span-7 place-self-center font-varela text-base font-bold sm:text-lg",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-5 sm:col-span-5"
            : "sm:col-span-5",
        )}
      >
        Name
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-xs font-bold xs:text-sm sm:text-base",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-2 sm:col-span-2"
            : "sm:col-span-2",
        )}
      >
        Cup Points
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-2xs xs:text-xs sm:text-sm",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-2 sm:col-span-2"
            : "sm:col-span-2",
        )}
      >
        {props.variant === "gold" || props.variant === "silver"
          ? "Starting Strokes"
          : "Earnings"}
      </div>

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-2 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Earnings
        </div>
      ) : null}

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Wins
        </div>
      ) : null}

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Top 10
        </div>
      ) : null}

      {props.variant === "regular" ? (
        <>
          <div className="col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Wins
          </div>
          <div className="col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Top 10
          </div>
          <div className="col-span-2 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Cuts
          </div>
        </>
      ) : null}

      <div className="col-span-1 place-self-center overflow-x-clip">
        {props.friendsOnlyToggle}
      </div>
    </div>
  );
}
