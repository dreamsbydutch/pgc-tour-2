"use client";

import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { MemberHeader } from "./MemberHeader";
import { TeamGolfersList } from "./TeamGolfersList";
import type { TeamPickFormProps } from "./utils/types";
import {
  formatMoney,
  formatRank,
  formatPoints,
  hasOutstandingBalance,
} from "./utils";

export function TeamPickForm({
  tournament,
  tourCard,
  member,
  existingTeam,
  teamGolfers,
}: TeamPickFormProps) {
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const router = useRouter();

  const handleOpenForm = () => {
    setIsOpeningForm(true);
    router.navigate({
      to: "/tournament",
      search: {
        tournamentId: tournament._id,
        tourId: tourCard.tourId,
        variant: "regular",
      },
    });
  };

  const hasBalance = hasOutstandingBalance(member);
  const isButtonDisabled = isOpeningForm || hasBalance;

  const position = tourCard?.currentPosition || "Unranked";
  const formattedRank =
    typeof position === "string" ? position : formatRank(Number(position));

  return (
    <div className="mx-auto mb-4 w-fit max-w-4xl rounded-lg border border-slate-400 bg-slate-100 px-6 py-2 text-center shadow-xl">
      <MemberHeader member={member} />

      {hasBalance && (
        <div className="mx-auto mb-8 w-5/6 text-center text-lg italic text-red-600">
          {`Please send ${formatMoney(member?.account ?? 0)} to puregolfcollectivetour@gmail.com to unlock your picks.`}
        </div>
      )}

      <div className="text-lg font-bold">
        {`${formattedRank} - ${formatPoints(tourCard?.points ?? 0)} pts${
          tourCard?.earnings ? " - " + formatMoney(tourCard?.earnings ?? 0) : ""
        }`}
      </div>

      {teamGolfers && teamGolfers.length > 0 && (
        <TeamGolfersList golfers={teamGolfers} />
      )}

      <Button
        onClick={handleOpenForm}
        disabled={isButtonDisabled}
        variant="default"
        className="mb-4 mt-8 text-xl"
        size="lg"
      >
        {isOpeningForm ? (
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
            <span>Loading...</span>
          </div>
        ) : existingTeam ? (
          "Change Your Team"
        ) : (
          "Create Your Team"
        )}
      </Button>
    </div>
  );
}
