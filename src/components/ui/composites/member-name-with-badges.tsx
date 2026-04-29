"use client";

import { cn, isNonEmptyString } from "@/lib";
import type { MajorChampionBadge } from "@/hooks";

export function MemberNameWithBadges(props: {
  name: string;
  badges?: MajorChampionBadge[] | null;
  className?: string;
  nameClassName?: string;
  badgeClassName?: string;
}) {
  const visibleBadges = (props.badges ?? []).filter((badge) =>
    isNonEmptyString(badge.logoUrl),
  );

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1",
        props.className,
      )}
    >
      <span className={props.nameClassName}>{props.name}</span>
      {visibleBadges.map((badge) => (
        <img
          key={badge.tournamentId}
          src={badge.logoUrl!}
          alt={`${badge.tournamentName} champion`}
          title={`${badge.tournamentName} champion`}
          className={cn(
            "h-[1em] w-auto shrink-0 object-contain",
            props.badgeClassName,
          )}
          loading="lazy"
        />
      ))}
    </span>
  );
}
