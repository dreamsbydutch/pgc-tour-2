/**
 * Components exports
 *
 * Main barrel for components under:
 * - `src/components/ui/*`
 * - `src/components/pages/*`
 * - `src/components/internal/*`
 *
 * Exports are grouped by intended consumption (public vs internal), and then
 * roughly by whether the component fetches its own data (Convex hooks) and
 * whether it is reused broadly or is feature/leaf-specific.
 */

// Public: UI primitives (presentational, reused broadly)
export { Button } from "./ui/primitives/button";
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/primitives/card";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/primitives/dialog";
export { Dropdown } from "./ui/primitives/dropdown";
export { FormFeedback } from "./ui/primitives/form-feedback";
export { Skeleton, SVGSkeleton } from "./ui/primitives/skeleton";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/primitives/table";
export { AdminEditDeleteActions } from "./ui/blocks/admin-edit-delete-actions";
export { AdminRowActions } from "./ui/blocks/admin-row-actions";
export { AdminLoadMore } from "./ui/blocks/admin-load-more";
export { TournamentCountdown } from "./ui/blocks/tournament-countdown";
export { LittleFucker } from "./ui/blocks/little-fucker";
export { TierDistributionsTable } from "./ui/blocks/tier-distributions-table";
export { MemberHeader } from "./ui/blocks/member-header";
export { TeamGolfersList } from "./ui/blocks/team-golfers-list";
export { TeamGolfersTable } from "./ui/blocks/team-golfers-table";
export { HomePageListingsContainer } from "./ui/blocks/home-page-listings-container";
export { LeaderboardHeader } from "./ui/blocks/leaderboard-header";
export { LeaderboardHeaderDropdown } from "./ui/blocks/leaderboard-header-dropdown";
export { LeaderboardHeaderRow } from "./ui/blocks/leaderboard-header-row";
export { LeaderboardListing } from "./ui/blocks/leaderboard-listing";
export { LeaderboardView } from "./ui/blocks/leaderboard-view";
export { ModeratorTools } from "./ui/blocks/moderator-tools";
export { PGADropdown } from "./ui/blocks/pga-dropdown";
export { PGALeaderboard } from "./ui/blocks/pga-leaderboard";
export { PGCLeaderboard } from "./ui/blocks/pgc-leaderboard";
export { PWAInstallPrompt } from "./ui/blocks/pwa-install-prompt";

// Public: route page components (used by routes; typically data-fetching)
export { AccountPage } from "./pages/AccountPage";
export { ArticleDetailPage } from "./pages/ArticleDetailPage";
export { ArticlesIndexPage } from "./pages/ArticlesIndexPage";
export { HistoryPage } from "./pages/HistoryPage";
export { HomePage } from "./pages/HomePage";
export { RulebookPage } from "./pages/RulebookPage";
export { TournamentPage } from "./pages/TournamentPage";

// Public: admin pages (used by routes; data-fetching + mutations/actions)
export { AdminCronsPage } from "./pages/admin/AdminCronsPage";
export { AdminGolfersPage } from "./pages/admin/AdminGolfersPage";
export { AdminSeasonsPage } from "./pages/admin/AdminSeasonsPage";
export { AdminSetupPage } from "./pages/admin/AdminSetupPage";
export { AdminTeamsPage } from "./pages/admin/AdminTeamsPage";
export { AdminTournamentsPage } from "./pages/admin/AdminTournamentsPage";
export { NavigationContainer } from "./pages/NavigationContainer";
export { StandingsView } from "./pages/StandingsView";

// Internal: shared building blocks (multi-use)
export { AdminCrudSection } from "./ui/blocks/admin-crud-section";
export { AdminDataTable } from "./ui/blocks/admin-data-table";
export { Field } from "./ui/primitives/field";
export { ToursToggle } from "./ui/blocks/tours-toggle";

// Internal: shared + data-fetching (multi-use)
export { LeagueSchedule } from "./ui/blocks/league-schedule";

// Internal: feature/leaf smart components (Convex hooks)
export { ClerkUsersManager } from "./internal/ClerkUsersManager";
export { CoursesSection } from "./internal/CoursesSection";
export { MembersManager } from "./internal/MembersManager";
export { SeasonsSection } from "./internal/SeasonsSection";
export { TiersSection } from "./internal/TiersSection";
export { TourCardChangeButton } from "./internal/TourCardChangeButton";
export { TourCardForm } from "./internal/TourCardForm";
export { TourCardFormButton } from "./internal/TourCardFormButton";
export { TourCardOutput } from "./internal/TourCardOutput";
export { ToursSection } from "./internal/ToursSection";
export { TransactionsManager } from "./internal/TransactionsManager";

// Internal: feature/leaf presentational/composition components (no Convex hooks)
export { AdminPanel } from "./ui/blocks/admin-panel";
export { ChampionsPopup } from "./internal/ChampionsPopup";
export { PreTournamentContent } from "./internal/PreTournamentContent";
export { TeamPickForm } from "./internal/TeamPickForm";
