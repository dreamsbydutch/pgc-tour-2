"use client";

import { useEffect, useMemo, useState } from "react";

import { TeamPickForm } from "./TeamPickForm";
import { Button, Skeleton } from "@/ui";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "@/lib/constants";
import { isPlayoffTournament } from "@/lib/utils";
import { TournamentCountdown } from "@/displays";

/**
 * Renders the pre-tournament pick experience.
 *
 * Major states:
 * - Missing tournament/startDate: renders a skeleton.
 * - Picks closed: shows a simple message.
 * - Not signed in (missing `member`/`tourCard`): prompts sign-in.
 * - Regular event: shows the team pick form.
 * - Playoff event:
 *   - If ineligible: shows an ineligible message.
 *   - If eligible: shows the team pick form until the carry-over lock applies.
 *
 * Notes:
 * - This component does not fetch; it relies on the parent route to provide data.
 * - The navigation to `/tournament` happens inside `TeamPickForm`.
 *
 * @param props.tournament - Tournament data including `startDate` and (optionally) tier.
 * @param props.member - Current member (required to pick a team).
 * @param props.tourCard - Current tour card (required to pick a team).
 * @param props.existingTeam - The member's existing team (if any).
 * @param props.teamGolfers - Golfers on the member's existing team (optional).
 * @param props.playoffEventIndex - 1-based playoff event index in the season (defaults to 0).
 * @returns The pre-tournament content UI.
 */
export function PreTournamentContent(props: {
  tournament:
    | {
        _id: string;
        name: string;
        startDate: number;
        logoUrl?: string | null;
        tier?: { name?: string | null } | null;
      }
    | null
    | undefined;
  member:
    | {
        displayName?: string | null;
        firstname?: string | null;
        lastname?: string | null;
        email?: string | null;
        account?: number | null;
      }
    | null
    | undefined;
  tourCard:
    | {
        _id: string;
        tourId: string;
        playoff?: number | null;
        currentPosition?: string | number | null;
        points?: number | null;
        earnings?: number | null;
      }
    | null
    | undefined;
  existingTeam?: { golferIds?: number[] | null } | null;
  teamGolfers?: Array<{
    apiId?: number | null;
    _id?: string | null;
    playerName: string;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }> | null;
  playoffEventIndex?: number;
}) {
  const tourney = props.tournament
    ? {
        name: props.tournament.name,
        startDate: props.tournament.startDate,
        logoUrl: props.tournament.logoUrl,
      }
    : undefined;

  const model = usePreTournamentContent(props);

  if (model.kind === "loading") {
    return <PreTournamentContentSkeleton />;
  }

  if (model.kind === "picksClosed") {
    return <TournamentCountdown tourney={tourney} />;
  }

  if (model.kind === "mustSignIn") {
    return (
      <div className="text-center">
        <p className="font-medium text-red-800">
          Please sign in to pick a team.
        </p>
        <Button
          onClick={() => (window.location.href = "/sign-in")}
          variant="outline"
          className="mt-4"
        >
          Sign In
        </Button>
      </div>
    );
  }

  if (model.kind === "ineligiblePlayoffs") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <p className="font-medium text-red-800">
          You did not qualify for the {model.tierName}.
        </p>
      </div>
    );
  }

  if (model.kind === "carryOverLocked") {
    return <TournamentCountdown tourney={tourney} />;
  }

  return (
    <div>
      <TeamPickForm
        tournamentId={model.tournamentId}
        tourId={model.tourId}
        member={model.member}
        tourCard={model.tourCard}
        existingTeam={props.existingTeam}
        teamGolfers={props.teamGolfers ?? undefined}
      />
    </div>
  );
}

/**
 * Builds derived UI state for the pre-tournament content.
 *
 * @param props - Inputs required to decide which message or form to show.
 * @returns A discriminated union describing the render state.
 */
function usePreTournamentContent(props: {
  tournament:
    | {
        _id: string;
        name: string;
        startDate: number;
        tier?: { name?: string | null } | null;
      }
    | null
    | undefined;
  member:
    | {
        displayName?: string | null;
        firstname?: string | null;
        lastname?: string | null;
        email?: string | null;
        account?: number | null;
      }
    | null
    | undefined;
  tourCard:
    | {
        _id: string;
        tourId: string;
        playoff?: number | null;
        currentPosition?: string | number | null;
        points?: number | null;
        earnings?: number | null;
      }
    | null
    | undefined;
  existingTeam?: { golferIds?: number[] | null } | null;
  playoffEventIndex?: number;
}) {
  const [isPreTournament, setIsPreTournament] = useState(false);

  useEffect(() => {
    if (!props.tournament?.startDate) return;

    const msUntilStart = props.tournament.startDate - Date.now();
    setIsPreTournament(msUntilStart <= PRE_TOURNAMENT_PICK_WINDOW_MS);
  }, [props.tournament?.startDate]);

  return useMemo(() => {
    if (!props.tournament?.startDate) {
      return { kind: "loading" as const };
    }

    if (!isPreTournament) {
      return { kind: "picksClosed" as const };
    }

    if (!props.member || !props.tourCard) {
      return { kind: "mustSignIn" as const };
    }

    const isPlayoff = isPlayoffTournament({
      tierName: props.tournament.tier?.name ?? null,
      tournamentName: props.tournament.name,
    });

    if (!isPlayoff) {
      return {
        kind: "ready" as const,
        tournamentId: props.tournament._id,
        tourId: props.tourCard.tourId,
        member: props.member,
        tourCard: props.tourCard,
      };
    }

    const hasPlayoffData = typeof props.tourCard.playoff === "number";
    const isEligibleForPlayoffs = (props.tourCard.playoff ?? 0) >= 1;

    if (hasPlayoffData && !isEligibleForPlayoffs) {
      return {
        kind: "ineligiblePlayoffs" as const,
        tierName: props.tournament.tier?.name ?? "Playoffs",
      };
    }

    const isLaterPlayoff = (props.playoffEventIndex ?? 0) > 1;
    const hasEmptyTeam = !props.existingTeam?.golferIds?.length;

    if (isLaterPlayoff && !hasEmptyTeam) {
      return { kind: "carryOverLocked" as const };
    }

    return {
      kind: "ready" as const,
      tournamentId: props.tournament._id,
      tourId: props.tourCard.tourId,
      member: props.member,
      tourCard: props.tourCard,
    };
  }, [
    isPreTournament,
    props.existingTeam?.golferIds,
    props.member,
    props.playoffEventIndex,
    props.tourCard,
    props.tournament,
  ]);
}

/**
 * Loading UI for `PreTournamentContent`.
 */
function PreTournamentContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
