import { query } from "../_generated/server";
import { getCurrentMember } from "../utils/auth";
import {
  getSettlementAmounts,
  isSettlementSeasonComplete,
} from "../utils/settlements";

function parseRank(position: string | undefined) {
  const match = position ? /\d+/.exec(position) : null;
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

export const getMyOverview = query({
  args: {},
  handler: async (ctx) => {
    const member = await getCurrentMember(ctx);
    const [cards, requests, appState] = await Promise.all([
      ctx.db
        .query("tourCards")
        .withIndex("by_member", (query) => query.eq("memberId", member._id))
        .take(500),
      ctx.db
        .query("settlementRequests")
        .withIndex("by_member", (query) => query.eq("memberId", member._id))
        .take(100),
      ctx.db
        .query("appState")
        .withIndex("by_key", (query) => query.eq("key", "primary"))
        .unique(),
    ]);

    const seasonIds = [...new Set(cards.map((card) => card.seasonId))];
    const tourIds = [...new Set(cards.map((card) => card.tourId))];
    const [seasonDocs, tourDocs, contributionsByCard] = await Promise.all([
      Promise.all(seasonIds.map((seasonId) => ctx.db.get(seasonId))),
      Promise.all(tourIds.map((tourId) => ctx.db.get(tourId))),
      Promise.all(
        cards.map((card) =>
          ctx.db
            .query("standingsContributions")
            .withIndex("by_tour_card_start_date", (query) =>
              query.eq("tourCardId", card._id),
            )
            .order("desc")
            .take(100),
        ),
      ),
    ]);

    const seasons = seasonDocs.filter((season) => season !== null);
    const tours = tourDocs.filter((tour) => tour !== null);
    const seasonById = new Map(seasons.map((season) => [season._id, season]));
    const tourById = new Map(tours.map((tour) => [tour._id, tour]));
    const requestBySeasonId = new Map(
      requests.map((request) => [request.seasonId, request]),
    );
    const earningsBySeasonId = new Map<string, number>();
    for (const card of cards) {
      const key = String(card.seasonId);
      earningsBySeasonId.set(
        key,
        (earningsBySeasonId.get(key) ?? 0) + Math.max(0, card.earnings),
      );
    }

    const seasonFinancials = seasons
      .map((season) => {
        const earningsCents = Math.round(
          earningsBySeasonId.get(String(season._id)) ?? 0,
        );
        const amounts = getSettlementAmounts({
          earningsCents,
          accountCents: member.account,
        });
        const request = requestBySeasonId.get(season._id);
        return {
          seasonId: season._id,
          seasonLabel: `${season.year} Season ${season.number}`,
          year: season.year,
          number: season.number,
          earningsCents,
          accountOffsetCents: amounts.accountOffsetCents,
          availableCents: amounts.availableCents,
          isComplete: isSettlementSeasonComplete({
            season,
            appState,
            now: Date.now(),
          }),
          request: request
            ? {
                _id: request._id,
                status: request.status,
                earningsCents: request.earningsCents,
                accountOffsetCents: request.accountOffsetCents,
                availableCents: request.availableCents,
                transferCents: request.transferCents,
                charityCents: request.charityCents,
                leagueCents: request.leagueCents,
                nextSeasonCardCents: request.nextSeasonCardCents,
                payoutEmail: request.payoutEmail,
                submittedAt: request.submittedAt,
                completedAt: request.completedAt,
                cancelledAt: request.cancelledAt,
              }
            : null,
        };
      })
      .sort((a, b) => b.year - a.year || b.number - a.number);

    const currentSeasonFinancial =
      seasonFinancials.find(
        (item) => item.seasonId === appState?.currentSeasonId,
      ) ??
      seasonFinancials.find(
        (item) =>
          item.earningsCents > 0 && item.request?.status !== "completed",
      ) ??
      seasonFinancials[0] ??
      null;

    const achievements = contributionsByCard
      .flat()
      .filter(
        (item) =>
          item.tournamentStatus === "completed" &&
          parseRank(item.position) === 1,
      )
      .map((item) => ({
        id: item._id,
        seasonId: item.seasonId,
        tourId: item.tourId,
        tournamentId: item.tournamentId,
        tournamentName: item.tournamentName,
        logoUrl: item.tournamentLogoUrl ?? null,
        tierName: item.tierName,
        isMajor: item.tierName.trim().toLowerCase() === "major",
        isPlayoff: item.isPlayoff,
        position: item.position ?? "1",
        points: item.points ?? 0,
        earningsCents: item.earnings ?? 0,
        wonAt: item.tournamentEndDate,
        seasonLabel: (() => {
          const season = seasonById.get(item.seasonId);
          return season ? `${season.year} Season ${season.number}` : "Season";
        })(),
        tourName: tourById.get(item.tourId)?.name ?? "Tour",
      }))
      .sort((a, b) => b.wonAt - a.wonAt);

    const tourCards = cards
      .map((card) => {
        const season = seasonById.get(card.seasonId);
        const tour = tourById.get(card.tourId);
        return {
          _id: card._id,
          seasonId: card.seasonId,
          tourId: card.tourId,
          displayName: card.displayName,
          seasonLabel: season
            ? `${season.year} Season ${season.number}`
            : "Season",
          seasonYear: season?.year ?? 0,
          seasonNumber: season?.number ?? 0,
          tourName: tour?.name ?? "Tour",
          tourShortForm: tour?.shortForm ?? "",
          tourLogoUrl: tour?.logoUrl ?? null,
          currentPosition: card.currentPosition ?? "-",
          points: card.points,
          earningsCents: card.earnings,
          wins: card.wins ?? 0,
          topFive: card.topFive ?? 0,
          topTen: card.topTen,
          madeCut: card.madeCut,
          appearances: card.appearances,
          playoff: card.playoff ?? 0,
          isCurrent: card.seasonId === appState?.currentSeasonId,
        };
      })
      .sort(
        (a, b) =>
          b.seasonYear - a.seasonYear ||
          b.seasonNumber - a.seasonNumber ||
          a.tourName.localeCompare(b.tourName),
      );

    return {
      member: {
        _id: member._id,
        email: member.email,
        firstname: member.firstname,
        lastname: member.lastname,
        accountCents: member.account,
      },
      career: {
        seasonsPlayed: new Set(cards.map((card) => String(card.seasonId))).size,
        tourCards: cards.length,
        earningsCents: cards.reduce((sum, card) => sum + card.earnings, 0),
        points: cards.reduce((sum, card) => sum + card.points, 0),
        wins: cards.reduce((sum, card) => sum + (card.wins ?? 0), 0),
        topFive: cards.reduce((sum, card) => sum + (card.topFive ?? 0), 0),
        topTen: cards.reduce((sum, card) => sum + card.topTen, 0),
        madeCut: cards.reduce((sum, card) => sum + card.madeCut, 0),
        appearances: cards.reduce((sum, card) => sum + card.appearances, 0),
      },
      achievements,
      tourCards,
      seasonFinancials,
      currentSeasonFinancial,
    };
  },
});
