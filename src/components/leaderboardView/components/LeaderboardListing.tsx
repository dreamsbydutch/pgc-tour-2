import * as React from "react";
import { TrophyIcon } from "lucide-react";

import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTournamentLite,
  LeaderboardViewerContext,
} from "../utils/types";
import {
  getLeaderboardRowClass,
  getPositionChangeForTeam,
  isPlayerCut,
} from "../utils/leaderboardUtils";
import { formatToPar } from "../utils/format";
import { PositionChange } from "./UIComponents";
import { ScoreDisplay } from "./ScoreDisplay";
import { PGADropdown, TeamGolfersTable } from "./TableComponents";

type LeaderboardListingProps =
  | {
      type: "PGC";
      tournament: LeaderboardTournamentLite;
      allGolfers: LeaderboardPgaRow[];
      viewer?: LeaderboardViewerContext;
      team: LeaderboardTeamRow;
      isPreTournament?: boolean;
    }
  | {
      type: "PGA";
      tournament: LeaderboardTournamentLite;
      allGolfers: LeaderboardPgaRow[];
      viewer?: LeaderboardViewerContext;
      golfer: LeaderboardPgaRow;
      isPreTournament?: boolean;
    };

export function LeaderboardListing(props: LeaderboardListingProps) {
  const { tournament, viewer } = props;
  const [isOpen, setIsOpen] = React.useState(false);

  const tournamentComplete = (tournament.currentRound ?? 0) > 4;
  const shouldShowPositionChange =
    (((tournament.currentRound ?? 0) === 2 && tournament.livePlay) ?? false) ||
    (tournament.currentRound ?? 0) >= 3;

  const isPga = props.type === "PGA";
  const row = isPga ? props.golfer : props.team;

  const isCut = isPlayerCut(row.position);

  const isUser = (() => {
    if (props.type === "PGA") {
      return !!viewer?.teamGolferApiIds?.includes(props.golfer.apiId);
    }
    return props.team.tourCard.id === (viewer?.tourCardId ?? "");
  })();

  const isFriend =
    props.type === "PGC"
      ? Boolean(
          viewer?.friendIds?.includes(props.team.tourCard.ownerClerkId ?? "") ||
            viewer?.friendIds?.includes(props.team.tourCard.id),
        )
      : false;

  const rowClass = getLeaderboardRowClass({
    type: props.type,
    isCut,
    isUser,
    isFriend,
  });

  const posChange =
    props.type === "PGA"
      ? (props.golfer.posChange ?? 0)
      : getPositionChangeForTeam(props.team);
  const showPosChange = shouldShowPositionChange && !isCut;

  return (
    <div
      onClick={() => setIsOpen((v) => !v)}
      className="mx-auto my-0.5 grid max-w-4xl cursor-pointer grid-flow-row grid-cols-10 rounded-md text-center"
    >
      <div className={rowClass}>
        <div className="col-span-2 flex place-self-center font-varela text-base sm:col-span-5">
          {row.position ?? "-"}
          {showPosChange ? <PositionChange posChange={posChange} /> : null}
        </div>

        <div className="col-span-4 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-10">
          {props.type === "PGA"
            ? props.golfer.playerName
            : props.team.tourCard.displayName}

          {props.type === "PGC" && props.team.championsCount ? (
            <span className="ml-2 inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <TrophyIcon className="h-3 w-3" />
              {props.team.championsCount}
            </span>
          ) : null}
        </div>

        <div className="col-span-2 place-self-center font-varela text-base sm:col-span-5">
          {props.type !== "PGA" && row.position === "CUT"
            ? "-"
            : formatToPar(row.score)}
        </div>

        {props.type === "PGA" ? (
          <ScoreDisplay
            type="PGA"
            row={props.golfer}
            tournamentComplete={tournamentComplete}
          />
        ) : (
          <ScoreDisplay
            type="PGC"
            row={props.team}
            tournamentComplete={tournamentComplete}
          />
        )}
      </div>

      {isOpen && !props.isPreTournament ? (
        <div className="col-span-10 mx-auto mb-2 w-full max-w-4xl rounded-md border border-gray-300 bg-white shadow-md">
          {props.type === "PGA" ? (
            <PGADropdown
              golfer={props.golfer}
              viewerTeamGolferApiIds={viewer?.teamGolferApiIds ?? null}
            />
          ) : (
            <TeamGolfersTable
              team={props.team}
              tournament={tournament}
              allGolfers={props.allGolfers}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
