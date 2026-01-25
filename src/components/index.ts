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
export { Button } from "./ui/button";
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
export { Dropdown, DropdownSkeleton } from "./ui/dropdown";
export { DropdownRow, DropdownRowSkeleton } from "./ui/dropdown-row";
export { FormFeedback } from "./ui/form-feedback";
export { Skeleton, SVGSkeleton } from "./ui/skeleton";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
export { AdminEditDeleteActions } from "./ui/admin-edit-delete-actions";
export { AdminFormActions } from "./ui/admin-form-actions";
export { AdminRowActions } from "./ui/admin-row-actions";
export { AdminLoadMore } from "./ui/admin-load-more";
export { TournamentCountdown } from "./ui/tournament-countdown";
export { LittleFucker } from "./ui/little-fucker";
export { PointsTable } from "./ui/points-table";
export { PayoutsTable } from "./ui/payouts-table";
export { MemberHeader } from "./ui/member-header";

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
export { AdminCrudSection } from "./ui/admin-crud-section";
export { AdminDataTable } from "./ui/admin-data-table";
export { Field } from "./ui/field";
export { LeaderboardListing } from "./internal/LeaderboardListing";
export { LeaderboardHeader } from "./internal/LeaderboardHeader";
export { ToursToggle } from "./ui/tours-toggle";

// Internal: shared + data-fetching (multi-use)
export { LeagueSchedule } from "./internal/LeagueSchedule";

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
export { AdminPanel } from "./ui/admin-panel";
export { ChampionsPopup } from "./internal/ChampionsPopup";
export { HomePageListingsContainer } from "./internal/HomePageListingsContainer";
export { LeaderboardHeaderDropdown } from "./internal/LeaderboardHeaderDropdown";
export { LeaderboardHeaderRow } from "./internal/LeaderboardHeaderRow";
export { LeaderboardView } from "./internal/LeaderboardView";
export { ModeratorTools } from "./internal/ModeratorTools";
export { PGADropdown } from "./internal/PGADropdown";
export { PGALeaderboard } from "./internal/PGALeaderboard";
export { PGCLeaderboard } from "./internal/PGCLeaderboard";
export { PreTournamentContent } from "./internal/PreTournamentContent";
export { PWAInstallPrompt } from "./internal/PWAInstallPrompt";
export { TeamGolfersList } from "./internal/TeamGolfersList";
export { TeamGolfersTable } from "./internal/TeamGolfersTable";
export { TeamPickForm } from "./internal/TeamPickForm";
