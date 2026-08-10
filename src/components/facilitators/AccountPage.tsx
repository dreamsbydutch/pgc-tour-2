import { Show } from "@clerk/tanstack-react-start";
import { Flag, LogOut, ShieldCheck, Trophy, WalletCards } from "lucide-react";

import { useAccountPage } from "@/hooks";
import { NotificationPreferencesCard } from "@/displays";
import type {
  AccountStatProps,
  FinancialSummaryProps,
  SettlementAllocationInputProps,
} from "@/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/ui";
import { formatMoney, formatNumber } from "@/utils/app";
import { settlementStatusLabel } from "@/utils";

const inputClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function AccountPage() {
  const vm = useAccountPage();

  return (
    <div className="container mx-auto max-w-5xl space-y-10 px-4 py-8 pb-24 lg:pb-10">
      <Show when="signed-out">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Sign in to your PGC account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => vm.openSignIn()}>Sign in</Button>
          </CardContent>
        </Card>
      </Show>

      <Show when="signed-in">
        {vm.isLoading || !vm.overview ? (
          <AccountPageSkeleton />
        ) : (
          <>
            <header className="border-b border-gray-300 pb-8 text-center">
              <h1 className="font-yellowtail text-5xl font-bold sm:text-6xl md:text-7xl">
                My Account
              </h1>
              <p className="mt-2 text-lg font-semibold">
                {[vm.overview.member.firstname, vm.overview.member.lastname]
                  .filter(Boolean)
                  .join(" ") || "PGC member"}
              </p>
              <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Your tour record, earnings instructions, notification settings,
                and profile details.
              </p>
              <div className="mt-5 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => vm.signOut({ redirectUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  Log out
                </Button>
              </div>
            </header>

            <section aria-labelledby="career-stats-title">
              <div className="mb-4">
                <h2 id="career-stats-title" className="text-2xl font-bold">
                  Tour record
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Career totals across every PGC season.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                <AccountStat
                  label="Career earnings"
                  value={formatMoney(vm.overview.career.earningsCents, true)}
                />
                <AccountStat
                  label="Seasons"
                  value={vm.overview.career.seasonsPlayed}
                />
                <AccountStat label="Wins" value={vm.overview.career.wins} />
                <AccountStat
                  label="Top 5s"
                  value={vm.overview.career.topFive}
                />
                <AccountStat
                  label="Top 10s"
                  value={vm.overview.career.topTen}
                />
                <AccountStat
                  label="Cuts made"
                  value={vm.overview.career.madeCut}
                  detail={`of ${vm.overview.career.appearances} starts`}
                />
                <AccountStat
                  label="Tour cards"
                  value={vm.overview.career.tourCards}
                />
                <AccountStat
                  label="Points"
                  value={formatNumber(vm.overview.career.points)}
                />
              </div>
            </section>

            <section aria-labelledby="trophy-case-title">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 id="trophy-case-title" className="text-2xl font-bold">
                    Career wins
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tournament titles and completed playoff championships.
                  </p>
                </div>
                <div className="shrink-0 text-sm font-medium text-muted-foreground">
                  {vm.overview.achievements.length}{" "}
                  {vm.overview.achievements.length === 1 ? "win" : "wins"}
                </div>
              </div>
              {vm.overview.achievements.length === 0 ? (
                <Card className="border-dashed shadow-none">
                  <CardContent className="flex flex-col items-center py-12 text-center">
                    <Trophy
                      className="h-9 w-9 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="mt-3 font-semibold">
                      Your trophy case is ready.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tournament wins will appear here after results are
                      official.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 md:grid-cols-6">
                  {vm.overview.achievements.map((achievement) => (
                    <div
                      key={achievement.id}
                      className="flex min-h-36 flex-col items-center justify-center bg-card p-4 text-center"
                      title={achievement.tournamentName}
                    >
                      {achievement.logoUrl ? (
                        <img
                          src={achievement.logoUrl}
                          alt={`${achievement.tournamentName} logo`}
                          className="h-16 w-16 object-contain"
                        />
                      ) : (
                        <Trophy
                          className="h-14 w-14 text-foreground"
                          aria-label={achievement.tournamentName}
                        />
                      )}
                      <p className="mt-3 text-lg font-bold">
                        {achievement.year ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="tour-cards-title">
              <div className="mb-4">
                <h2 id="tour-cards-title" className="text-2xl font-bold">
                  Tour cards
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your results and position for each season.
                </p>
              </div>
              {vm.overview.tourCards.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No tour cards yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {vm.overview.tourCards.map((card) => (
                    <Card key={card._id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            {card.tourLogoUrl ? (
                              <img
                                src={card.tourLogoUrl}
                                alt=""
                                className="h-11 w-11 object-contain"
                              />
                            ) : (
                              <Flag
                                className="h-9 w-9 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                            <div className="min-w-0">
                              <CardTitle className="truncate text-lg">
                                {card.tourName}
                              </CardTitle>
                              <CardDescription>
                                {card.seasonLabel}
                              </CardDescription>
                            </div>
                          </div>
                          {card.isCurrent ? (
                            <span className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-bold">
                              Current
                            </span>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-4 border-t pt-4 text-center sm:grid-cols-6">
                          <MiniStat
                            label="Position"
                            value={card.currentPosition}
                          />
                          <MiniStat
                            label="Points"
                            value={formatNumber(card.points)}
                          />
                          <MiniStat
                            label="Earnings"
                            value={formatMoney(card.earningsCents, false)}
                          />
                          <MiniStat label="Wins" value={card.wins} />
                          <MiniStat label="Top 10" value={card.topTen} />
                          <MiniStat
                            label="Cuts"
                            value={`${card.madeCut}/${card.appearances}`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section id="earnings" aria-labelledby="earnings-title">
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md border bg-background p-2.5 text-foreground">
                      <WalletCards className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <CardTitle id="earnings-title">
                        Current season earnings
                      </CardTitle>
                      <CardDescription className="mt-2 max-w-2xl">
                        Tell us where the available amount should go. PGC
                        administrators will process each instruction.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {vm.currentSeasonFinancial ? (
                    <>
                      <p className="text-sm font-semibold">
                        {vm.currentSeasonFinancial.seasonLabel}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <FinancialSummary
                          label="Official earnings"
                          value={formatMoney(
                            vm.currentSeasonFinancial.earningsCents,
                            true,
                          )}
                        />
                        <FinancialSummary
                          label="Applied to balance"
                          value={formatMoney(
                            vm.currentSeasonFinancial.accountOffsetCents,
                            true,
                          )}
                        />
                        <FinancialSummary
                          label="Available to allocate"
                          value={formatMoney(
                            vm.currentSeasonFinancial.availableCents,
                            true,
                          )}
                        />
                      </div>

                      {vm.request && vm.request.status !== "cancelled" ? (
                        <div className="rounded-lg border bg-muted/30 p-5">
                          <div className="flex items-start gap-3">
                            <ShieldCheck
                              className="mt-0.5 h-5 w-5 text-foreground"
                              aria-hidden="true"
                            />
                            <div>
                              <p className="font-semibold">
                                Request{" "}
                                {settlementStatusLabel(
                                  vm.request.status,
                                ).toLowerCase()}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Submitted{" "}
                                {new Intl.DateTimeFormat("en-CA", {
                                  dateStyle: "medium",
                                }).format(vm.request.submittedAt)}
                                . Your instructions are now in the admin payout
                                hub.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                <span>
                                  E-transfer{" "}
                                  {formatMoney(vm.request.transferCents, true)}
                                </span>
                                <span>
                                  Charity{" "}
                                  {formatMoney(vm.request.charityCents, true)}
                                </span>
                                <span>
                                  League{" "}
                                  {formatMoney(vm.request.leagueCents, true)}
                                </span>
                                <span>
                                  Next card{" "}
                                  {formatMoney(
                                    vm.request.nextSeasonCardCents,
                                    true,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : !vm.currentSeasonFinancial.isComplete ? (
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                          Your earnings are updating throughout the season.
                          Allocation requests open when the season is complete.
                        </div>
                      ) : vm.currentSeasonFinancial.availableCents <= 0 ? (
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                          There are no earnings available to allocate for this
                          season.
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <div className="grid gap-4 md:grid-cols-3">
                            <AllocationInput
                              id="account-transfer"
                              label="E-transfer"
                              description="Cash sent to your payout email."
                              value={vm.transferAmount}
                              onChange={vm.setTransferAmount}
                              disabled={
                                !vm.canSubmitSettlement || vm.submitting
                              }
                            />
                            <AllocationInput
                              id="account-charity"
                              label="Charity donation"
                              description="Donate part of your winnings to charity."
                              value={vm.charityAmount}
                              onChange={vm.setCharityAmount}
                              disabled={
                                !vm.canSubmitSettlement || vm.submitting
                              }
                            />
                            <AllocationInput
                              id="account-league"
                              label="League donation"
                              description="Put winnings back toward PGC league costs."
                              value={vm.leagueAmount}
                              onChange={vm.setLeagueAmount}
                              disabled={
                                !vm.canSubmitSettlement || vm.submitting
                              }
                            />
                          </div>

                          {vm.parsedAmounts.transferCents > 0 ? (
                            <label className="block max-w-lg space-y-1.5 text-sm font-medium">
                              <span>E-transfer email</span>
                              <input
                                className={inputClassName}
                                type="email"
                                autoComplete="email"
                                value={vm.payoutEmail}
                                onChange={(event) =>
                                  vm.setPayoutEmail(event.target.value)
                                }
                                disabled={vm.submitting}
                              />
                            </label>
                          ) : null}

                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/30">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-slate-900"
                              checked={vm.nextSeasonCard}
                              onChange={(event) =>
                                vm.setNextSeasonCard(event.target.checked)
                              }
                              disabled={
                                vm.submitting ||
                                !vm.canSubmitSettlement ||
                                vm.currentSeasonFinancial.availableCents <
                                  10_000
                              }
                            />
                            <div>
                              <span className="font-semibold">
                                Reserve $100 for next season’s tour card
                              </span>
                              <p className="mt-1 text-sm text-muted-foreground">
                                This stays as account credit and will be used
                                when next season’s card fee is charged.
                              </p>
                            </div>
                          </label>

                          <div className="grid gap-4 rounded-lg border bg-muted/30 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Still to allocate
                              </p>
                              <p
                                className={
                                  vm.parsedAmounts.remainingCents < 0
                                    ? "mt-1 text-2xl font-bold text-red-700"
                                    : "mt-1 text-2xl font-bold"
                                }
                              >
                                {formatMoney(
                                  vm.parsedAmounts.remainingCents,
                                  true,
                                )}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="bg-background"
                              onClick={vm.allocateRemainingToTransfer}
                              disabled={
                                !vm.parsedAmounts.valid ||
                                vm.parsedAmounts.remainingCents < 0
                              }
                            >
                              Put the remainder in e-transfer
                            </Button>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <Button
                              size="lg"
                              onClick={vm.onSubmitSettlement}
                              disabled={
                                vm.submitting ||
                                vm.parsedAmounts.remainingCents !== 0
                              }
                            >
                              {vm.submitting
                                ? "Submitting…"
                                : "Submit earnings instructions"}
                            </Button>
                            {vm.submitError ? (
                              <p role="alert" className="text-sm text-red-700">
                                {vm.submitError}
                              </p>
                            ) : null}
                            {vm.submitSuccess ? (
                              <p
                                role="status"
                                className="text-sm text-green-700"
                              >
                                {vm.submitSuccess}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No current-season earnings are available yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section aria-label="Notification preferences">
              <NotificationPreferencesCard />
            </section>

            <section aria-labelledby="profile-title">
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle id="profile-title">Profile</CardTitle>
                  <CardDescription>
                    Update the name shown on your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor="account-first-name"
                    >
                      <span>First name</span>
                      <input
                        id="account-first-name"
                        className={inputClassName}
                        value={vm.firstName}
                        onChange={(event) =>
                          vm.setFirstName(event.target.value)
                        }
                      />
                    </label>
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor="account-last-name"
                    >
                      <span>Last name</span>
                      <input
                        id="account-last-name"
                        className={inputClassName}
                        value={vm.lastName}
                        onChange={(event) => vm.setLastName(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button onClick={vm.onSaveProfile} disabled={vm.saving}>
                      {vm.saving ? "Saving…" : "Save profile"}
                    </Button>
                    {vm.saveError ? (
                      <p role="alert" className="text-sm text-red-700">
                        {vm.saveError}
                      </p>
                    ) : null}
                    {vm.saveSuccess ? (
                      <p role="status" className="text-sm text-green-700">
                        {vm.saveSuccess}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </Show>
    </div>
  );
}

function AccountStat(props: AccountStatProps) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-2xl font-bold">{props.value}</p>
      {props.detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
      ) : null}
    </div>
  );
}

function MiniStat(props: AccountStatProps) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-1 text-sm font-bold">{props.value}</p>
    </div>
  );
}

function FinancialSummary(props: FinancialSummaryProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-2 text-xl font-bold">{props.value}</p>
    </div>
  );
}

function AllocationInput(props: SettlementAllocationInputProps) {
  return (
    <label className="space-y-1.5 text-sm font-medium" htmlFor={props.id}>
      <span>{props.label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <input
          id={props.id}
          className={`${inputClassName} pl-7`}
          inputMode="decimal"
          placeholder="0.00"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
        />
      </div>
      <p className="text-xs font-normal leading-5 text-muted-foreground">
        {props.description}
      </p>
    </label>
  );
}

function AccountPageSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading account">
      <div className="space-y-3 border-b pb-8 text-center">
        <Skeleton className="mx-auto h-14 w-64" />
        <Skeleton className="mx-auto h-5 w-40" />
        <Skeleton className="mx-auto h-9 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
