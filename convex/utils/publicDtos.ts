import type { Doc } from "../_generated/dataModel";
import { resolveChampionBadgeLogoUrl } from "./tournamentBadges";

export function projectPublicSeason(season: Doc<"seasons">) {
  return {
    _id: season._id,
    year: season.year,
    number: season.number,
    startDate: season.startDate,
    endDate: season.endDate,
    registrationDeadline: season.registrationDeadline,
  };
}

export function projectPublicTour(tour: Doc<"tours">) {
  return {
    _id: tour._id,
    name: tour.name,
    shortForm: tour.shortForm,
    logoUrl: tour.logoUrl,
    seasonId: tour.seasonId,
    buyIn: tour.buyIn,
    playoffSpots: tour.playoffSpots,
    maxParticipants: tour.maxParticipants,
    registeredCount: tour.registeredCount,
  };
}

export function projectPublicTourWithSeason(
  tour: Doc<"tours">,
  season?: Doc<"seasons"> | null,
) {
  return {
    _id: tour._id,
    name: tour.name,
    shortForm: tour.shortForm,
    logoUrl: tour.logoUrl,
    seasonId: tour.seasonId,
    buyIn: tour.buyIn,
    playoffSpots: tour.playoffSpots,
    maxParticipants: tour.maxParticipants,
    registeredCount: tour.registeredCount,
    season: season ? projectPublicSeason(season) : undefined,
  };
}

export function projectPublicTier(tier: Doc<"tiers">) {
  return {
    _id: tier._id,
    name: tier.name,
    seasonId: tier.seasonId,
    payouts: tier.payouts,
    points: tier.points,
  };
}

export function projectPublicCourse(course: Doc<"courses">) {
  return {
    _id: course._id,
    name: course.name,
    location: course.location,
    par: course.par,
    front: course.front,
    back: course.back,
    timeZoneOffset: course.timeZoneOffset,
  };
}

export function projectPublicTournament(args: {
  tournament: Doc<"tournaments">;
  season?: Doc<"seasons"> | null;
  tier?: Doc<"tiers"> | null;
  course?: Doc<"courses"> | null;
  eventIndex?: number;
  leaderboardLastUpdatedAt?: number;
  pickWindow?: { opensAt: number; closesAt: number; isOpen: boolean };
}) {
  const eventIndex = args.eventIndex ?? 0;
  return {
    _id: args.tournament._id,
    name: args.tournament.name,
    startDate: args.tournament.startDate,
    endDate: args.tournament.endDate,
    status: args.tournament.status,
    currentRound: args.tournament.currentRound,
    livePlay: args.tournament.livePlay,
    logoUrl: args.tournament.logoUrl,
    seasonId: args.tournament.seasonId,
    tierId: args.tournament.tierId,
    courseId: args.tournament.courseId,
    season: args.season ? projectPublicSeason(args.season) : undefined,
    tier: args.tier ? projectPublicTier(args.tier) : undefined,
    course: args.course ? projectPublicCourse(args.course) : undefined,
    isPlayoff: eventIndex > 0,
    eventIndex,
    leaderboardLastUpdatedAt: args.leaderboardLastUpdatedAt,
    pickWindow: args.pickWindow,
  };
}

function projectPublicTeamFields(
  team: Doc<"teams">,
  fallback?: Doc<"tourCards"> | null,
) {
  return {
    _id: team._id,
    tournamentId: team.tournamentId,
    tourCardId: team.tourCardId,
    seasonId: team.seasonId,
    tourId: team.tourId ?? fallback?.tourId,
    memberId: team.memberId ?? fallback?.memberId,
    displayName: team.displayName ?? fallback?.displayName,
    playoff: team.playoff ?? fallback?.playoff,
    earnings: team.earnings,
    points: team.points,
    makeCut: team.makeCut,
    position: team.position,
    pastPosition: team.pastPosition,
    score: team.score,
    topTen: team.topTen,
    topFive: team.topFive,
    topThree: team.topThree,
    win: team.win,
    today: team.today,
    thru: team.thru,
    round: team.round,
    roundOneTeeTime: team.roundOneTeeTime,
    roundOne: team.roundOne,
    roundTwoTeeTime: team.roundTwoTeeTime,
    roundTwo: team.roundTwo,
    roundThreeTeeTime: team.roundThreeTeeTime,
    roundThree: team.roundThree,
    roundFourTeeTime: team.roundFourTeeTime,
    roundFour: team.roundFour,
  };
}

export function projectPublicTeam(
  team: Doc<"teams">,
  fallback?: Doc<"tourCards"> | null,
) {
  return projectPublicTeamFields(team, fallback);
}

export function projectPublicTeamWithRoster(
  team: Doc<"teams">,
  fallback?: Doc<"tourCards"> | null,
) {
  const dto = projectPublicTeamFields(team, fallback);
  return Object.assign(dto, { golferIds: team.golferIds });
}

export function projectPublicTourCard(card: Doc<"tourCards">) {
  return {
    _id: card._id,
    displayName: card.displayName,
    tourId: card.tourId,
    seasonId: card.seasonId,
    memberId: card.memberId,
    earnings: card.earnings,
    points: card.points,
    wins: card.wins,
    topTen: card.topTen,
    topFive: card.topFive,
    madeCut: card.madeCut,
    appearances: card.appearances,
    playoff: card.playoff,
    currentPosition: card.currentPosition,
  };
}

export function projectPublicTournamentGolfer(
  item: Doc<"tournamentGolfers">,
  golfer?: Doc<"golfers"> | null,
) {
  return {
    _id: item._id,
    golferId: item.golferId,
    tournamentId: item.tournamentId,
    apiId: item.golferApiId ?? golfer?.apiId,
    playerName: item.playerName ?? golfer?.playerName,
    country: item.country ?? golfer?.country,
    position: item.position,
    posChange: item.posChange,
    score: item.score,
    makeCut: item.makeCut,
    topTen: item.topTen,
    win: item.win,
    earnings: item.earnings,
    today: item.today,
    thru: item.thru,
    round: item.round,
    endHole: item.endHole,
    group: item.group,
    roundOneTeeTime: item.roundOneTeeTime,
    roundOne: item.roundOne,
    roundTwoTeeTime: item.roundTwoTeeTime,
    roundTwo: item.roundTwo,
    roundThreeTeeTime: item.roundThreeTeeTime,
    roundThree: item.roundThree,
    roundFourTeeTime: item.roundFourTeeTime,
    roundFour: item.roundFour,
    rating: item.rating,
    worldRank: item.worldRank ?? golfer?.worldRank,
    usage: item.usage,
  };
}

export function projectPublicStandingsRow(row: Doc<"standingsRows">) {
  return {
    _id: row.tourCardId,
    seasonId: row.seasonId,
    tourId: row.tourId,
    memberId: row.memberId,
    displayName: row.displayName,
    points: row.points,
    earnings: row.earnings,
    wins: row.wins,
    topFive: row.topFive,
    topTen: row.topTen,
    madeCut: row.madeCut,
    appearances: row.appearances,
    pastPoints: row.pastPoints,
    currentPosition: row.currentPosition,
    playoff: row.playoff,
    posChange: row.posChange,
    posChangePO: row.posChangePO,
  };
}

export function projectPublicStandingsHistory(
  item: Doc<"standingsContributions">,
) {
  return {
    _id: item._id,
    tourCardId: item.tourCardId,
    tournamentId: item.tournamentId,
    points: item.points,
    earnings: item.earnings,
    position: item.position,
    score: item.score,
    roundOne: item.roundOne,
    roundTwo: item.roundTwo,
    roundThree: item.roundThree,
    roundFour: item.roundFour,
    isPlayoff: item.isPlayoff,
    tierName: item.tierName,
    tournament: {
      _id: item.tournamentId,
      name: item.tournamentName,
      logoUrl: item.tournamentLogoUrl,
      startDate: item.tournamentStartDate,
      endDate: item.tournamentEndDate,
      tierId: item.tierId,
      status: item.tournamentStatus,
    },
  };
}

export function projectMajorChampionBadgesByMemberId(
  badges: Doc<"majorChampionBadges">[],
) {
  return badges.reduce<
    Record<
      string,
      Array<{
        tournamentId: string;
        tournamentName: string;
        logoUrl: string | null;
      }>
    >
  >((result, badge) => {
    const memberId = String(badge.memberId);
    (result[memberId] ??= []).push({
      tournamentId: String(badge.tournamentId),
      tournamentName: badge.tournamentName,
      logoUrl:
        resolveChampionBadgeLogoUrl(badge.tournamentName, badge.logoUrl) ??
        null,
    });
    return result;
  }, {});
}

export function projectPublicAppState(
  state: Pick<
    Doc<"appState">,
    | "currentSeasonId"
    | "activeTournamentId"
    | "nextTournamentId"
    | "seasonPhase"
    | "publicVersion"
    | "pickWindowTournamentId"
    | "pickWindowOpensAt"
    | "pickWindowClosesAt"
  >,
) {
  return {
    currentSeasonId: state.currentSeasonId,
    activeTournamentId: state.activeTournamentId,
    nextTournamentId: state.nextTournamentId,
    seasonPhase: state.seasonPhase,
    publicVersion: state.publicVersion,
    pickWindowTournamentId: state.pickWindowTournamentId,
    pickWindowOpensAt: state.pickWindowOpensAt,
    pickWindowClosesAt: state.pickWindowClosesAt,
  };
}

export function projectViewerMember(member: Doc<"members">) {
  return {
    _id: member._id,
    email: member.email,
    firstname: member.firstname,
    lastname: member.lastname,
    role: member.role,
    account: member.account,
    friends: member.friends,
    isActive: member.isActive,
  };
}

export function projectPublicMember(member: Doc<"members">) {
  return {
    _id: member._id,
    firstname: member.firstname,
    lastname: member.lastname,
    displayName:
      [member.firstname, member.lastname].filter(Boolean).join(" ").trim() ||
      "Member",
  };
}

export function projectAdminMember(member: Doc<"members">) {
  return {
    _id: member._id,
    email: member.email,
    firstname: member.firstname,
    lastname: member.lastname,
    account: member.account,
    isActive: member.isActive,
  };
}

export function projectMyTransaction(transaction: Doc<"transactions">) {
  return {
    _id: transaction._id,
    seasonId: transaction.seasonId,
    amount: transaction.amount,
    transactionType: transaction.transactionType,
    status: transaction.status,
    processedAt: transaction.processedAt,
  };
}
