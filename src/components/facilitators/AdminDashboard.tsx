import { Database, Loader2 } from "lucide-react";

import {
  AdminConfirmationDialog,
  AdminDryRunPreview,
  AdminHub,
  AdminOperationFeedback,
  AdminTaskPanel,
} from "@/displays";
import { SettlementHub } from "@/displays/admin/SettlementHub";
import { useAdminDashboard } from "@/hooks";
import type { AdminBusyIconProps } from "@/types";
import { Button } from "@/ui";

const inputClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

export function AdminDashboard() {
  const model = useAdminDashboard();

  return (
    <div className="container mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-8">
      <AdminHub
        overview={model.hubOverview}
        operationStatus={model.operationStatus}
        groupStatus={model.groupStatus}
        pendingSettlementCount={model.pendingSettlementCount}
        pendingTransferTotal={model.pendingTransferTotal}
        onOpenTask={model.openTask}
      />

      <AdminTaskPanel
        open={model.activeTask === "eventSetup"}
        title="Prepare the next tournament"
        description="Refresh the source rankings, then create Groups 1–5 for the next scheduled event."
        onClose={model.closeTask}
        footer={
          <>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              variant="outline"
              onClick={model.jobs.updateWorldRank}
              disabled={model.operationStatus.updateWorldRank.isBusy}
            >
              <BusyIcon busy={model.operationStatus.updateWorldRank.isBusy} />
              {model.operationStatus.updateWorldRank.isBusy
                ? "Refreshing…"
                : "1. Refresh rankings"}
            </Button>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              onClick={model.jobs.createGroups}
              disabled={model.operationStatus.createGroups.isBusy}
            >
              <BusyIcon busy={model.operationStatus.createGroups.isBusy} />
              {model.operationStatus.createGroups.isBusy
                ? "Creating…"
                : "2. Create groups"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4">
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-golf-700 text-xs font-bold text-white">
                  1
                </span>
                <div>
                  <p className="font-semibold">Refresh world rankings</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Pull the latest golfer rankings and country data from
                    DataGolf.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-golf-700 text-xs font-bold text-white">
                  2
                </span>
                <div>
                  <p className="font-semibold">Create golfer groups</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Build the five selection groups for the next event. This is
                    safe to retry before groups are final.
                  </p>
                </div>
              </li>
            </ol>
          </div>
          <AdminOperationFeedback
            label="Rankings"
            status={model.operationStatus.updateWorldRank}
          />
          <AdminOperationFeedback
            label="Groups"
            status={model.operationStatus.createGroups}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "liveScoring"}
        title="Update live scoring"
        description="Pull the newest player scores and recalculate the PGC leaderboard. Scheduled syncs normally run automatically."
        onClose={model.closeTask}
        footer={
          <>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => model.jobs.liveSync()}
              disabled={
                model.operationStatus.liveSync.isBusy ||
                model.operationStatus.liveSyncForce.isBusy
              }
            >
              <BusyIcon busy={model.operationStatus.liveSync.isBusy} />
              {model.operationStatus.liveSync.isBusy
                ? "Syncing…"
                : "Run normal sync"}
            </Button>
            <Button
              className="min-h-11 flex-1 border-amber-300 sm:flex-none"
              variant="outline"
              onClick={() => model.jobs.liveSync(true)}
              disabled={
                model.operationStatus.liveSync.isBusy ||
                model.operationStatus.liveSyncForce.isBusy
              }
            >
              <BusyIcon busy={model.operationStatus.liveSyncForce.isBusy} />
              {model.operationStatus.liveSyncForce.isBusy
                ? "Forcing…"
                : "Force sync"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-golf-200 bg-golf-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-golf-800">
              Use first
            </p>
            <p className="mt-1 font-semibold">Normal sync</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Safely skips work when the upstream feed has not changed.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Recovery only
            </p>
            <p className="mt-1 font-semibold">Force sync</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Reprocesses data even when the feed reports no change. Use this
              only after a normal sync leaves the leaderboard stale.
            </p>
          </div>
          <AdminOperationFeedback
            label="Normal sync"
            status={model.operationStatus.liveSync}
          />
          <AdminOperationFeedback
            label="Force sync"
            status={model.operationStatus.liveSyncForce}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "weeklyRecap"}
        title="Email the weekly recap"
        description="Add an optional note, send yourself a test, then review the recipient preview before emailing everyone."
        tone="communication"
        onClose={model.closeTask}
        footer={
          <>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              variant="outline"
              onClick={model.jobs.weeklyRecapTest}
              disabled={
                model.operationStatus.weeklyRecapTest.isBusy ||
                model.operationStatus.weeklyRecapSendAll.isBusy
              }
            >
              <BusyIcon busy={model.operationStatus.weeklyRecapTest.isBusy} />
              {model.operationStatus.weeklyRecapTest.isBusy
                ? "Sending test…"
                : "1. Send test to me"}
            </Button>
            <Button
              className="min-h-11 flex-1 bg-violet-700 text-white hover:bg-violet-800 sm:flex-none"
              onClick={() => model.requestConfirmation("weeklyRecapSendAll")}
              disabled={
                !model.previews.weeklyRecapSendAll.canRun ||
                model.operationStatus.weeklyRecapTest.isBusy ||
                model.operationStatus.weeklyRecapSendAll.isBusy
              }
            >
              2. Review &amp; send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            <span>Optional note</span>
            <textarea
              className={`${inputClassName} min-h-36 resize-y`}
              value={model.weeklyRecapBody}
              onChange={(event) => model.setWeeklyRecapBody(event.target.value)}
              placeholder="Add a short message, or leave this blank"
            />
          </label>
          <AdminDryRunPreview preview={model.previews.weeklyRecapSendAll} />
          <AdminOperationFeedback
            label="Test email"
            status={model.operationStatus.weeklyRecapTest}
          />
          <AdminOperationFeedback
            label="Bulk email"
            status={model.operationStatus.weeklyRecapSendAll}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "pickReminder"}
        title="Remind missing picks"
        description="Email active members who are eligible for the upcoming tournament and have not submitted their roster. Playoff qualification is calculated from current points."
        tone="communication"
        onClose={model.closeTask}
        footer={
          <Button
            className="min-h-11 w-full bg-violet-700 text-white hover:bg-violet-800 sm:w-auto"
            onClick={() => model.requestConfirmation("missingTeamReminderSend")}
            disabled={
              !model.previews.missingTeamReminderSend.canRun ||
              model.operationStatus.missingTeamReminderSend.isBusy
            }
          >
            <BusyIcon
              busy={model.operationStatus.missingTeamReminderSend.isBusy}
            />
            {model.operationStatus.missingTeamReminderSend.isBusy
              ? "Sending…"
              : "Review & send reminder"}
          </Button>
        }
      >
        <div className="space-y-4">
          <AdminDryRunPreview
            preview={model.previews.missingTeamReminderSend}
          />
          <AdminOperationFeedback
            status={model.operationStatus.missingTeamReminderSend}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "memberPayment"}
        title="Record a member payment"
        description="Create a completed payment and add it to the member’s account balance."
        tone="financial"
        onClose={model.closeTask}
        footer={
          <Button
            className="min-h-11 w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
            onClick={() => model.requestConfirmation("createPayment")}
            disabled={
              !model.previews.createPayment.canRun ||
              model.operationStatus.createPayment.isBusy
            }
          >
            Review payment
          </Button>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            <span>Who paid?</span>
            <select
              className={inputClassName}
              value={model.paymentMemberId}
              onChange={(event) => model.setPaymentMemberId(event.target.value)}
              disabled={
                !model.members || model.operationStatus.createPayment.isBusy
              }
            >
              <option value="">
                {model.members ? "Choose a member" : "Loading members…"}
              </option>
              {(model.members ?? []).map((member) => (
                <option key={member._id} value={member._id}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Which season?</span>
            <select
              className={inputClassName}
              value={model.paymentSeasonId}
              onChange={(event) => model.setPaymentSeasonId(event.target.value)}
              disabled={
                !model.seasons || model.operationStatus.createPayment.isBusy
              }
            >
              <option value="">
                {model.seasons ? "Choose a season" : "Loading seasons…"}
              </option>
              {(model.seasons ?? []).map((season) => (
                <option key={season._id} value={season._id}>
                  {`${season.year} (Season ${season.number})`}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Amount paid (CAD)</span>
            <input
              className={inputClassName}
              value={model.paymentAmountDollars}
              onChange={(event) =>
                model.setPaymentAmountDollars(event.target.value)
              }
              placeholder="100.00"
              inputMode="decimal"
              disabled={model.operationStatus.createPayment.isBusy}
            />
          </label>
          <AdminDryRunPreview preview={model.previews.createPayment} />
          <AdminOperationFeedback
            status={model.operationStatus.createPayment}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "settlements"}
        title="Process payout requests"
        description="Complete each real-world transfer or allocation. A request closes when every item is checked off."
        tone="financial"
        onClose={model.closeTask}
      >
        <SettlementHub
          embedded
          requests={model.settlementRequests}
          visibleRequests={model.visibleSettlementRequests}
          filter={model.settlementFilter}
          onFilterChange={model.setSettlementFilter}
          pendingCount={model.pendingSettlementCount}
          pendingTransferTotal={model.pendingTransferTotal}
          busyKey={model.settlementBusyKey}
          feedback={model.settlementFeedback}
          creditingWinnings={model.creditingWinnings}
          onCreditWinnings={model.creditSeasonWinnings}
          onComplete={model.completeSettlement}
          onCancel={model.cancelSettlement}
        />
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "standings"}
        title="Repair standings"
        description="Use a quick recalculation first. A full rebuild is for missing or damaged historical standings data."
        tone="advanced"
        onClose={model.closeTask}
        footer={
          <>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              onClick={model.jobs.recomputeStandings}
              disabled={
                model.operationStatus.recomputeStandings.isBusy ||
                model.operationStatus.backfillStandings.isBusy
              }
            >
              <BusyIcon
                busy={model.operationStatus.recomputeStandings.isBusy}
              />
              {model.operationStatus.recomputeStandings.isBusy
                ? "Recalculating…"
                : "Recalculate"}
            </Button>
            <Button
              className="min-h-11 flex-1 border-red-300 text-red-800 sm:flex-none"
              variant="outline"
              onClick={model.jobs.backfillStandings}
              disabled={
                !model.recomputeSeasonId ||
                model.operationStatus.recomputeStandings.isBusy ||
                model.operationStatus.backfillStandings.isBusy
              }
            >
              <BusyIcon busy={model.operationStatus.backfillStandings.isBusy} />
              {model.operationStatus.backfillStandings.isBusy
                ? "Rebuilding…"
                : "Rebuild season"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            <span>Season to repair</span>
            <select
              className={inputClassName}
              value={model.recomputeSeasonId}
              onChange={(event) =>
                model.setRecomputeSeasonId(event.target.value)
              }
              disabled={
                !model.seasons ||
                model.operationStatus.recomputeStandings.isBusy ||
                model.operationStatus.backfillStandings.isBusy
              }
            >
              <option value="">
                {model.seasons
                  ? "Current season (quick recalculation)"
                  : "Loading seasons…"}
              </option>
              {(model.seasons ?? []).map((season) => (
                <option key={season._id} value={season._id}>
                  {`${season.year} (Season ${season.number})`}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Quick recalculation</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Refresh official totals for the current season.
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-semibold">Full season rebuild</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Recreate historical standings contributions for the selected
                season.
              </p>
            </div>
          </div>
          <AdminOperationFeedback
            label="Recalculation"
            status={model.operationStatus.recomputeStandings}
          />
          <AdminOperationFeedback
            label="Full rebuild"
            status={model.operationStatus.backfillStandings}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "teamMetadata"}
        title="Repair team metadata"
        description="Restore the lookup fields copied from each team’s tour card. This is safe to rerun."
        tone="advanced"
        onClose={model.closeTask}
        footer={
          <Button
            className="min-h-11 w-full sm:w-auto"
            variant="outline"
            onClick={model.jobs.backfillTeamMetadata}
            disabled={model.operationStatus.backfillTeamMetadata.isBusy}
          >
            <BusyIcon
              busy={model.operationStatus.backfillTeamMetadata.isBusy}
            />
            {model.operationStatus.backfillTeamMetadata.isBusy
              ? "Repairing…"
              : "Repair team metadata"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border bg-muted/30 p-4">
            <Database
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm leading-6">
              Use this when teams are missing from a leaderboard or appear under
              the wrong member, tour, or playoff group. Already-correct teams
              remain unchanged.
            </p>
          </div>
          <AdminOperationFeedback
            status={model.operationStatus.backfillTeamMetadata}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "repairTournament"}
        title="Repair one tournament"
        description="Resync a completed tournament, recalculate team awards, and update affected standings."
        tone="advanced"
        onClose={model.closeTask}
        footer={
          <Button
            className="min-h-11 w-full sm:w-auto"
            variant="destructive"
            onClick={() => model.requestConfirmation("repairTournament")}
            disabled={
              !model.previews.repairTournament.canRun ||
              model.operationStatus.repairTournament.isBusy
            }
          >
            Review tournament repair
          </Button>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            <span>Which tournament is wrong?</span>
            <select
              className={inputClassName}
              value={model.repairTournamentId}
              onChange={(event) =>
                model.setRepairTournamentId(event.target.value)
              }
              disabled={
                !model.tournaments ||
                model.operationStatus.repairTournament.isBusy
              }
            >
              <option value="">
                {model.tournaments
                  ? "Choose a tournament"
                  : "Loading tournaments…"}
              </option>
              {model.sortedTournaments.map((tournament) => (
                <option key={tournament._id} value={tournament._id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </label>
          <AdminDryRunPreview preview={model.previews.repairTournament} />
          <AdminOperationFeedback
            status={model.operationStatus.repairTournament}
          />
        </div>
      </AdminTaskPanel>

      <AdminTaskPanel
        open={model.activeTask === "importTeams"}
        title="Import teams from JSON"
        description="Expert recovery tool for creating or overwriting teams from a prepared structured export."
        tone="advanced"
        onClose={model.closeTask}
        footer={
          <Button
            className="min-h-11 w-full sm:w-auto"
            variant="destructive"
            onClick={() => model.requestConfirmation("importTeams")}
            disabled={
              !model.previews.importTeams.canRun ||
              model.operationStatus.importTeams.isBusy
            }
          >
            Review team import
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Do not use this for normal entry.</p>
            <p className="mt-1 leading-6">
              Matching records can be overwritten. Validate the preview before
              confirming.
            </p>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            <span>Target tournament</span>
            <select
              className={inputClassName}
              value={model.tournamentId}
              onChange={(event) => model.setTournamentId(event.target.value)}
              disabled={
                !model.tournaments || model.operationStatus.importTeams.isBusy
              }
            >
              <option value="">
                {model.tournaments
                  ? "Choose a tournament"
                  : "Loading tournaments…"}
              </option>
              {model.sortedTournaments.map((tournament) => (
                <option key={tournament._id} value={tournament._id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Teams JSON</span>
            <textarea
              className={`${inputClassName} min-h-56 resize-y font-mono text-xs`}
              value={model.teamsJson}
              onChange={(event) => model.setTeamsJson(event.target.value)}
              placeholder='[{"tourCardId":"…","golferIds":[…],"score":-9.2}]'
              spellCheck={false}
              disabled={model.operationStatus.importTeams.isBusy}
            />
          </label>
          <AdminDryRunPreview preview={model.previews.importTeams} />
          <AdminOperationFeedback status={model.operationStatus.importTeams} />
        </div>
      </AdminTaskPanel>

      <AdminConfirmationDialog
        request={model.confirmation}
        busy={
          model.confirmation
            ? model.operationStatus[model.confirmation.operation].isBusy
            : false
        }
        onCancel={model.dismissConfirmation}
        onConfirm={model.confirmOperation}
      />
    </div>
  );
}

function BusyIcon({ busy }: AdminBusyIconProps) {
  return busy ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
  ) : null;
}
