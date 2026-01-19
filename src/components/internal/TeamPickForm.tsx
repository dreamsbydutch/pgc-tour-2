"use client";

import { useCallback, useMemo, useState } from "react";

import { useRouter } from "@tanstack/react-router";

import { Button } from "@/ui";
import { cn, formatMoney } from "@/lib/utils";

import { MemberHeader } from "@/components/internal/MemberHeader";
import { TeamGolfersList } from "@/components/internal/TeamGolfersList";

/**
 * Renders the "Create/Change Your Team" call-to-action for pre-tournament picks.
 *
 * Behavior:
 * - Navigates to `/tournament` with search params for tournament + tour.
 * - Disables the button when opening or when the member has an outstanding balance.
 * - Shows the member's current points/earnings and an optional golfer list.
 *
 * @param props.tournamentId - Tournament id used for navigation.
 * @param props.tourId - Tour id used for navigation.
 * @param props.member - Member used for display and balance checks.
 * @param props.tourCard - Tour card used for ranking/points/earnings display.
 * @param props.existingTeam - Used to choose button label.
 * @param props.teamGolfers - Optional golfers on the member's team.
 * @returns A centered card with summary and a navigation button.
 */
export function TeamPickForm(props: {
  tournamentId: string;
  tourId: string;
  member: {
    displayName?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    account?: number | null;
  };
  tourCard: {
    tourId?: string | null;
    currentPosition?: string | number | null;
    points?: number | null;
    earnings?: number | null;
  };
  existingTeam?: unknown | null;
  teamGolfers?: Array<{
    apiId?: number | null;
    _id?: string | null;
    playerName: string;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }>;
}) {
  const model = useTeamPickForm(props);
  if (!props.tournamentId || !props.tourId) {
    return <TeamPickFormSkeleton />;
  }

  return (
    <div className="mx-auto mb-4 w-fit max-w-4xl rounded-lg border border-slate-400 bg-slate-100 px-6 py-2 text-center shadow-xl">
      <MemberHeader member={props.member} />

      {model.hasBalance ? (
        <div className="mx-auto mb-8 w-5/6 text-center text-lg italic text-red-600">
          {`Please send ${formatMoney(model.accountCents)} to puregolfcollectivetour@gmail.com to unlock your picks.`}
        </div>
      ) : null}

      <div className="text-lg font-bold">
        {`${model.formattedRank} - ${model.pointsDisplay} pts$${model.earningsDisplay}`}
      </div>

      {props.teamGolfers && props.teamGolfers.length > 0 ? (
        <TeamGolfersList golfers={props.teamGolfers} />
      ) : null}

      <Button
        onClick={model.onOpenForm}
        disabled={model.isButtonDisabled}
        variant="default"
        className={cn("mb-4 mt-8 text-xl")}
        size="lg"
      >
        {model.isOpeningForm ? (
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            <span>Loading...</span>
          </div>
        ) : model.hasExistingTeam ? (
          "Change Your Team"
        ) : (
          "Create Your Team"
        )}
      </Button>
    </div>
  );
}

/**
 * Derives UI state and navigation callbacks for `TeamPickForm`.
 *
 * @param props - Inputs for rendering and navigation.
 * @returns Button state, formatted display strings, and an open-form handler.
 */
function useTeamPickForm(props: {
  tournamentId: string;
  tourId: string;
  member: { account?: number | null; currentPosition?: never };
  tourCard: {
    currentPosition?: string | number | null;
    points?: number | null;
    earnings?: number | null;
  };
  existingTeam?: unknown | null;
}) {
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const router = useRouter();

  const onOpenForm = useCallback(() => {
    setIsOpeningForm(true);
    router.navigate({
      to: "/tournament",
      search: {
        tournamentId: props.tournamentId,
        tourId: props.tourId,
        variant: "regular",
      },
    });
  }, [props.tourId, props.tournamentId, router]);

  return useMemo(() => {
    const accountCents = props.member.account ?? 0;
    const hasBalance = accountCents > 0;

    const isButtonDisabled = isOpeningForm || hasBalance;

    const positionRaw = props.tourCard.currentPosition;
    const formattedRank = (() => {
      if (typeof positionRaw === "string") return positionRaw;
      const n = typeof positionRaw === "number" ? positionRaw : NaN;
      if (!Number.isFinite(n) || n <= 0) return "Unranked";

      const suffix = ["th", "st", "nd", "rd"][n % 10] || "th";
      if (n >= 11 && n <= 13) return `${n}th`;
      return `${n}${suffix}`;
    })();

    const pointsDisplay = (() => {
      const points = props.tourCard.points ?? 0;
      return points.toLocaleString();
    })();

    const earningsDisplay =
      props.tourCard.earnings != null && props.tourCard.earnings > 0
        ? ` - ${formatMoney(props.tourCard.earnings)}`
        : "";

    return {
      kind: "ready" as const,
      onOpenForm,
      isOpeningForm,
      hasBalance,
      accountCents,
      isButtonDisabled,
      formattedRank,
      pointsDisplay,
      earningsDisplay,
      hasExistingTeam: Boolean(props.existingTeam),
    };
  }, [
    isOpeningForm,
    onOpenForm,
    props.existingTeam,
    props.member.account,
    props.tourCard.currentPosition,
    props.tourCard.earnings,
    props.tourCard.points,
  ]);
}

/**
 * Loading UI for `TeamPickForm`.
 */
function TeamPickFormSkeleton() {
  return (
    <div className="mx-auto h-40 w-full max-w-4xl rounded-lg bg-slate-100" />
  );
}
