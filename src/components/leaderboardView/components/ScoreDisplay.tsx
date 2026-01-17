import * as React from "react";

import { formatMoneyUsd, formatToPar } from "../utils/format";
import { isPlayerCut } from "../utils/leaderboardUtils";
import type { LeaderboardPgaRow, LeaderboardTeamRow } from "../utils/types";

function ScoreCell({
  value,
  className,
  hiddenOnMobile,
}: {
  value: React.ReactNode;
  className?: string;
  hiddenOnMobile?: boolean;
}) {
  return (
    <div
      className={`place-self-center font-varela text-sm sm:col-span-2 ${className ?? ""} ${
        hiddenOnMobile ? "hidden sm:flex" : ""
      }`}
    >
      {value}
    </div>
  );
}

export function ScoreDisplay(
  props:
    | { type: "PGA"; row: LeaderboardPgaRow; tournamentComplete: boolean }
    | { type: "PGC"; row: LeaderboardTeamRow; tournamentComplete: boolean },
) {
  const tournamentComplete = props.tournamentComplete;

  if (props.type === "PGA") {
    const row = props.row;
    const cutOrWithdrawn = isPlayerCut(row.position);

    if (cutOrWithdrawn) {
      return (
        <>
          <ScoreCell
            value={row.group === 0 ? "-" : (row.group ?? "-")}
            className="col-span-1 sm:col-span-2"
          />
          <ScoreCell
            value={row.rating ?? "-"}
            className="col-span-1 sm:col-span-2"
          />
          <div className="col-span-1 hidden sm:flex" />
          <ScoreCell
            value={row.roundOne ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundTwo ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundThree ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundFour ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
        </>
      );
    }

    if (tournamentComplete) {
      const firstValue = row.group === 0 ? "-" : (row.group ?? "-");
      const secondValue = row.rating ?? "-";

      return (
        <>
          <ScoreCell value={firstValue} className="col-span-1 sm:col-span-2" />
          <ScoreCell
            value={secondValue}
            className="col-span-1 whitespace-nowrap sm:col-span-2"
          />
          <div className="col-span-1 hidden sm:flex" />
          <ScoreCell
            value={row.roundOne ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundTwo ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundThree ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundFour ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
        </>
      );
    }

    if (!row.thru || row.thru === 0) {
      return (
        <>
          <div className="col-span-2 place-self-center font-varela text-xs">
            {row.teeTimeDisplay ?? "-"}
            {row.endHole === 9 ? "*" : ""}
          </div>
          <div className="col-span-1 hidden sm:flex" />
          <ScoreCell
            value={row.roundOne ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundTwo ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundThree ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundFour ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
        </>
      );
    }

    return (
      <>
        <ScoreCell
          value={formatToPar(row.today)}
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={row.thru === 18 ? "F" : row.thru}
          className="col-span-1 sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={row.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  const row = props.row;
  const cutOrWithdrawn = isPlayerCut(row.position);

  if (cutOrWithdrawn) {
    return (
      <>
        <ScoreCell value={"-"} className="col-span-1 sm:col-span-2" />
        <ScoreCell value={"-"} className="col-span-1 sm:col-span-2" />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={row.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  if (tournamentComplete) {
    const firstValue = row.points === 0 ? "-" : (row.points ?? "-");
    const secondValue = formatMoneyUsd(row.earnings ?? null);

    return (
      <>
        <ScoreCell value={firstValue} className="col-span-1 sm:col-span-2" />
        <ScoreCell
          value={secondValue}
          className="col-span-1 whitespace-nowrap sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={row.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  if (!row.thru || row.thru === 0) {
    return (
      <>
        <div className="col-span-2 place-self-center font-varela text-xs">
          {row.teeTimeDisplay ?? "-"}
        </div>
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={row.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  return (
    <>
      <ScoreCell
        value={formatToPar(row.today)}
        className="col-span-1 sm:col-span-2"
      />
      <ScoreCell
        value={row.thru === 18 ? "F" : row.thru}
        className="col-span-1 sm:col-span-2"
      />
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={row.roundOne ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundTwo ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundThree ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundFour ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
    </>
  );
}
