import { Show } from "@clerk/tanstack-react-start";
import {
  CircleDollarSign,
  Flag,
  Landmark,
  LogOut,
  Medal,
  ShieldCheck,
  Target,
  Trophy,
  WalletCards,
} from "lucide-react";

import { useAccountPage } from "@/hooks";
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
    <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8 pb-24 lg:pb-10">
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
            <header className="from-golf-950 overflow-hidden rounded-3xl border bg-gradient-to-br via-golf-900 to-golf-700 text-white shadow-lg">
              <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                    <Trophy
                      className="h-6 w-6 text-amber-300"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-golf-200">
                    PGC Tour career
                  </p>
                  <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                    {[vm.overview.member.firstname, vm.overview.member.lastname]
                      .filter(Boolean)
                      .join(" ") || "My account"}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-golf-100">
                    Every tour card, trophy, point, and dollar from your time on
                    tour.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => vm.signOut({ redirectUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  Log out
                </Button>
              </div>
              <div className="grid border-t border-white/15 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
                <HeroStat
                  label="Career earnings"
                  value={formatMoney(vm.overview.career.earningsCents, true)}
                />
                <HeroStat
                  label="PGC Cup points"
                  value={formatNumber(vm.overview.career.points)}
                />
                <HeroStat
                  label="Tournament wins"
                  value={vm.overview.career.wins}
                />
                <HeroStat
                  label="Seasons on tour"
                  value={vm.overview.career.seasonsPlayed}
                />
              </div>
            </header>

            <section aria-labelledby="career-stats-title">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
                  Career numbers
                </p>
                <h2 id="career-stats-title" className="mt-1 text-2xl font-bold">
                  Tour record
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                    Trophy case
                  </p>
                  <h2
                    id="trophy-case-title"
                    className="mt-1 text-2xl font-bold"
                  >
                    Wins and accomplishments
                  </h2>
                </div>
                <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                  {vm.overview.achievements.length} trophies
                </div>
              </div>
              {vm.overview.achievements.length === 0 ? (
                <Card className="border-dashed bg-amber-50/40">
                  <CardContent className="flex flex-col items-center py-12 text-center">
                    <Medal
                      className="h-10 w-10 text-amber-500"
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {vm.overview.achievements.map((achievement) => (
                    <Card
                      key={achievement.id}
                      className={
                        achievement.isMajor
                          ? "overflow-hidden border-amber-300 bg-gradient-to-br from-amber-50 to-white"
                          : "overflow-hidden"
                      }
                    >
                      <CardContent className="flex gap-4 p-5">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-100 ring-1 ring-amber-200">
                          {achievement.logoUrl ? (
                            <img
                              src={achievement.logoUrl}
                              alt=""
                              className="h-12 w-12 object-contain"
                            />
                          ) : (
                            <Trophy
                              className="h-8 w-8 text-amber-700"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                              {achievement.isMajor
                                ? "Major champion"
                                : achievement.tierName}
                            </span>
                            {achievement.isPlayoff ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                                Playoff
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 truncate text-lg font-bold">
                            {achievement.tournamentName}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {achievement.tourName} · {achievement.seasonLabel}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-golf-800">
                            {formatNumber(achievement.points)} pts ·{" "}
                            {formatMoney(achievement.earningsCents, true)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="tour-cards-title">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
                  Season by season
                </p>
                <h2 id="tour-cards-title" className="mt-1 text-2xl font-bold">
                  Tour cards
                </h2>
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
                    <Card
                      key={card._id}
                      className={
                        card.isCurrent
                          ? "border-golf-400 ring-1 ring-golf-200"
                          : ""
                      }
                    >
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
                                className="h-9 w-9 text-golf-700"
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
                            <span className="rounded-full bg-golf-100 px-2.5 py-1 text-xs font-bold text-golf-800">
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
              <Card className="overflow-hidden border-golf-200 shadow-md">
                <CardHeader className="border-b bg-golf-50/70">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-golf-800 p-2.5 text-white">
                      <WalletCards className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
                        Season settlement
                      </p>
                      <CardTitle id="earnings-title" className="mt-1">
                        Tell us where your earnings should go
                      </CardTitle>
                      <CardDescription className="mt-2 max-w-2xl">
                        Allocate the full available amount. PGC administrators
                        will process and check off each instruction.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <label className="block max-w-sm space-y-1.5 text-sm font-medium">
                    <span>Season</span>
                    <select
                      className={inputClassName}
                      value={vm.selectedSeasonId}
                      onChange={(event) =>
                        vm.setSelectedSeasonId(event.target.value)
                      }
                    >
                      {vm.overview.seasonFinancials.map((financial) => (
                        <option
                          key={financial.seasonId}
                          value={financial.seasonId}
                        >
                          {financial.seasonLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  {vm.selectedFinancial ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <FinancialSummary
                          icon={
                            <CircleDollarSign
                              className="h-5 w-5"
                              aria-hidden="true"
                            />
                          }
                          label="Official earnings"
                          value={formatMoney(
                            vm.selectedFinancial.earningsCents,
                            true,
                          )}
                        />
                        <FinancialSummary
                          icon={
                            <Landmark className="h-5 w-5" aria-hidden="true" />
                          }
                          label="Applied to balance"
                          value={formatMoney(
                            vm.selectedFinancial.accountOffsetCents,
                            true,
                          )}
                        />
                        <FinancialSummary
                          icon={
                            <Target className="h-5 w-5" aria-hidden="true" />
                          }
                          label="Available to allocate"
                          value={formatMoney(
                            vm.selectedFinancial.availableCents,
                            true,
                          )}
                          featured
                        />
                      </div>

                      {vm.request && vm.request.status !== "cancelled" ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                          <div className="flex items-start gap-3">
                            <ShieldCheck
                              className="mt-0.5 h-5 w-5 text-blue-700"
                              aria-hidden="true"
                            />
                            <div>
                              <p className="font-semibold text-blue-950">
                                Request{" "}
                                {settlementStatusLabel(
                                  vm.request.status,
                                ).toLowerCase()}
                              </p>
                              <p className="mt-1 text-sm text-blue-900/80">
                                Submitted{" "}
                                {new Intl.DateTimeFormat("en-CA", {
                                  dateStyle: "medium",
                                }).format(vm.request.submittedAt)}
                                . Your instructions are now in the admin payout
                                hub.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-blue-950">
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
                      ) : !vm.selectedFinancial.isComplete ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                          Your earnings are updating throughout the season.
                          Allocation requests open when the season is complete.
                        </div>
                      ) : vm.selectedFinancial.availableCents <= 0 ? (
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
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

                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/30">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-golf-700"
                              checked={vm.nextSeasonCard}
                              onChange={(event) =>
                                vm.setNextSeasonCard(event.target.checked)
                              }
                              disabled={
                                vm.submitting ||
                                !vm.canSubmitSettlement ||
                                vm.selectedFinancial.availableCents < 10_000
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

                          <div className="grid gap-4 rounded-xl bg-slate-950 p-5 text-white sm:grid-cols-[1fr_auto] sm:items-center">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Still to allocate
                              </p>
                              <p
                                className={
                                  vm.parsedAmounts.remainingCents < 0
                                    ? "mt-1 text-2xl font-bold text-red-300"
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
                              className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
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
                      No season earnings are available yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="profile-title">
              <Card>
                <CardHeader>
                  <CardTitle id="profile-title">Profile</CardTitle>
                  <CardDescription>
                    Update the name shown on your account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
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

function HeroStat(props: AccountStatProps) {
  return (
    <div className="border-white/15 px-6 py-4 last:border-r-0 sm:border-r">
      <p className="text-xs uppercase tracking-wide text-golf-200">
        {props.label}
      </p>
      <p className="mt-1 text-xl font-bold">{props.value}</p>
    </div>
  );
}

function AccountStat(props: AccountStatProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">
          {props.label}
        </p>
        <p className="mt-1 text-2xl font-bold">{props.value}</p>
        {props.detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
        ) : null}
      </CardContent>
    </Card>
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
    <div
      className={
        props.featured
          ? "rounded-xl border border-golf-300 bg-golf-50 p-4"
          : "rounded-xl border p-4"
      }
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {props.icon}
        <p className="text-xs font-medium uppercase tracking-wide">
          {props.label}
        </p>
      </div>
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
      <Skeleton className="h-72 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
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
