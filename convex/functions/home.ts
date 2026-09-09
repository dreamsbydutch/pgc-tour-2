import { query } from "../_generated/server";
import {
  projectPublicAppState,
  projectPublicSeason,
  projectPublicStandingsHistory,
  projectPublicStandingsRow,
  projectPublicTeam,
  projectPublicTour,
  projectPublicTourCard,
  projectPublicTournament,
  projectViewerMember,
} from "../utils/publicDtos";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";

export const getPublicHomeDashboard = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    let season = state?.currentSeasonId
      ? await ctx.db.get(state.currentSeasonId)
      : null;
    if (!season) {
      season = await ctx.db.query("seasons").order("desc").first();
    }
    if (!season) {
      return { season: null, tours: [], tournaments: [] };
    }

    const [tours, tournaments] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(20),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(100),
    ]);
    const courseIds = [...new Set(tournaments.map((item) => item.courseId))];
    const tierIds = [...new Set(tournaments.map((item) => item.tierId))];
    const [courses, tiers] = await Promise.all([
      Promise.all(courseIds.map((id) => ctx.db.get(id))),
      Promise.all(tierIds.map((id) => ctx.db.get(id))),
    ]);
    const courseById = new Map(
      courses.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    const tierById = new Map(
      tiers.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    const playoffTournaments = tournaments
      .filter((item) =>
        (tierById.get(item.tierId)?.name ?? "")
          .toLowerCase()
          .includes("playoff"),
      )
      .sort((a, b) => a.startDate - b.startDate);
    const finalPlayoffTournament =
      playoffTournaments[playoffTournaments.length - 1] ?? null;
    const tourById = new Map(tours.map((tour) => [tour._id, tour] as const));
    let seasonHonors: null | {
      tournamentId: string;
      champion: {
        displayName: string;
        score: number | null;
        tour: { name: string; shortForm: string; logoUrl: string } | null;
      };
      silverChampion: {
        displayName: string;
        score: number | null;
        tour: { name: string; shortForm: string; logoUrl: string } | null;
      } | null;
    } = null;

    if (finalPlayoffTournament?.status === "completed") {
      const firstPlaceTeams = await ctx.db
        .query("teams")
        .withIndex("by_tournament_position", (q) =>
          q.eq("tournamentId", finalPlayoffTournament._id).eq("position", "1"),
        )
        .take(10);
      const firstPlaceCards = await Promise.all(
        firstPlaceTeams.map((team) => ctx.db.get(team.tourCardId)),
      );
      const winners = firstPlaceTeams.map((team, index) => ({
        team,
        card: firstPlaceCards[index],
        playoff: team.playoff ?? firstPlaceCards[index]?.playoff,
      }));
      const projectWinner = (playoff: 1 | 2) => {
        const bracketWinners = winners.filter(
          (winner) => winner.playoff === playoff,
        );
        if (bracketWinners.length !== 1) return null;
        const winner = bracketWinners[0]!;
        const displayName = winner.team.displayName ?? winner.card?.displayName;
        if (!displayName) return null;
        const winnerTourId = winner.team.tourId ?? winner.card?.tourId;
        const tour = winnerTourId ? tourById.get(winnerTourId) : undefined;
        return {
          displayName,
          score:
            typeof winner.team.score === "number" ? winner.team.score : null,
          tour: tour
            ? {
                name: tour.name,
                shortForm: tour.shortForm,
                logoUrl: tour.logoUrl,
              }
            : null,
        };
      };
      const champion = projectWinner(1);
      if (champion) {
        seasonHonors = {
          tournamentId: String(finalPlayoffTournament._id),
          champion,
          silverChampion: projectWinner(2),
        };
      }
    }
    return {
      season: projectPublicSeason(season),
      tours: tours.map(projectPublicTour),
      tournaments: tournaments
        .sort((a, b) => a.startDate - b.startDate)
        .map((tournament) =>
          projectPublicTournament({
            tournament,
            course: courseById.get(tournament.courseId),
            tier: tierById.get(tournament.tierId),
          }),
        ),
      seasonHonors,
    };
  },
});

/**
 * Viewer-scoped read model for the Home clubhouse pulse. This deliberately
 * lives beside (rather than inside) the cacheable public Home dashboard so a
 * member's competition data can never leak into the public response.
 */
export const getViewerClubhousePulse = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { kind: "signed_out" as const };

    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!member) return { kind: "missing_member" as const };

    const now = Date.now();
    const storedState = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    let season = storedState?.currentSeasonId
      ? await ctx.db.get(storedState.currentSeasonId)
      : null;
    if (!season) season = await ctx.db.query("seasons").order("desc").first();
    if (!season) {
      return {
        kind: "ready" as const,
        appState: null,
        activeTournament: null,
        nextTournament: null,
        pickWindowTournament: null,
        cards: [],
        standingsByTour: [],
        activeCompetitions: [],
      };
    }

    const [tournaments, tours, viewerCards] = await Promise.all([
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season!._id))
        .take(100),
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", season!._id))
        .take(20),
      ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", member._id).eq("seasonId", season!._id),
        )
        .take(20),
    ]);

    const sortedTournaments = [...tournaments].sort(
      (a, b) => a.startDate - b.startDate,
    );
    const derivedActive =
      sortedTournaments.find((item) => item.status === "active") ??
      sortedTournaments.find(
        (item) => item.startDate <= now && item.endDate >= now,
      ) ??
      null;
    const derivedNext =
      sortedTournaments.find(
        (item) => item.startDate > now && item.status !== "cancelled",
      ) ?? null;
    const activeTournament =
      (storedState?.activeTournamentId
        ? sortedTournaments.find(
            (item) =>
              item._id === storedState.activeTournamentId &&
              item.status !== "completed" &&
              item.status !== "cancelled",
          )
        : null) ?? derivedActive;
    const nextTournament =
      (storedState?.nextTournamentId
        ? sortedTournaments.find(
            (item) =>
              item._id === storedState.nextTournamentId &&
              item.status !== "cancelled" &&
              item.startDate > now,
          )
        : null) ?? derivedNext;
    const derivedPickWindow =
      sortedTournaments.find(
        (item) =>
          item.status !== "active" &&
          item.status !== "completed" &&
          item.status !== "cancelled" &&
          now >= item.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS &&
          now < item.startDate,
      ) ?? null;
    const storedPickWindow = storedState?.pickWindowTournamentId
      ? (sortedTournaments.find(
          (item) =>
            item._id === storedState.pickWindowTournamentId &&
            item.status !== "cancelled" &&
            item.startDate > now,
        ) ?? null)
      : null;
    const pickWindowTournament = storedPickWindow ?? derivedPickWindow;
    const seasonComplete =
      sortedTournaments.length > 0 &&
      sortedTournaments.every(
        (item) =>
          item.status === "completed" ||
          item.status === "cancelled" ||
          item.endDate < now,
      );
    const appState = projectPublicAppState(
      storedState ?? {
        currentSeasonId: season._id,
        activeTournamentId: activeTournament?._id,
        nextTournamentId: nextTournament?._id,
        seasonPhase: seasonComplete ? "completed" : "in-season",
        publicVersion: 0,
        pickWindowTournamentId: pickWindowTournament?._id,
        pickWindowOpensAt: pickWindowTournament
          ? pickWindowTournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS
          : undefined,
        pickWindowClosesAt: pickWindowTournament?.startDate,
      },
    );

    const tierIds = [...new Set(tournaments.map((item) => item.tierId))];
    const tiers = await Promise.all(tierIds.map((id) => ctx.db.get(id)));
    const tierById = new Map(
      tiers.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    const playoffTournaments = sortedTournaments.filter((item) =>
      (tierById.get(item.tierId)?.name ?? "").toLowerCase().includes("playoff"),
    );
    const eventIndexFor = (tournamentId: string) => {
      const index = playoffTournaments.findIndex(
        (item) => item._id === tournamentId,
      );
      return index < 0 ? 0 : index + 1;
    };
    const activeSyncState = activeTournament
      ? await ctx.db
          .query("tournamentSyncState")
          .withIndex("by_tournament", (q) =>
            q.eq("tournamentId", activeTournament._id),
          )
          .unique()
      : null;
    const toPublicTournament = (
      tournament: (typeof tournaments)[number] | null,
    ) =>
      tournament
        ? projectPublicTournament({
            tournament,
            season,
            tier: tierById.get(tournament.tierId),
            eventIndex: eventIndexFor(tournament._id),
            leaderboardLastUpdatedAt:
              tournament._id === activeTournament?._id
                ? (activeSyncState?.leaderboardLastUpdatedAt ??
                  tournament.leaderboardLastUpdatedAt)
                : undefined,
            pickWindow: {
              opensAt: tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS,
              closesAt: tournament.startDate,
              isOpen: tournament._id === pickWindowTournament?._id,
            },
          })
        : null;

    const tourById = new Map(tours.map((tour) => [tour._id, tour] as const));
    const viewerTourIds = [...new Set(viewerCards.map((card) => card.tourId))];
    const standingsGroups = await Promise.all(
      viewerTourIds.map(async (tourId) => ({
        tourId,
        rows: await ctx.db
          .query("standingsRows")
          .withIndex("by_season_tour_variant", (q) =>
            q
              .eq("seasonId", season!._id)
              .eq("tourId", tourId)
              .eq("variant", "regular"),
          )
          .take(500),
      })),
    );
    const standingsByTour = standingsGroups.map((group) => ({
      tourId: group.tourId,
      rows: group.rows.map(projectPublicStandingsRow),
    }));
    const standingsRowByCard = new Map(
      standingsGroups
        .flatMap((group) => group.rows)
        .map((row) => [row.tourCardId, row] as const),
    );

    const cards = await Promise.all(
      viewerCards.map(async (card) => {
        const [recentContributions, pickTeam] = await Promise.all([
          ctx.db
            .query("standingsContributions")
            .withIndex("by_tour_card_start_date", (q) =>
              q.eq("tourCardId", card._id),
            )
            .order("desc")
            .take(20),
          pickWindowTournament
            ? ctx.db
                .query("teams")
                .withIndex("by_tournament_tour_card", (q) =>
                  q
                    .eq("tournamentId", pickWindowTournament._id)
                    .eq("tourCardId", card._id),
                )
                .unique()
            : Promise.resolve(null),
        ]);
        const latestContribution = recentContributions.find(
          (item) =>
            item.tournamentStatus !== "cancelled" &&
            item.tournamentEndDate <= now,
        );
        return {
          tourCard: projectPublicTourCard(card),
          tour: tourById.has(card.tourId)
            ? projectPublicTour(tourById.get(card.tourId)!)
            : null,
          standingsRow: standingsRowByCard.has(card._id)
            ? projectPublicStandingsRow(standingsRowByCard.get(card._id)!)
            : null,
          latestResult: latestContribution
            ? projectPublicStandingsHistory(latestContribution)
            : null,
          hasPickWindowTeam: Boolean(pickTeam),
        };
      }),
    );

    const activeIsPlayoff = activeTournament
      ? eventIndexFor(activeTournament._id) > 0
      : false;
    let activeCompetitions: Array<{
      key: string;
      teams: ReturnType<typeof projectPublicTeam>[];
    }> = [];
    if (activeTournament && activeIsPlayoff) {
      const brackets = [
        ...new Set(
          viewerCards
            .map((card) => card.playoff)
            .filter((value): value is number => value === 1 || value === 2),
        ),
      ];
      activeCompetitions = await Promise.all(
        brackets.map(async (playoff) => ({
          key: `playoff:${playoff}`,
          teams: (
            await ctx.db
              .query("teams")
              .withIndex("by_tournament_playoff", (q) =>
                q
                  .eq("tournamentId", activeTournament._id)
                  .eq("playoff", playoff),
              )
              .take(500)
          ).map((team) => projectPublicTeam(team)),
        })),
      );
    } else if (activeTournament) {
      activeCompetitions = await Promise.all(
        viewerTourIds.map(async (tourId) => ({
          key: `tour:${tourId}`,
          teams: (
            await ctx.db
              .query("teams")
              .withIndex("by_tournament_tour", (q) =>
                q.eq("tournamentId", activeTournament._id).eq("tourId", tourId),
              )
              .take(500)
          ).map((team) => projectPublicTeam(team)),
        })),
      );
    }

    return {
      kind: "ready" as const,
      appState,
      activeTournament: toPublicTournament(activeTournament),
      nextTournament: toPublicTournament(nextTournament),
      pickWindowTournament: toPublicTournament(pickWindowTournament),
      cards,
      standingsByTour,
      activeCompetitions,
    };
  },
});

export const getHomeDashboard = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    let season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();
    if (!season) {
      season = (await ctx.db.query("seasons").order("desc").first()) ?? null;
    }
    if (!season) {
      return {
        season: null,
        tours: [],
        tourCards: [],
        tournaments: [],
        member: null,
      };
    }

    const [tours, tournaments, tourCards] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(20),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(100),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(500),
    ]);
    const enhancedTournaments = await Promise.all(
      tournaments
        .sort((a, b) => a.startDate - b.startDate)
        .map(async (tournament) =>
          projectPublicTournament({
            tournament,
            course: await ctx.db.get(tournament.courseId),
            tier: await ctx.db.get(tournament.tierId),
          }),
        ),
    );

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        season: projectPublicSeason(season),
        tours: tours.map(projectPublicTour),
        tourCards: tourCards.map(projectPublicTourCard),
        tournaments: enhancedTournaments,
        member: null,
      };
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    return {
      season: projectPublicSeason(season),
      tours: tours.map(projectPublicTour),
      tourCards: tourCards.map(projectPublicTourCard),
      tournaments: enhancedTournaments,
      member: member ? projectViewerMember(member) : null,
    };
  },
});
