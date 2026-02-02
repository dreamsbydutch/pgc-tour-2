"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/ui";
import { cn, formatMoney } from "@/lib";

import { MemberHeader, TeamGolfersList } from "@/displays";
import { TournamentTeamPickerDialog } from "@/widgets";

/**
 * Renders the "Create/Change Your Team" call-to-action for pre-tournament picks.
 *
 * Behavior:
 * - Opens a modal team picker for the active tournament.
 * - Disables the button when opening or when the member has an outstanding balance.
 * - Shows the member's current points/earnings and an optional golfer list.
 *
 * @param props.tournamentId - Tournament id used for navigation.
 * @param props.member - Member used for display and balance checks.
 * @param props.tourCard - Tour card used for ranking/points/earnings display.
 * @param props.existingTeam - Used to choose button label.
 * @param props.teamGolfers - Optional golfers on the member's team.
 * @returns A centered card with summary and a navigation button.
 */
export function TeamPickForm(props: {
  tournamentId: string;
  member: {
    displayName?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    account?: number | null;
  };
  tourCard: {
    _id: string;
    tourId?: string | null;
    currentPosition?: string | number | null;
    points?: number | null;
    earnings?: number | null;
  };
  existingTeam?: { _id: string; golferIds?: number[] | null } | null;
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
  if (!props.tournamentId || !props.tourCard._id) {
    return <TeamPickFormSkeleton />;
  }

  return (
    <div className="mx-auto mb-4 w-fit max-w-4xl rounded-lg border border-slate-400 bg-slate-100 px-6 py-2 text-center shadow-xl">
      <MemberHeader member={props.member} />

      {model.hasBalance ? (
        <div className="mx-auto mb-8 w-5/6 text-center text-lg italic text-red-600">
          {`You currently owe ${formatMoney(model.accountCents)}. Pay your balance by sending payment to puregolfcollectivetour@gmail.com before the start of the next tournament to make picks.`}
        </div>
      ) : null}

      <div className="text-lg font-bold">
        {`${model.formattedRank} - ${model.pointsDisplay} pts${model.earningsDisplay}`}
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
        {model.hasExistingTeam ? "Change Your Team" : "Create Your Team"}
      </Button>

      <TournamentTeamPickerDialog
        open={model.isPickerOpen}
        onOpenChange={model.onOpenChange}
        tournamentId={props.tournamentId}
        tourCardId={props.tourCard._id}
        existingTeamId={props.existingTeam?._id ?? null}
        existingGolferIds={props.existingTeam?.golferIds ?? null}
      />
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
  member: { account?: number | null; currentPosition?: never };
  tourCard: {
    currentPosition?: string | number | null;
    points?: number | null;
    earnings?: number | null;
  };
  existingTeam?: { _id: string; golferIds?: number[] | null } | null;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const onOpenForm = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  return useMemo(() => {
    const accountCents = props.member.account ?? 0;
    const hasBalance = accountCents < 0;
    const balanceCents = Math.abs(accountCents);

    const isButtonDisabled = hasBalance;

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
      hasBalance,
      accountCents: balanceCents,
      isButtonDisabled,
      formattedRank,
      pointsDisplay,
      earningsDisplay,
      hasExistingTeam: Boolean(props.existingTeam),
      isPickerOpen,
      onOpenChange: setIsPickerOpen,
    };
  }, [
    onOpenForm,
    props.existingTeam,
    props.member.account,
    props.tourCard.currentPosition,
    props.tourCard.earnings,
    props.tourCard.points,
    isPickerOpen,
    setIsPickerOpen,
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
