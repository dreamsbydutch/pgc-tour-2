import { useMemo } from "react";

import { useUser } from "@clerk/tanstack-react-start";
import { api, useQuery } from "@/convex";

import {
  LeaderboardHeader,
  LeaderboardView,
  PreTournamentContent,
} from "@/facilitators";
import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTourToggle,
  LeaderboardVariant,
  LeaderboardViewModel,
} from "@/lib";
import { findDocByStringId, selectDefaultTournament } from "@/lib";
import type { EnhancedTournamentDoc } from "convex/types/types";

/**
 * Renders the `/tournament` screen.
 *
 * This component is fed by route search params and is responsible for:
 * - Fetching the tournament list and selecting a reasonable default tournament.
 * - Fetching the tournament leaderboard view model from Convex.
 * - Deriving the effective leaderboard variant (regular/playoff/historical) and tour toggle.
 * - Rendering `LeaderboardHeader` and `LeaderboardView` across loading/error/ready states.
 *
 * Data sources:
 * - `api.functions.tournaments.getTournaments` (tournament list)
 * - `api.functions.tournaments.getTournamentLeaderboardView` (leaderboard payload)
 *
 * Major render states:
 * - Loading tournaments
 * - No tournaments / cannot select tournament
 * - Loading leaderboard payload
 * - Ready leaderboard view
 */
export function TournamentPage(props: {
  searchTournamentId: string;
  searchTourId: string;
  variant: LeaderboardVariant | null;
  onTournamentChange: (nextTournamentId: string) => void;
  onChangeTourId: (nextTourId: string) => void;
}) {
  const vm = useTournamentPage({
    searchTournamentId: props.searchTournamentId,
    searchTourId: props.searchTourId,
    variant: props.variant,
  });

  if (vm.kind === "loadingTournaments") {
    return <TournamentPageSkeleton />;
  }

  if (vm.kind === "noTournaments") {
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">No tournaments found.</div>
      </div>
    );
  }

  if (vm.kind === "noSelection") {
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">
          Unable to determine a tournament to display.
        </div>
      </div>
    );
  }

  if (vm.kind === "preTournament") {
    return (
      <div className="container mx-auto px-4 py-8">
        <LeaderboardHeader
          focusTourney={vm.selectedTournament}
          tournaments={vm.tournaments}
          onTournamentChange={props.onTournamentChange}
        />

        <div className="mt-4">
          <PreTournamentContent
            tournament={vm.preTournament.tournament}
            member={vm.preTournament.member}
            tourCard={vm.preTournament.tourCard}
            existingTeam={vm.preTournament.existingTeam}
            teamGolfers={vm.preTournament.teamGolfers}
            playoffEventIndex={vm.preTournament.playoffEventIndex}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <LeaderboardHeader
        focusTourney={vm.selectedTournament}
        tournaments={vm.tournaments}
        onTournamentChange={props.onTournamentChange}
      />

      <div className="mt-4">
        <LeaderboardView
          model={vm.model}
          activeTourId={vm.effectiveTourId}
          onChangeTourId={props.onChangeTourId}
          variant={vm.computedVariant}
          isPreTournament={false}
        />
      </div>
    </div>
  );
}

/**
 * Fetches tournament and leaderboard data and derives the full UI view model.
 *
 * Inputs are the route search params (`tournamentId`, `tourId`, and `variant`).
 * The hook always runs its internal React/Convex hooks unconditionally and uses
 * Convex's `"skip"` pattern for dependent queries.
 *
 * Returns a tagged union describing which render state the page should show,
 * including the selected tournament, the computed `LeaderboardViewModel`, the
 * derived `LeaderboardVariant`, and the effective tour tab selection.
 */
function useTournamentPage(args: {
  searchTournamentId: string;
  searchTourId: string;
  variant: LeaderboardVariant | null;
}):
  | { kind: "loadingTournaments" }
  | { kind: "noTournaments" }
  | { kind: "noSelection" }
  | {
      kind: "preTournament";
      tournaments: EnhancedTournamentDoc[];
      selectedTournament: EnhancedTournamentDoc;
      preTournament: {
        tournament: {
          _id: string;
          name: string;
          startDate: number;
          tier?: { name?: string | null } | null;
        };
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
        existingTeam: { golferIds?: number[] | null } | null;
        teamGolfers: Array<{
          apiId?: number | null;
          _id?: string | null;
          playerName: string;
          worldRank?: number | null;
        }> | null;
        playoffEventIndex: number;
      };
    }
  | {
      kind: "ready";
      tournaments: EnhancedTournamentDoc[];
      selectedTournament: EnhancedTournamentDoc;
      model: LeaderboardViewModel;
      computedVariant: LeaderboardVariant;
      effectiveTourId: string;
    } {
  type TournamentLeaderboardViewPayload = {
    tournament: {
      name: string;
      currentRound?: number | null;
      livePlay?: boolean | null;
    };
    teams: Array<{
      _id: unknown;
      tourCardId: unknown;
      golferIds?: number[] | null;
      earnings?: number | null;
      points?: number | null;
      position?: string | null;
      pastPosition?: string | null;
      score?: number | null;
      today?: number | null;
      thru?: number | null;
      roundOneTeeTime?: string | null;
      roundOne?: number | null;
      roundTwoTeeTime?: string | null;
      roundTwo?: number | null;
      roundThreeTeeTime?: string | null;
      roundThree?: number | null;
      roundFourTeeTime?: string | null;
      roundFour?: number | null;
      tourCard: null | {
        _id: unknown;
        displayName: string;
        tourId: unknown;
        playoff?: number | null;
      };
    }>;
    golfers: Array<{
      _id: unknown;
      position?: string | null;
      posChange?: number | null;
      score?: number | null;
      today?: number | null;
      thru?: number | null;
      endHole?: number | null;
      group?: number | null;
      rating?: number | null;
      roundOneTeeTime?: string | null;
      roundOne?: number | null;
      roundTwoTeeTime?: string | null;
      roundTwo?: number | null;
      roundThreeTeeTime?: string | null;
      roundThree?: number | null;
      roundFourTeeTime?: string | null;
      roundFour?: number | null;
      usage?: number | null;
      makeCut?: number | null;
      topTen?: number | null;
      win?: number | null;
      worldRank?: number | null;
      golfer: {
        apiId: number;
        playerName: string;
        country?: string | null;
        worldRank?: number | null;
      };
    }>;
    tours: Array<{
      _id: unknown;
      name: string;
      shortForm: string;
      logoUrl?: string | null;
    }>;
    viewer: null | {
      member: null | { friends?: unknown[] | null };
      tourCard: null | { _id: unknown };
    };
  } | null;

  const { user } = useUser();

  const tournaments = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      sort: {
        sortBy: "startDate",
        sortOrder: "asc",
      },
      enhance: {
        includeSeason: true,
        includeTier: true,
        includeCourse: true,
      },
    },
  }) as EnhancedTournamentDoc[] | undefined;

  const selectedTournament =
    tournaments && tournaments.length > 0
      ? findDocByStringId(tournaments, args.searchTournamentId) ||
        selectDefaultTournament(tournaments)
      : null;

  const isNotStartedYet =
    typeof selectedTournament?.startDate === "number" &&
    selectedTournament.startDate > Date.now();

  const memberResult = useQuery(
    api.functions.members.getMembers,
    user ? { options: { clerkId: user.id } } : "skip",
  );

  const member =
    memberResult &&
    typeof memberResult === "object" &&
    !Array.isArray(memberResult) &&
    "_id" in memberResult
      ? (memberResult as unknown as {
          displayName?: string | null;
          firstname?: string | null;
          lastname?: string | null;
          email?: string | null;
          account?: number | null;
        })
      : null;

  const tourCardsResult = useQuery(
    api.functions.tourCards.getTourCards,
    user && selectedTournament
      ? { options: { clerkId: user.id, seasonId: selectedTournament.seasonId } }
      : "skip",
  ) as
    | Array<{
        _id: unknown;
        tourId: unknown;
        playoff?: number | null;
        currentPosition?: string | number | null;
        points?: number | null;
        earnings?: number | null;
      }>
    | undefined;

  const tourCard =
    tourCardsResult && tourCardsResult.length > 0
      ? {
          _id: String(tourCardsResult[0]!._id),
          tourId: String(tourCardsResult[0]!.tourId),
          playoff: tourCardsResult[0]!.playoff ?? null,
          currentPosition: tourCardsResult[0]!.currentPosition ?? null,
          points: tourCardsResult[0]!.points ?? null,
          earnings: tourCardsResult[0]!.earnings ?? null,
        }
      : null;

  const teamResult = useQuery(
    api.functions.teams.getTeams,
    selectedTournament && tourCard
      ? {
          options: {
            filter: {
              tournamentId: selectedTournament._id,
              tourCardId: tourCard._id as unknown as never,
            },
            pagination: { limit: 1, offset: 0 },
            enhance: { includeGolfers: true },
          },
        }
      : "skip",
  ) as
    | Array<null | {
        golferIds?: number[] | null;
        golfers?: Array<{
          _id?: unknown;
          apiId?: number | null;
          playerName: string;
          worldRank?: number | null;
        }>;
      }>
    | undefined;

  const existingTeam =
    teamResult && teamResult.length > 0 && teamResult[0]
      ? { golferIds: teamResult[0].golferIds ?? null }
      : null;

  const teamGolfers =
    teamResult && teamResult.length > 0 && teamResult[0]?.golfers
      ? teamResult[0].golfers.map((g) => ({
          _id: g._id ? String(g._id) : null,
          apiId: g.apiId ?? null,
          playerName: g.playerName,
          worldRank: g.worldRank ?? null,
        }))
      : null;

  const playoffEventIndex = useMemo(() => {
    if (!selectedTournament) return 0;

    const seasonId = String(selectedTournament.seasonId);
    const playoffTournaments = (tournaments ?? [])
      .filter((t) => String(t.seasonId) === seasonId)
      .filter((t) => {
        const name = (t.name ?? "").toLowerCase();
        const tier = (t.tier?.name ?? "").toLowerCase();
        return name.includes("playoff") || tier.includes("playoff");
      })
      .sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0));

    const idx = playoffTournaments.findIndex(
      (t) => String(t._id) === String(selectedTournament._id),
    );
    return idx >= 0 ? idx + 1 : 0;
  }, [selectedTournament, tournaments]);

  const leaderboardPayload = useQuery(
    api.functions.tournaments.getTournamentLeaderboardView,
    selectedTournament && !isNotStartedYet
      ? {
          tournamentId: selectedTournament._id,
          options: {
            includeTours: true,
            includeViewer: true,
            viewerClerkId: user?.id,
            includeTournamentEnhancements: {
              includeSeason: true,
              includeTier: true,
              includeCourse: true,
            },
          },
        }
      : "skip",
  ) as TournamentLeaderboardViewPayload | undefined;

  const computedVariant = useMemo((): LeaderboardVariant => {
    if (args.variant) return args.variant;

    const isPlayoff =
      (selectedTournament?.tier?.name ?? "")
        .toLowerCase()
        .includes("playoff") ||
      (selectedTournament?.name ?? "").toLowerCase().includes("playoff");
    if (isPlayoff) return "playoff";

    const isPast =
      typeof selectedTournament?.endDate === "number" &&
      selectedTournament.endDate < Date.now();
    if (isPast) return "historical";

    return "regular";
  }, [
    args.variant,
    selectedTournament?.endDate,
    selectedTournament?.name,
    selectedTournament?.tier?.name,
  ]);

  const model = useMemo((): LeaderboardViewModel => {
    if (!selectedTournament) return { kind: "loading" };
    if (isNotStartedYet) return { kind: "loading" };
    if (leaderboardPayload === undefined) return { kind: "loading" };
    if (leaderboardPayload === null) {
      return { kind: "error", message: "Leaderboard data not found." };
    }

    const { tournament, teams, golfers, tours, viewer } = leaderboardPayload;

    const tourIdToShortForm = new Map(
      (tours ?? []).map((t) => [String(t._id), t.shortForm]),
    );

    const toggleTours: LeaderboardTourToggle[] = [
      ...(tours ?? []).map((t) => ({
        id: t.shortForm.toLowerCase(),
        shortForm: t.shortForm,
        name: t.name,
        logoUrl: t.logoUrl,
      })),
      {
        id: "pga",
        shortForm: "PGA",
        name: "PGA",
        logoUrl:
          "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPHn0reMa1Sl6K8NiXDVstIvkZcpyWUmEoY3xj",
      },
    ];

    const pgaRows: LeaderboardPgaRow[] = (golfers ?? []).map((tg) => ({
      kind: "pga",
      id: String(tg._id),
      apiId: tg.golfer.apiId,
      position: tg.position ?? null,
      posChange: tg.posChange ?? null,
      playerName: tg.golfer.playerName,
      score: tg.score ?? null,
      today: tg.today ?? null,
      thru: tg.thru ?? null,
      endHole: tg.endHole ?? null,
      group: tg.group ?? null,
      rating: tg.rating ?? null,
      roundOne: tg.roundOne ?? null,
      roundTwo: tg.roundTwo ?? null,
      roundThree: tg.roundThree ?? null,
      roundFour: tg.roundFour ?? null,
      usage: tg.usage ?? null,
      makeCut: tg.makeCut ?? null,
      topTen: tg.topTen ?? null,
      win: tg.win ?? null,
      worldRank: tg.worldRank ?? tg.golfer.worldRank ?? null,
      country: tg.golfer.country ?? null,
      teeTimeDisplay:
        tg.roundOneTeeTime ??
        tg.roundTwoTeeTime ??
        tg.roundThreeTeeTime ??
        tg.roundFourTeeTime ??
        null,
    }));

    const pgcRows: LeaderboardTeamRow[] = (teams ?? []).map((team) => {
      const teamTourCard = team.tourCard;
      const tourShortForm = teamTourCard
        ? tourIdToShortForm.get(String(teamTourCard.tourId))
        : undefined;

      return {
        kind: "pgc",
        id: String(team._id),
        pastPosition: team.pastPosition ?? null,
        position: team.position ?? null,
        golferApiIds: team.golferIds ?? [],
        today: team.today ?? null,
        thru: team.thru ?? null,
        score: team.score ?? null,
        points: team.points ?? null,
        earnings: team.earnings ?? null,
        roundOne: team.roundOne ?? null,
        roundTwo: team.roundTwo ?? null,
        roundThree: team.roundThree ?? null,
        roundFour: team.roundFour ?? null,
        teeTimeDisplay:
          team.roundOneTeeTime ??
          team.roundTwoTeeTime ??
          team.roundThreeTeeTime ??
          team.roundFourTeeTime ??
          null,
        tourCard: {
          id: teamTourCard ? String(teamTourCard._id) : String(team.tourCardId),
          ownerClerkId: null,
          displayName: teamTourCard?.displayName ?? "Unknown",
          tourId: tourShortForm ? tourShortForm.toLowerCase() : null,
          playoff: teamTourCard?.playoff ?? null,
        },
      };
    });

    const viewerFriendIds = Array.isArray(viewer?.member?.friends)
      ? viewer?.member?.friends.map((v: unknown) => String(v))
      : null;

    const viewerTourCardId = viewer?.tourCard?._id
      ? String(viewer.tourCard._id)
      : null;

    const viewerTeamGolferApiIds = viewerTourCardId
      ? ((teams ?? []).find((t) => String(t.tourCardId) === viewerTourCardId)
          ?.golferIds ?? null)
      : null;

    return {
      kind: "ready",
      tournament: {
        name: tournament.name,
        currentRound: tournament.currentRound ?? null,
        livePlay: tournament.livePlay ?? null,
      },
      toggleTours,
      pgaRows,
      pgcRows,
      viewer: viewerTourCardId
        ? {
            tourCardId: viewerTourCardId,
            friendIds: viewerFriendIds,
            teamGolferApiIds: viewerTeamGolferApiIds,
          }
        : undefined,
    };
  }, [isNotStartedYet, leaderboardPayload, selectedTournament]);

  if (tournaments === undefined) {
    return { kind: "loadingTournaments" };
  }

  if (!tournaments || tournaments.length === 0) {
    return { kind: "noTournaments" };
  }

  if (!selectedTournament) {
    return { kind: "noSelection" };
  }

  if (isNotStartedYet) {
    return {
      kind: "preTournament",
      tournaments,
      selectedTournament,
      preTournament: {
        tournament: {
          _id: String(selectedTournament._id),
          name: selectedTournament.name,
          startDate: selectedTournament.startDate,
          tier: selectedTournament.tier
            ? { name: selectedTournament.tier.name ?? null }
            : null,
        },
        member,
        tourCard,
        existingTeam,
        teamGolfers,
        playoffEventIndex,
      },
    };
  }

  const allowedTourIds =
    model.kind === "ready" ? model.toggleTours.map((t) => t.id) : [];
  const defaultTourId =
    model.kind === "ready"
      ? (model.toggleTours.find((t) => t.id !== "pga")?.id ?? "pga")
      : "pga";

  const effectiveTourId =
    (args.searchTourId && allowedTourIds.includes(args.searchTourId)
      ? args.searchTourId
      : "") || defaultTourId;

  return {
    kind: "ready",
    tournaments,
    selectedTournament,
    model,
    computedVariant,
    effectiveTourId,
  };
}

/**
 * Loading state for the tournament page.
 */
function TournamentPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">Loading tournaments...</div>
    </div>
  );
}
