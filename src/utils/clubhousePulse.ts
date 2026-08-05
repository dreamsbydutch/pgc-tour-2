import type {
  BuildClubhousePulseCardsArgs,
  ClubhousePulseCardDto,
  ClubhousePulseCardViewModel,
  ClubhousePulseCutoff,
  ClubhousePulsePhase,
  ClubhousePulseRival,
  ClubhousePulseRivalCandidate,
  ClubhousePulseStandingSnapshot,
  ClubhousePulseStandingsRowDto,
  ClubhousePulseTeamDto,
} from "@/types";
import {
  buildCompetitionRanks,
  buildLeaderboardStandingsProjections,
  getPlayoffDestination,
} from "./leaderboardStandings";
import { formatMoney, formatScore, parseRankFromPositionString } from "./app";

const TERMINAL_POSITIONS = new Set(["CUT", "WD", "DQ"]);

export function selectClubhousePulsePhase(args: {
  hasActiveTournament: boolean;
  hasOpenPicks: boolean;
  seasonComplete: boolean;
}): ClubhousePulsePhase {
  if (args.hasActiveTournament) return "live";
  if (args.hasOpenPicks) return "picks_open";
  if (args.seasonComplete) return "season_complete";
  return "between_events";
}

export function getTerminalScoreState(
  position: string | null | undefined,
): "CUT" | "WD" | "DQ" | null {
  const normalized = position?.trim().toUpperCase();
  return normalized && TERMINAL_POSITIONS.has(normalized)
    ? (normalized as "CUT" | "WD" | "DQ")
    : null;
}

/**
 * Prefer the closest friend in the same competition. Without one, use the
 * adjacent team ahead, or the closest team behind when the viewer leads.
 */
export function selectClubhousePulseRival(args: {
  viewer: ClubhousePulseRivalCandidate;
  candidates: ClubhousePulseRivalCandidate[];
  friendIds: readonly string[];
  lowerIsBetter: boolean;
}): ClubhousePulseRival | null {
  const friendIdSet = new Set(args.friendIds.map(String));
  const others = args.candidates.filter(
    (candidate) =>
      candidate.id !== args.viewer.id && Number.isFinite(candidate.value),
  );
  if (others.length === 0 || !Number.isFinite(args.viewer.value)) return null;

  const closest = (items: ClubhousePulseRivalCandidate[]) =>
    items.slice().sort((a, b) => {
      const gap =
        Math.abs(a.value - args.viewer.value) -
        Math.abs(b.value - args.viewer.value);
      if (gap !== 0) return gap;
      return a.id.localeCompare(b.id);
    })[0];
  const friend = closest(
    others.filter(
      (candidate) =>
        candidate.memberId && friendIdSet.has(String(candidate.memberId)),
    ),
  );
  let candidate = friend;
  if (!candidate) {
    const viewerRank = parseRankFromPositionString(args.viewer.position);
    const ranked = others.filter((item) =>
      Number.isFinite(parseRankFromPositionString(item.position)),
    );
    const tied = ranked.find(
      (item) =>
        item.value === args.viewer.value &&
        parseRankFromPositionString(item.position) === viewerRank,
    );
    const ahead = ranked
      .filter((item) => parseRankFromPositionString(item.position) < viewerRank)
      .sort(
        (a, b) =>
          parseRankFromPositionString(b.position) -
          parseRankFromPositionString(a.position),
      )[0];
    const behind = ranked
      .filter((item) => parseRankFromPositionString(item.position) > viewerRank)
      .sort(
        (a, b) =>
          parseRankFromPositionString(a.position) -
          parseRankFromPositionString(b.position),
      )[0];
    candidate = tied ?? ahead ?? behind ?? closest(others);
  }
  if (!candidate) return null;

  const rawGap = args.viewer.value - candidate.value;
  const viewerIsBehind = args.lowerIsBetter ? rawGap > 0 : rawGap < 0;
  return {
    candidate,
    gap: Math.abs(rawGap),
    relation: rawGap === 0 ? "tied" : viewerIsBehind ? "behind" : "ahead",
    isFriend: Boolean(
      candidate.memberId && friendIdSet.has(String(candidate.memberId)),
    ),
  };
}

/** Qualification is based on cards with strictly more points, so ties at a
 * boundary share the same destination even when the nominal field overflows. */
export function getClubhousePulseCutoff(args: {
  viewerId: string;
  cards: Array<{ id: string; points: number }>;
  playoffSpots: readonly number[];
}): ClubhousePulseCutoff | null {
  const viewer = args.cards.find((card) => card.id === args.viewerId);
  if (!viewer) return null;
  const ranks = buildCompetitionRanks(
    args.cards.map((card) => ({ ...card, tourId: "selected" })),
  );
  const rank = ranks.get(viewer.id);
  if (!rank) return null;
  const destination = getPlayoffDestination({
    betterCount: rank.betterCount,
    playoffSpots: args.playoffSpots,
  });
  const destinationById = new Map(
    args.cards.map((card) => {
      const cardRank = ranks.get(card.id)!;
      return [
        card.id,
        getPlayoffDestination({
          betterCount: cardRank.betterCount,
          playoffSpots: args.playoffSpots,
        }),
      ] as const;
    }),
  );
  if (destination === "gold") {
    const next = args.cards
      .filter((card) => destinationById.get(card.id) !== "gold")
      .sort((a, b) => b.points - a.points)[0];
    return {
      destination,
      message: next
        ? `${formatPointGap(viewer.points - next.points)} clear of Gold`
        : "Inside the Gold field",
    };
  }
  if (destination === "silver") {
    const next = args.cards
      .filter((card) => destinationById.get(card.id) === "out")
      .sort((a, b) => b.points - a.points)[0];
    return {
      destination,
      message: next
        ? `${formatPointGap(viewer.points - next.points)} clear of Silver`
        : "Inside the Silver field",
    };
  }
  const silverFloor = args.cards
    .filter((card) => destinationById.get(card.id) === "silver")
    .sort((a, b) => a.points - b.points)[0];
  return {
    destination,
    message: silverFloor
      ? `${formatPointGap(silverFloor.points - viewer.points)} from Silver`
      : "Outside the playoff field",
  };
}

export function buildClubhousePulseCards(args: BuildClubhousePulseCardsArgs): {
  tabs: Array<{ cardId: string; label: string; tourName: string }>;
  cards: ClubhousePulseCardViewModel[];
} {
  const sortedCards = args.data.cards
    .filter((card) => card.tour)
    .slice()
    .sort((a, b) => a.tour!.name.localeCompare(b.tour!.name));
  const seasonComplete = args.data.appState?.seasonPhase === "completed";
  const phase = selectClubhousePulsePhase({
    hasActiveTournament: Boolean(args.data.activeTournament),
    hasOpenPicks: Boolean(args.data.pickWindowTournament),
    seasonComplete,
  });
  return {
    tabs: sortedCards.map((card) => ({
      cardId: String(card.tourCard._id),
      label: card.tour!.shortForm,
      tourName: card.tour!.name,
    })),
    cards: sortedCards.map((card) => buildCard({ ...args, card, phase })),
  };
}

function buildCard(
  args: BuildClubhousePulseCardsArgs & {
    card: ClubhousePulseCardDto;
    phase: ClubhousePulsePhase;
  },
): ClubhousePulseCardViewModel {
  const cardId = String(args.card.tourCard._id);
  const tourId = String(args.card.tourCard.tourId);
  const standings =
    args.data.standingsByTour.find((group) => String(group.tourId) === tourId)
      ?.rows ?? [];
  const official = getOfficialSnapshot(args.card, standings);
  const cutoff = getClubhousePulseCutoff({
    viewerId: cardId,
    cards: standings.map((row) => ({
      id: String(row._id),
      points: row.points,
    })),
    playoffSpots: args.card.tour?.playoffSpots ?? [],
  });
  if (args.phase === "live" && args.data.activeTournament) {
    return buildLiveCard({ ...args, cardId, tourId, standings, official });
  }
  if (args.phase === "picks_open" && args.data.pickWindowTournament) {
    return buildPicksCard({
      ...args,
      cardId,
      tourId,
      standings,
      official,
      cutoff,
    });
  }
  return buildIdleCard({
    ...args,
    cardId,
    tourId,
    standings,
    official,
    cutoff,
  });
}

function buildLiveCard(
  args: BuildClubhousePulseCardsArgs & {
    card: ClubhousePulseCardDto;
    phase: ClubhousePulsePhase;
    cardId: string;
    tourId: string;
    standings: ClubhousePulseStandingsRowDto[];
    official: ClubhousePulseStandingSnapshot | null;
  },
): ClubhousePulseCardViewModel {
  const tournament = args.data.activeTournament!;
  const isPlayoff = tournament.isPlayoff;
  const competitionKey = isPlayoff
    ? `playoff:${args.card.tourCard.playoff}`
    : `tour:${args.tourId}`;
  const teams =
    args.data.activeCompetitions.find((item) => item.key === competitionKey)
      ?.teams ?? [];
  const viewerTeam = teams.find(
    (team) => String(team.tourCardId) === args.cardId,
  );
  const terminal = getTerminalScoreState(viewerTeam?.position);
  const movement = terminal
    ? null
    : positionMovement(viewerTeam?.position, viewerTeam?.pastPosition);
  const projected = isPlayoff
    ? null
    : getProjectedSnapshot({
        cardId: args.cardId,
        tournament,
        tour: args.card.tour!,
        standings: args.standings,
        teams,
      });
  const rival = viewerTeam
    ? selectClubhousePulseRival({
        viewer: teamToRival(viewerTeam),
        candidates: teams
          .filter((team) => !getTerminalScoreState(team.position))
          .map(teamToRival),
        friendIds: args.friendIds,
        lowerIsBetter: true,
      })
    : null;
  const stories = [];
  if (terminal) {
    stories.push({
      kind: "movement" as const,
      text: `${terminal} is now final`,
    });
  } else if (movement !== null) {
    stories.push({
      kind: "movement" as const,
      text:
        movement > 0
          ? `Up ${movement} ${pluralize("spot", movement)} today`
          : movement < 0
            ? `Down ${Math.abs(movement)} ${pluralize("spot", movement)} today`
            : "Holding position today",
    });
  }
  if (rival) {
    stories.push({
      kind: "rival" as const,
      text: formatRivalStory(rival, "strokes"),
    });
  }
  if (!isPlayoff) {
    stories.push({
      kind: "season" as const,
      text: projected
        ? `${projected.position} projected · ${capitalize(projected.destination)}`
        : "Awaiting live projection",
    });
  }
  return {
    cardId: args.cardId,
    tourId: args.tourId,
    phase: "live",
    eyebrow: `${args.card.tour!.shortForm} · ${isPlayoff ? bracketName(args.card.tourCard.playoff) : "Live"}`,
    title: viewerTeam ? tournament.name : "No team found",
    statusLabel: "Live",
    isLive: true,
    stats: [
      stat(
        "Position",
        viewerTeam?.position ?? "—",
        `Position ${viewerTeam?.position ?? "unavailable"}`,
      ),
      stat(
        "Score",
        terminal ?? scoreValue(viewerTeam?.score),
        terminal
          ? `Tournament status ${terminal}`
          : `Score ${scoreValue(viewerTeam?.score)}`,
      ),
      stat(
        "Today · Thru",
        `${scoreValue(viewerTeam?.today)} · ${thruValue(viewerTeam?.thru)}`,
        `Today ${scoreValue(viewerTeam?.today)}, through ${thruValue(viewerTeam?.thru)}`,
      ),
    ],
    stories: stories.slice(0, 3),
    officialStanding: args.official,
    projectedStanding: projected,
    action: {
      label: "Open live leaderboard",
      destination: "leaderboard",
      tournamentId: String(tournament._id),
      tourId: isPlayoff
        ? args.card.tourCard.playoff === 2
          ? "silver"
          : "gold"
        : args.tourId,
      variant: isPlayoff ? "playoff" : "regular",
    },
    lastUpdatedAt: tournament.leaderboardLastUpdatedAt ?? null,
  };
}

function buildPicksCard(
  args: BuildClubhousePulseCardsArgs & {
    card: ClubhousePulseCardDto;
    phase: ClubhousePulsePhase;
    cardId: string;
    tourId: string;
    standings: ClubhousePulseStandingsRowDto[];
    official: ClubhousePulseStandingSnapshot | null;
    cutoff: ClubhousePulseCutoff | null;
  },
): ClubhousePulseCardViewModel {
  const tournament = args.data.pickWindowTournament!;
  const laterPlayoff = tournament.isPlayoff && tournament.eventIndex > 1;
  const rival = standingsRival(args.cardId, args.standings, args.friendIds);
  const closesAt = tournament.pickWindow?.closesAt ?? tournament.startDate;
  const title = laterPlayoff
    ? "Playoff field set"
    : args.card.hasPickWindowTeam
      ? "Team submitted"
      : "Roster needed";
  const stories = [
    args.cutoff ? { kind: "season" as const, text: args.cutoff.message } : null,
    rival
      ? { kind: "rival" as const, text: formatRivalStory(rival, "points") }
      : null,
  ].filter((story): story is NonNullable<typeof story> => Boolean(story));
  return {
    cardId: args.cardId,
    tourId: args.tourId,
    phase: "picks_open",
    eyebrow: `${args.card.tour!.shortForm} · Picks open`,
    title,
    statusLabel: formatRelativeTime(closesAt, args.now, "Closes"),
    isLive: false,
    stats: [
      stat("Tournament", tournament.name, `Tournament ${tournament.name}`),
      stat(
        "Standing",
        args.official?.position ?? "—",
        `Official standing ${args.official?.position ?? "unavailable"}`,
      ),
      stat(
        "Playoffs",
        capitalize(args.cutoff?.destination ?? "out"),
        `Playoff destination ${args.cutoff?.destination ?? "unavailable"}`,
      ),
    ],
    stories,
    officialStanding: args.official,
    projectedStanding: null,
    action: laterPlayoff
      ? {
          label: "View standings",
          destination: "standings",
          tourId: tournament.isPlayoff
            ? args.card.tourCard.playoff === 2
              ? "silver"
              : "gold"
            : args.tourId,
        }
      : {
          label: args.card.hasPickWindowTeam ? "Review picks" : "Pick my team",
          destination: "picks",
          tournamentId: String(tournament._id),
          tourId: args.tourId,
          variant: tournament.isPlayoff ? "playoff" : "regular",
        },
    lastUpdatedAt: null,
  };
}

function buildIdleCard(
  args: BuildClubhousePulseCardsArgs & {
    card: ClubhousePulseCardDto;
    phase: ClubhousePulsePhase;
    cardId: string;
    tourId: string;
    standings: ClubhousePulseStandingsRowDto[];
    official: ClubhousePulseStandingSnapshot | null;
    cutoff: ClubhousePulseCutoff | null;
  },
): ClubhousePulseCardViewModel {
  const complete = args.phase === "season_complete";
  const latest = args.card.latestResult;
  const rival = standingsRival(args.cardId, args.standings, args.friendIds);
  const next = args.data.nextTournament;
  const standingMovement = args.card.standingsRow?.posChange ?? 0;
  const standingStory = args.official
    ? `${args.official.position} official · ${formatMovement(standingMovement)}${!complete && args.cutoff ? ` · ${args.cutoff.message}` : ""}`
    : null;
  const stories = [
    standingStory ? { kind: "season" as const, text: standingStory } : null,
    rival
      ? { kind: "rival" as const, text: formatRivalStory(rival, "points") }
      : null,
    latest
      ? {
          kind: "result" as const,
          text: `${latest.tournament.name}: ${latest.position ?? "Finished"} · ${formatPoints(latest.points ?? 0)}`,
        }
      : null,
  ].filter((story): story is NonNullable<typeof story> => Boolean(story));
  return {
    cardId: args.cardId,
    tourId: args.tourId,
    phase: complete ? "season_complete" : "between_events",
    eyebrow: `${args.card.tour!.shortForm} · ${complete ? "Season complete" : "Between events"}`,
    title: complete
      ? "Final season card"
      : (latest?.tournament.name ?? "Season snapshot"),
    statusLabel:
      !complete && next
        ? formatRelativeTime(
            next.startDate - 4 * 24 * 60 * 60 * 1000,
            args.now,
            "Picks open",
          )
        : "Official",
    isLive: false,
    stats: complete
      ? [
          stat(
            "Final",
            args.official?.position ?? "—",
            `Final position ${args.official?.position ?? "unavailable"}`,
          ),
          stat(
            "Points",
            formatNumber(args.card.tourCard.points),
            `${formatNumber(args.card.tourCard.points)} points`,
          ),
          stat(
            "Earnings · Wins",
            `${formatMoney(args.card.tourCard.earnings, false)} · ${args.card.tourCard.wins ?? 0}`,
            `Earnings ${formatMoney(args.card.tourCard.earnings, false)}, ${args.card.tourCard.wins ?? 0} wins`,
          ),
        ]
      : [
          stat(
            "Result",
            latest?.position ?? "—",
            `Latest result ${latest?.position ?? "unavailable"}`,
          ),
          stat(
            "Score",
            getTerminalScoreState(latest?.position) ??
              scoreValue(latest?.score),
            `Latest score ${getTerminalScoreState(latest?.position) ?? scoreValue(latest?.score)}`,
          ),
          stat(
            "Points · Earned",
            `${formatPoints(latest?.points ?? 0)} · ${formatMoney(latest?.earnings ?? 0, false)}`,
            `${formatPoints(latest?.points ?? 0)}, earned ${formatMoney(latest?.earnings ?? 0, false)}`,
          ),
        ],
    stories: stories.slice(0, 3),
    officialStanding: args.official,
    projectedStanding: null,
    action: latest
      ? {
          label: complete ? "View final standings" : "Open latest result",
          destination: complete ? "standings" : "result",
          tournamentId: complete ? undefined : String(latest.tournament._id),
          tourId: args.tourId,
          variant: latest.isPlayoff ? "playoff" : "regular",
        }
      : {
          label: complete ? "View final standings" : "Open standings",
          destination: "standings",
          tourId: args.tourId,
        },
    lastUpdatedAt: null,
  };
}

function getOfficialSnapshot(
  card: ClubhousePulseCardDto,
  rows: ClubhousePulseStandingsRowDto[],
): ClubhousePulseStandingSnapshot | null {
  const row = rows.find(
    (item) => String(item._id) === String(card.tourCard._id),
  );
  if (!row || !card.tour) return null;
  const ranks = buildCompetitionRanks(
    rows.map((item) => ({
      id: String(item._id),
      tourId: String(item.tourId),
      points: item.points,
    })),
  );
  const rank = ranks.get(String(row._id));
  if (!rank) return null;
  return {
    position: rank.position,
    points: row.points,
    destination: getPlayoffDestination({
      betterCount: rank.betterCount,
      playoffSpots: card.tour.playoffSpots,
    }),
  };
}

function getProjectedSnapshot(args: {
  cardId: string;
  tournament: NonNullable<
    BuildClubhousePulseCardsArgs["data"]["activeTournament"]
  >;
  tour: NonNullable<ClubhousePulseCardDto["tour"]>;
  standings: ClubhousePulseStandingsRowDto[];
  teams: ClubhousePulseTeamDto[];
}): ClubhousePulseStandingSnapshot | null {
  const snapshots = buildLeaderboardStandingsProjections({
    tournamentStatus: args.tournament.status,
    isPlayoff: false,
    lastUpdatedAt: args.tournament.leaderboardLastUpdatedAt,
    tours: [
      {
        id: String(args.tour._id),
        playoffSpots: args.tour.playoffSpots,
      },
    ],
    tourCards: args.standings.map((row) => ({
      id: String(row._id),
      tourId: String(row.tourId),
      points: row.points,
    })),
    teams: args.teams.map((team) => ({
      tourCardId: String(team.tourCardId),
      points: team.points,
    })),
  });
  const live = snapshots.get(args.cardId)?.live;
  return live
    ? {
        position: live.position,
        points: live.points,
        destination: live.destination,
      }
    : null;
}

function standingsRival(
  cardId: string,
  rows: ClubhousePulseStandingsRowDto[],
  friendIds: readonly string[],
) {
  const viewer = rows.find((row) => String(row._id) === cardId);
  if (!viewer) return null;
  return selectClubhousePulseRival({
    viewer: standingsToRival(viewer),
    candidates: rows.map(standingsToRival),
    friendIds,
    lowerIsBetter: false,
  });
}

function teamToRival(
  team: ClubhousePulseTeamDto,
): ClubhousePulseRivalCandidate {
  return {
    id: String(team.tourCardId),
    memberId: team.memberId ? String(team.memberId) : null,
    displayName: team.displayName,
    position: team.position,
    value: team.score ?? Number.NaN,
  };
}

function standingsToRival(
  row: ClubhousePulseStandingsRowDto,
): ClubhousePulseRivalCandidate {
  return {
    id: String(row._id),
    memberId: String(row.memberId),
    displayName: row.displayName,
    position: row.currentPosition,
    value: row.points,
  };
}

function formatRivalStory(
  rival: ClubhousePulseRival,
  unit: "strokes" | "points",
) {
  const name = abbreviateName(rival.candidate.displayName);
  if (rival.relation === "tied") return `Tied with ${name}`;
  const gap = Number.isInteger(rival.gap)
    ? String(rival.gap)
    : rival.gap.toFixed(1);
  return `${gap} ${unit} ${rival.relation} ${name}`;
}

function positionMovement(
  current: string | null | undefined,
  previous: string | null | undefined,
) {
  const currentRank = parseRankFromPositionString(current);
  const pastRank = parseRankFromPositionString(previous);
  return Number.isFinite(currentRank) && Number.isFinite(pastRank)
    ? pastRank - currentRank
    : null;
}

function formatRelativeTime(timestamp: number, now: number, prefix: string) {
  const minutes = Math.ceil((timestamp - now) / 60_000);
  if (minutes <= 0) return `${prefix} now`;
  if (minutes < 60) return `${prefix} in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${prefix} in ${hours}h`;
  return `${prefix} in ${Math.ceil(hours / 24)}d`;
}

function scoreValue(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score)
    ? formatScore(score)
    : "—";
}

function thruValue(thru: number | null | undefined) {
  if (typeof thru !== "number" || !Number.isFinite(thru)) return "—";
  return thru >= 18 ? "F" : String(thru);
}

function stat(label: string, value: string, accessibleLabel: string) {
  return { label, value, accessibleLabel };
}

function formatPoints(points: number) {
  return `${formatNumber(points)} pts`;
}

function formatPointGap(points: number) {
  return `${formatNumber(Math.max(0, points))} pts`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function abbreviateName(name: string | null | undefined) {
  const parts = (name ?? "Rival").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "Rival";
  return `${parts[0]![0]}. ${parts.slice(1).join(" ")}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pluralize(word: string, value: number) {
  return Math.abs(value) === 1 ? word : `${word}s`;
}

function formatMovement(value: number) {
  if (value > 0) return `Up ${value}`;
  if (value < 0) return `Down ${Math.abs(value)}`;
  return "No change";
}

function bracketName(playoff: number | undefined) {
  return playoff === 1 ? "Gold playoff" : "Silver playoff";
}
