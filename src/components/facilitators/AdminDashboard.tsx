import {
  Activity,
  BarChart3,
  CalendarCheck2,
  ChevronDown,
  Database,
  HardDriveDownload,
  Loader2,
  Mail,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trophy,
  WalletCards,
  Wrench,
} from "lucide-react";

import {
  AdminConfirmationDialog,
  AdminDryRunPreview,
  AdminOperationCard,
  AdminOperationFeedback,
} from "@/displays";
import { useAdminDashboard } from "@/hooks";
import type {
  AdminBusyIconProps,
  AdminOperationGroupProps,
  AdminTaskShortcutProps,
} from "@/types";
import { Button } from "@/ui";

const inputClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AdminDashboard() {
  const {
    tournaments,
    sortedTournaments,
    members,
    seasons,
    repairTournamentId,
    setRepairTournamentId,
    tournamentId,
    setTournamentId,
    teamsJson,
    setTeamsJson,
    weeklyRecapBody,
    setWeeklyRecapBody,
    paymentMemberId,
    setPaymentMemberId,
    paymentSeasonId,
    setPaymentSeasonId,
    paymentAmountDollars,
    setPaymentAmountDollars,
    recomputeSeasonId,
    setRecomputeSeasonId,
    jobs,
    previews,
    operationStatus,
    groupStatus,
    confirmation,
    requestConfirmation,
    dismissConfirmation,
    confirmOperation,
  } = useAdminDashboard();

  return (
    <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-golf-900 via-golf-800 to-golf-700 text-white shadow-sm">
        <div className="px-6 py-7 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-white/10 p-3">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-golf-200">
                PGC admin
              </p>
              <h1 className="mt-1 text-3xl font-bold">
                What do you need to do?
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-golf-100">
                Start with the task below that matches your goal. Each card says
                when to use it, and risky tools are kept in a separate
                maintenance area.
              </p>
            </div>
          </div>
        </div>
        <nav
          aria-label="Admin task shortcuts"
          className="grid border-t border-white/15 bg-black/10 sm:grid-cols-2 lg:grid-cols-4"
        >
          <TaskShortcut
            href="#event-setup"
            icon={CalendarCheck2}
            title="Set up next event"
            detail="Rankings and groups"
          />
          <TaskShortcut
            href="#live-scoring"
            icon={Radio}
            title="Update live scores"
            detail="Leaderboard sync"
          />
          <TaskShortcut
            href="#member-email"
            icon={Mail}
            title="Email members"
            detail="Weekly recap"
          />
          <TaskShortcut
            href="#member-payment"
            icon={WalletCards}
            title="Record payment"
            detail="Update a balance"
          />
        </nav>
      </header>

      <OperationGroup
        id="regular-tasks"
        eyebrow="Start here"
        title="Regular admin tasks"
        description="These are the tools you are most likely to use during a normal tournament week."
      >
        <AdminOperationCard
          id="event-setup"
          category="Before the tournament"
          title="Prepare the next tournament"
          description="Refresh the source data first, then create the five golfer groups."
          whenToUse="It is Monday before an event and the player groups are not final yet."
          icon={Trophy}
          status={groupStatus.eventSetup}
        >
          <ol className="space-y-3">
            <li className="rounded-lg border bg-muted/30 p-3">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-golf-700 text-xs font-bold text-white">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Refresh world rankings</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Pull the newest golfer rankings and country data from
                    DataGolf.
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={jobs.updateWorldRank}
                    disabled={operationStatus.updateWorldRank.isBusy}
                  >
                    <BusyIcon busy={operationStatus.updateWorldRank.isBusy} />
                    {operationStatus.updateWorldRank.isBusy
                      ? "Refreshing rankings..."
                      : "Refresh rankings"}
                  </Button>
                </div>
              </div>
            </li>
            <li className="rounded-lg border bg-muted/30 p-3">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-golf-700 text-xs font-bold text-white">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Create golfer groups</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Build Groups 1–5 for the next scheduled event.
                  </p>
                  <Button
                    className="mt-3"
                    onClick={jobs.createGroups}
                    disabled={operationStatus.createGroups.isBusy}
                  >
                    <BusyIcon busy={operationStatus.createGroups.isBusy} />
                    {operationStatus.createGroups.isBusy
                      ? "Creating groups..."
                      : "Create groups"}
                  </Button>
                </div>
              </div>
            </li>
          </ol>
          <div className="space-y-2">
            <AdminOperationFeedback
              label="Rankings"
              status={operationStatus.updateWorldRank}
            />
            <AdminOperationFeedback
              label="Groups"
              status={operationStatus.createGroups}
            />
          </div>
        </AdminOperationCard>

        <AdminOperationCard
          id="live-scoring"
          category="During the tournament"
          title="Update the live leaderboard"
          description="Pull the latest player scores and recalculate team results."
          whenToUse="A tournament is in progress and the app's leaderboard needs fresh scores."
          icon={Activity}
          status={groupStatus.liveSync}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-golf-200 bg-golf-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-golf-800">
                Use first
              </p>
              <p className="mt-1 font-semibold">Normal sync</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Safely skips work when the upstream feed has not changed.
              </p>
              <Button
                className="mt-3 w-full"
                onClick={() => jobs.liveSync()}
                disabled={
                  operationStatus.liveSync.isBusy ||
                  operationStatus.liveSyncForce.isBusy
                }
              >
                <BusyIcon busy={operationStatus.liveSync.isBusy} />
                {operationStatus.liveSync.isBusy ? "Syncing..." : "Run sync"}
              </Button>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Recovery only
              </p>
              <p className="mt-1 font-semibold">Force sync</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Reprocesses data even when the feed says nothing changed.
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => jobs.liveSync(true)}
                disabled={
                  operationStatus.liveSync.isBusy ||
                  operationStatus.liveSyncForce.isBusy
                }
              >
                <BusyIcon busy={operationStatus.liveSyncForce.isBusy} />
                {operationStatus.liveSyncForce.isBusy
                  ? "Forcing sync..."
                  : "Force sync"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <AdminOperationFeedback
              label="Normal sync"
              status={operationStatus.liveSync}
            />
            <AdminOperationFeedback
              label="Force sync"
              status={operationStatus.liveSyncForce}
            />
          </div>
        </AdminOperationCard>

        <AdminOperationCard
          id="member-email"
          category="Member communication"
          title="Email the weekly recap"
          description="Write an optional note, test the email, then send it to eligible members."
          whenToUse="You are ready to tell members about the upcoming tournament."
          icon={Mail}
          status={groupStatus.weeklyRecap}
          tone="communication"
        >
          <label className="space-y-1.5 text-sm font-medium">
            <span>Optional note for this email</span>
            <textarea
              className={`${inputClassName} min-h-32 resize-y`}
              value={weeklyRecapBody}
              onChange={(event) => setWeeklyRecapBody(event.target.value)}
              placeholder="Add a short message, or leave this blank"
            />
          </label>
          <AdminDryRunPreview preview={previews.weeklyRecapSendAll} />
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-semibold">Recommended order</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Send yourself a test first. Only use the purple button after the
              test looks right.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={jobs.weeklyRecapTest}
                disabled={
                  operationStatus.weeklyRecapTest.isBusy ||
                  operationStatus.weeklyRecapSendAll.isBusy
                }
              >
                <BusyIcon busy={operationStatus.weeklyRecapTest.isBusy} />
                {operationStatus.weeklyRecapTest.isBusy
                  ? "Sending test..."
                  : "1. Send test to me"}
              </Button>
              <Button
                className="bg-violet-700 text-white hover:bg-violet-800"
                onClick={() => requestConfirmation("weeklyRecapSendAll")}
                disabled={
                  !previews.weeklyRecapSendAll.canRun ||
                  operationStatus.weeklyRecapTest.isBusy ||
                  operationStatus.weeklyRecapSendAll.isBusy
                }
              >
                2. Review &amp; email everyone
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <AdminOperationFeedback
              label="Test email"
              status={operationStatus.weeklyRecapTest}
            />
            <AdminOperationFeedback
              label="Bulk email"
              status={operationStatus.weeklyRecapSendAll}
            />
          </div>
        </AdminOperationCard>

        <AdminOperationCard
          id="member-payment"
          category="Changes a balance"
          title="Record a member payment"
          description="Create a completed payment and add it to the member's account balance."
          whenToUse="You have received money from a member and need to record it in PGC."
          icon={WalletCards}
          status={operationStatus.createPayment}
          tone="financial"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Who paid?</span>
              <select
                className={inputClassName}
                value={paymentMemberId}
                onChange={(event) => setPaymentMemberId(event.target.value)}
                disabled={!members || operationStatus.createPayment.isBusy}
              >
                <option value="">
                  {members ? "Choose a member" : "Loading members..."}
                </option>
                {(members ?? []).map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Which season?</span>
              <select
                className={inputClassName}
                value={paymentSeasonId}
                onChange={(event) => setPaymentSeasonId(event.target.value)}
                disabled={!seasons || operationStatus.createPayment.isBusy}
              >
                <option value="">
                  {seasons ? "Choose a season" : "Loading seasons..."}
                </option>
                {(seasons ?? []).map((season) => (
                  <option key={season._id} value={season._id}>
                    {`${season.year} (Season ${season.number})`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>How much did they pay? (CAD)</span>
            <input
              className={inputClassName}
              value={paymentAmountDollars}
              onChange={(event) => setPaymentAmountDollars(event.target.value)}
              placeholder="Example: 100.00"
              inputMode="decimal"
              disabled={operationStatus.createPayment.isBusy}
            />
          </label>
          <AdminDryRunPreview preview={previews.createPayment} />
          <Button
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => requestConfirmation("createPayment")}
            disabled={
              !previews.createPayment.canRun ||
              operationStatus.createPayment.isBusy
            }
          >
            Review payment before recording
          </Button>
          <AdminOperationFeedback status={operationStatus.createPayment} />
        </AdminOperationCard>
      </OperationGroup>

      <details
        id="maintenance"
        className="group scroll-mt-20 overflow-hidden rounded-xl border-2 border-red-200 bg-red-50/30"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:content-none hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-red-100 p-2.5 text-red-800">
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
                Advanced — open only when fixing a problem
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Maintenance &amp; recovery tools
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Rebuild standings, repair tournament data, or import records.
                These are not part of a normal tournament week.
              </p>
            </div>
          </div>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-red-700 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="grid items-start gap-4 border-t border-red-200 bg-background p-4 sm:p-6 lg:grid-cols-2">
          <AdminOperationCard
            category="Standings recovery"
            title="Recalculate standings"
            description="Refresh official totals, or fully rebuild one season's standings data."
            whenToUse="Member points or positions look wrong after tournament results changed."
            icon={BarChart3}
            status={groupStatus.standings}
            tone="advanced"
          >
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Season to repair</span>
              <select
                className={inputClassName}
                value={recomputeSeasonId}
                onChange={(event) => setRecomputeSeasonId(event.target.value)}
                disabled={
                  !seasons ||
                  operationStatus.recomputeStandings.isBusy ||
                  operationStatus.backfillStandings.isBusy
                }
              >
                <option value="">
                  {seasons
                    ? "Current season (quick recalculation)"
                    : "Loading seasons..."}
                </option>
                {(seasons ?? []).map((season) => (
                  <option key={season._id} value={season._id}>
                    {`${season.year} (Season ${season.number})`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="font-semibold">Quick recalculation</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use first when the current standings totals look stale.
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={jobs.recomputeStandings}
                  disabled={
                    operationStatus.recomputeStandings.isBusy ||
                    operationStatus.backfillStandings.isBusy
                  }
                >
                  <BusyIcon busy={operationStatus.recomputeStandings.isBusy} />
                  {operationStatus.recomputeStandings.isBusy
                    ? "Recalculating..."
                    : "Recalculate"}
                </Button>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="font-semibold">Full season rebuild</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use only for missing or damaged historical standings data.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={jobs.backfillStandings}
                  disabled={
                    !recomputeSeasonId ||
                    operationStatus.recomputeStandings.isBusy ||
                    operationStatus.backfillStandings.isBusy
                  }
                >
                  <BusyIcon busy={operationStatus.backfillStandings.isBusy} />
                  {operationStatus.backfillStandings.isBusy
                    ? "Rebuilding..."
                    : "Rebuild season"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <AdminOperationFeedback
                label="Recalculation"
                status={operationStatus.recomputeStandings}
              />
              <AdminOperationFeedback
                label="Full rebuild"
                status={operationStatus.backfillStandings}
              />
            </div>
          </AdminOperationCard>

          <AdminOperationCard
            category="Search & leaderboard repair"
            title="Repair team metadata"
            description="Restore the lookup fields copied from each team's tour card."
            whenToUse="Teams are missing from a leaderboard or appear under the wrong member, tour, or playoff group."
            icon={Database}
            status={operationStatus.backfillTeamMetadata}
            tone="advanced"
          >
            <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-6">
              This scans all teams. It is safe to rerun and leaves
              already-correct teams unchanged.
            </p>
            <Button
              variant="outline"
              onClick={jobs.backfillTeamMetadata}
              disabled={operationStatus.backfillTeamMetadata.isBusy}
            >
              <BusyIcon busy={operationStatus.backfillTeamMetadata.isBusy} />
              {operationStatus.backfillTeamMetadata.isBusy
                ? "Repairing metadata..."
                : "Repair team metadata"}
            </Button>
            <AdminOperationFeedback
              status={operationStatus.backfillTeamMetadata}
            />
          </AdminOperationCard>

          <AdminOperationCard
            category="Score & standings repair"
            title="Repair one tournament"
            description="Resync a tournament, recalculate team awards, and update standings."
            whenToUse="A completed tournament has incorrect scores, positions, points, or payouts."
            icon={RotateCcw}
            status={operationStatus.repairTournament}
            tone="advanced"
          >
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Which tournament is wrong?</span>
              <select
                className={inputClassName}
                value={repairTournamentId}
                onChange={(event) => setRepairTournamentId(event.target.value)}
                disabled={
                  !tournaments || operationStatus.repairTournament.isBusy
                }
              >
                <option value="">
                  {tournaments
                    ? "Choose a tournament"
                    : "Loading tournaments..."}
                </option>
                {sortedTournaments.map((tournament) => (
                  <option key={tournament._id} value={tournament._id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <AdminDryRunPreview preview={previews.repairTournament} />
            <Button
              variant="destructive"
              onClick={() => requestConfirmation("repairTournament")}
              disabled={
                !previews.repairTournament.canRun ||
                operationStatus.repairTournament.isBusy
              }
            >
              Review tournament repair
            </Button>
            <AdminOperationFeedback status={operationStatus.repairTournament} />
          </AdminOperationCard>

          <AdminOperationCard
            category="Expert tool"
            title="Import teams from JSON"
            description="Create or overwrite team records using a structured data file."
            whenToUse="You have a prepared JSON export and cannot restore the teams through normal roster entry."
            icon={HardDriveDownload}
            status={operationStatus.importTeams}
            tone="advanced"
          >
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-semibold">
                Do not use this for normal team entry.
              </p>
              <p className="mt-1 text-xs leading-5">
                Matching records can be overwritten. Validate the preview before
                confirming.
              </p>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Target tournament</span>
              <select
                className={inputClassName}
                value={tournamentId}
                onChange={(event) => setTournamentId(event.target.value)}
                disabled={!tournaments || operationStatus.importTeams.isBusy}
              >
                <option value="">
                  {tournaments
                    ? "Choose a tournament"
                    : "Loading tournaments..."}
                </option>
                {sortedTournaments.map((tournament) => (
                  <option key={tournament._id} value={tournament._id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Teams JSON</span>
              <textarea
                className={`${inputClassName} min-h-48 resize-y font-mono text-xs`}
                value={teamsJson}
                onChange={(event) => setTeamsJson(event.target.value)}
                placeholder='[{"tourCardId":"...","golferIds":[...],"score":-9.2}]'
                spellCheck={false}
                disabled={operationStatus.importTeams.isBusy}
              />
            </label>
            <AdminDryRunPreview preview={previews.importTeams} />
            <Button
              variant="destructive"
              onClick={() => requestConfirmation("importTeams")}
              disabled={
                !previews.importTeams.canRun ||
                operationStatus.importTeams.isBusy
              }
            >
              Review team import
            </Button>
            <AdminOperationFeedback status={operationStatus.importTeams} />
          </AdminOperationCard>
        </div>
      </details>

      <AdminConfirmationDialog
        request={confirmation}
        busy={
          confirmation ? operationStatus[confirmation.operation].isBusy : false
        }
        onCancel={dismissConfirmation}
        onConfirm={confirmOperation}
      />
    </div>
  );
}

function OperationGroup({
  id,
  eyebrow,
  title,
  description,
  children,
}: AdminOperationGroupProps) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="border-b pb-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function TaskShortcut({
  href,
  icon: Icon,
  title,
  detail,
}: AdminTaskShortcutProps) {
  return (
    <a
      href={href}
      className="flex min-h-20 items-center gap-3 border-b border-r border-white/15 px-4 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white lg:border-b-0"
    >
      <Icon className="h-5 w-5 shrink-0 text-golf-200" aria-hidden="true" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-golf-200">{detail}</span>
      </span>
    </a>
  );
}

function BusyIcon({ busy }: AdminBusyIconProps) {
  return busy ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
  ) : null;
}
