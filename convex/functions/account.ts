import { query } from "../_generated/server";
import { getCurrentMember } from "../utils/auth";
import {
  getSettlementAmounts,
  isSettlementSeasonComplete,
} from "../utils/settlements";
import { includesPlayoffLabel } from "../utils/standings";

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
    const [
      seasonDocs,
      tourDocs,
      contributionsByCard,
      tournamentsBySeason,
      tiersBySeason,
    ] = await Promise.all([
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
      Promise.all(
        seasonIds.map((seasonId) =>
          ctx.db
            .query("tournaments")
            .withIndex("by_season", (query) => query.eq("seasonId", seasonId))
            .take(100),
        ),
      ),
      Promise.all(
        seasonIds.map((seasonId) =>
          ctx.db
            .query("tiers")
            .withIndex("by_season", (query) => query.eq("seasonId", seasonId))
            .take(20),
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
    const playoffTierIds = new Set(
      tiersBySeason
        .flat()
        .filter((tier) => includesPlayoffLabel(tier.name))
        .map((tier) => tier._id),
    );
    const playoffTournamentIds = new Set(
      tournamentsBySeason
        .flat()
        .filter(
          (tournament) =>
            playoffTierIds.has(tournament.tierId) ||
            includesPlayoffLabel(tournament.name),
        )
        .map((tournament) => tournament._id),
    );
    const finalPlayoffTournamentIdBySeason = new Map(
      tournamentsBySeason.flatMap((tournaments) => {
        const finalTournament = tournaments
          .filter((tournament) => playoffTournamentIds.has(tournament._id))
          .sort((a, b) => b.startDate - a.startDate)[0];
        return finalTournament
          ? [[finalTournament.seasonId, finalTournament._id] as const]
          : [];
      }),
    );
    const contributions = contributionsByCard.flat();
    const isPlayoffContribution = (item: (typeof contributions)[number]) =>
      playoffTournamentIds.has(item.tournamentId) ||
      item.isPlayoff ||
      includesPlayoffLabel(item.tierName) ||
      includesPlayoffLabel(item.tournamentName);
    const finalPlayoffResults = contributions.filter(
      (item) =>
        item.tournamentStatus === "completed" &&
        isPlayoffContribution(item) &&
        finalPlayoffTournamentIdBySeason.get(item.seasonId) ===
          item.tournamentId,
    );
    const finalPlayoffResultByCardId = new Map(
      finalPlayoffResults.map((item) => [item.tourCardId, item] as const),
    );
    const earningsBySeasonId = new Map<string, number>();
    for (const card of cards) {
      const key = String(card.seasonId);
      earningsBySeasonId.set(
        key,
        (earningsBySeasonId.get(key) ?? 0) + Math.max(0, card.earnings),
      );
    }

    const currentSeason = appState?.currentSeasonId
      ? seasonById.get(appState.currentSeasonId)
      : undefined;
    const currentSeasonFinancial = currentSeason
      ? (() => {
          const season = currentSeason;
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
        })()
      : null;

    const careerWinContributions = contributions.filter(
      (item) =>
        item.tournamentStatus === "completed" &&
        parseRank(item.position) === 1 &&
        (!isPlayoffContribution(item) ||
          finalPlayoffTournamentIdBySeason.get(item.seasonId) ===
            item.tournamentId),
    );
    const careerWinsByCardId = new Map(
      cards.map((card) => [
        card._id,
        careerWinContributions.filter((item) => item.tourCardId === card._id)
          .length,
      ]),
    );
    const achievements = careerWinContributions
      .map((item) => ({
        id: item._id,
        tournamentName: item.tournamentName,
        logoUrl: item.tournamentLogoUrl ?? null,
        wonAt: item.tournamentEndDate,
        year: seasonById.get(item.seasonId)?.year ?? null,
      }))
      .sort((a, b) => b.wonAt - a.wonAt);

    const tourCards = cards
      .map((card) => {
        const season = seasonById.get(card.seasonId);
        const tour = tourById.get(card.tourId);
        const finalPlayoffResult = finalPlayoffResultByCardId.get(card._id);
        const finalPlayoffRank = finalPlayoffResult
          ? parseRank(finalPlayoffResult.position)
          : Number.POSITIVE_INFINITY;
        const completedFinalPlayoff = finalPlayoffResult ? 1 : 0;
        const madeFinalPlayoffCut = Number.isFinite(finalPlayoffRank) ? 1 : 0;
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
          wins: careerWinsByCardId.get(card._id) ?? 0,
          topFive: (card.topFive ?? 0) + (finalPlayoffRank <= 5 ? 1 : 0),
          topTen: card.topTen + (finalPlayoffRank <= 10 ? 1 : 0),
          madeCut: card.madeCut + madeFinalPlayoffCut,
          appearances: card.appearances + completedFinalPlayoff,
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

    const career = tourCards.reduce(
      (totals, card) => ({
        earningsCents: totals.earningsCents + card.earningsCents,
        points: totals.points + card.points,
        wins: totals.wins + card.wins,
        topFive: totals.topFive + card.topFive,
        topTen: totals.topTen + card.topTen,
        madeCut: totals.madeCut + card.madeCut,
        appearances: totals.appearances + card.appearances,
      }),
      {
        earningsCents: 0,
        points: 0,
        wins: 0,
        topFive: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      },
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
        ...career,
      },
      achievements,
      tourCards,
      currentSeasonFinancial,
    };
  },
});
