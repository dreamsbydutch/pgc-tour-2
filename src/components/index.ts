/**
 * Components exports
 *
 * Main barrel for components under:
 * - `src/components/displays/*` (level 1: pure display)
 * - `src/components/widgets/*` (level 2: leaf UI w/ state or data)
 * - `src/components/facilitators/*` (level 3: orchestration/composition)
 *
 * Exports are grouped by intended consumption (public vs internal), and then
 * roughly by whether the component fetches its own data (Convex hooks) and
 * whether it is reused broadly or is feature/leaf-specific.
 */

// Public: route page components (level 3 facilitators; used by routes)
export { AccountPage } from "./facilitators/pages/AccountPage";
export { ArticleDetailPage } from "./facilitators/pages/ArticleDetailPage";
export { ArticlesIndexPage } from "./facilitators/pages/ArticlesIndexPage";
export { HistoryPage } from "./facilitators/pages/HistoryPage";
export { HomePage } from "./facilitators/pages/HomePage";
export { NavigationContainer } from "./facilitators/pages/NavigationContainer";
export { RulebookPage } from "./facilitators/pages/RulebookPage";
export { StandingsView } from "./facilitators/pages/StandingsView";
export { TournamentPage } from "./facilitators/pages/TournamentPage";

// Public: admin pages
export { AdminDashboardPage } from "./facilitators/pages/admin/admin/AdminDashboardPage";
export { AdminCronsPage } from "./facilitators/pages/admin/admin/AdminCronsPage";
export { AdminGolfersPage } from "./facilitators/pages/admin/admin/AdminGolfersPage";
export { AdminMemberMergePage } from "./facilitators/pages/admin/admin/AdminMemberMergePage";
export { AdminSeasonsPage } from "./facilitators/pages/admin/admin/AdminSeasonsPage";
export { AdminSetupPage } from "./facilitators/pages/admin/admin/AdminSetupPage";
export { AdminTeamsPage } from "./facilitators/pages/admin/admin/AdminTeamsPage";
export { AdminTourCardsPage } from "./facilitators/pages/admin/admin/AdminTourCardsPage";
export { AdminTournamentsPage } from "./facilitators/pages/admin/admin/AdminTournamentsPage";
export { MemberAccountAuditPage } from "./facilitators/pages/admin/admin/MemberAccountAuditPage";

// Level 1: displays (pure UI; no state, no data fetching)
export { AdminDataTable } from "./displays/admin/AdminDataTable";
export { AdminEditDeleteActions } from "./displays/admin/AdminEditDeleteActions";
export { AdminPanel } from "./displays/admin/AdminPanel";
export { AdminRowActions } from "./displays/admin/AdminRowActions";
export { ModeratorTools } from "./displays/admin/ModeratorTools";
export { HomePageListingsContainer } from "./displays/home/HomePageListingsContainer";
export { LeaderboardHeaderRow } from "./displays/leaderboard/LeaderboardHeaderRow";
export { PGADropdown } from "./displays/leaderboard/PGADropdown";
export { ToursToggle } from "./displays/leaderboard/ToursToggle";
export { TeamGolfersList } from "./displays/team/TeamGolfersList";
export { TeamGolfersTable } from "./displays/team/TeamGolfersTable";
export { ChampionsPopup } from "./displays/tournament/ChampionsPopup";
export { MemberHeader } from "./displays/tournament/MemberHeader";
export { TournamentCountdown } from "./displays/tournament/TournamentCountdown";
export { LittleFucker } from "./displays/misc/LittleFucker";
export { TierDistributionsTable } from "./displays/misc/TierDistributionsTable";

// Level 2: widgets (leaf UI with state and/or data fetching)
export { AdminLoadMore } from "./widgets/admin/AdminLoadMore";
export { LeaderboardHeaderDropdown } from "./widgets/leaderboard/LeaderboardHeaderDropdown";
export { LeagueSchedule } from "./widgets/schedule/LeagueSchedule";
export { PWAInstallPrompt } from "./widgets/pwa/PWAInstallPrompt";
export { TourCardChangeButton } from "./widgets/admin/TourCardChangeButton";
export { TourCardFormButton } from "./widgets/admin/TourCardFormButton";

// Level 3: facilitators (composition/orchestration)
export { AdminCrudSection } from "./facilitators/admin/AdminCrudSection";
export { ClerkUsersManager } from "./facilitators/admin/ClerkUsersManager";
export { CoursesSection } from "./facilitators/admin/CoursesSection";
export { MembersManager } from "./facilitators/admin/MembersManager";
export { MissingTourCardsSection } from "./facilitators/admin/MissingTourCardsSection";
export { SeasonsSection } from "./facilitators/admin/SeasonsSection";
export { TiersSection } from "./facilitators/admin/TiersSection";
export { ToursSection } from "./facilitators/admin/ToursSection";
export { TransactionsManager } from "./facilitators/admin/TransactionsManager";
export { HardGateAdmin } from "./facilitators/auth/HardGateAdmin";
export { HardGateSignedIn } from "./facilitators/auth/HardGateSignedIn";
export { SignedOutPersistentSignIn } from "./facilitators/auth/SignedOutPersistentSignIn";
export { LeaderboardHeader } from "./facilitators/leaderboard/LeaderboardHeader";
export { LeaderboardListing } from "./facilitators/leaderboard/LeaderboardListing";
export { LeaderboardView } from "./facilitators/leaderboard/LeaderboardView";
export { PGALeaderboard } from "./facilitators/leaderboard/PGALeaderboard";
export { PGCLeaderboard } from "./facilitators/leaderboard/PGCLeaderboard";
export { PreTournamentContent } from "./facilitators/tournament/PreTournamentContent";
export { TeamPickForm } from "./facilitators/tournament/TeamPickForm";
export { TourCardForm } from "./facilitators/tour-cards/TourCardForm";
export { TourCardOutput } from "./facilitators/tour-cards/TourCardOutput";
