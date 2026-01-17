"use client";

import { useMemo, useEffect, useState } from "react";
import { TeamPickForm } from "./TeamPickForm";
import { Button } from "../ui/button";
import type { PreTournamentContentProps } from "./utils/types";
import {
  isPlayoffTournament,
  isPlayoffEligible,
  arePicksOpen,
  isTeamEmpty,
} from "./utils";

export function PreTournamentContent({
  tournament,
  member,
  tourCard,
  existingTeam,
  teamGolfers,
  playoffEventIndex = 0,
}: PreTournamentContentProps) {
  const [isPreTournament, setIsPreTournament] = useState(false);

  useEffect(() => {
    if (tournament?.startDate) {
      setIsPreTournament(arePicksOpen(tournament.startDate));
    }
  }, [tournament?.startDate]);

  const isPlayoff = useMemo(
    () => (tournament ? isPlayoffTournament(tournament) : false),
    [tournament],
  );

  const isEligibleForPlayoffs = useMemo(
    () => isPlayoffEligible(tourCard),
    [tourCard],
  );

  const hasEssentials = isPreTournament && !!tourCard && !!member;
  const hasPlayoffData = typeof tourCard?.playoff === "number";
  const isLaterPlayoff = isPlayoff && playoffEventIndex > 1;
  const hasEmptyTeam = isTeamEmpty(existingTeam || null);

  if (!tournament || !tournament.startDate) {
    return <div>Loading tournament information...</div>;
  }

  if (!isPreTournament) {
    return (
      <div className="text-center">
        Picks are closed for this tournament. Please check back later.
      </div>
    );
  }

  if (!hasEssentials) {
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

  if (!isPlayoff) {
    return (
      <div>
        <TeamPickForm
          tournament={tournament}
          tourCard={tourCard}
          member={member}
          existingTeam={existingTeam}
          teamGolfers={teamGolfers}
        />
      </div>
    );
  }

  if (hasPlayoffData && !isEligibleForPlayoffs) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <p className="font-medium text-red-800">
          You did not qualify for the {tournament.tier?.name ?? "Playoffs"}.
        </p>
      </div>
    );
  }

  if (!isLaterPlayoff) {
    return (
      <div>
        <TeamPickForm
          tournament={tournament}
          tourCard={tourCard}
          member={member}
          existingTeam={existingTeam}
          teamGolfers={teamGolfers}
        />
      </div>
    );
  }

  if (hasEmptyTeam) {
    return (
      <div>
        <TeamPickForm
          tournament={tournament}
          tourCard={tourCard}
          member={member}
          existingTeam={existingTeam}
          teamGolfers={teamGolfers}
        />
      </div>
    );
  }

  if (!hasEmptyTeam) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
        <p className="font-medium text-yellow-800">
          Picks are closed for this playoff event. Your team carried over from
          the first playoff.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-yellow-50 p-4 text-center">
      <p className="font-medium text-yellow-800">
        How did you even get here? This should never be displayed.
      </p>
    </div>
  );
}
