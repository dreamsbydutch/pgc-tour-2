import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleUserRound,
  CreditCard,
  Flag,
  History,
  Landmark,
  LogOut,
  Mail,
  Medal,
  PencilLine,
  PiggyBank,
  Send,
  Settings2,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
} from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { loadNotificationCenter } from "@/displays";
import { useAccountPage } from "@/hooks";
import type {
  AccountOverviewDto,
  AccountPrototypeVariant,
  AccountSeasonFinancial,
  AccountTournamentHistory,
  AccountTransaction,
} from "@/types";
import { Button, PrototypeSwitcher, Skeleton } from "@/ui";
import { NEXT_SEASON_CARD_CENTS } from "@/utils";
import { cn, formatMoney, formatToPar } from "@/utils/app";

const NotificationCenter = lazy(async () => {
  const module = await loadNotificationCenter();
  return { default: module.NotificationCenter };
});

const prototypeOptions = [
  { key: "a", label: "Minimal account" },
  { key: "b", label: "Focused account hub" },
  { key: "c", label: "Career scorecard" },
] as const;

type PrototypeProps = {
  variant: AccountPrototypeVariant;
  onVariantChange: (variant: AccountPrototypeVariant) => void;
};

type ReadyProps = {
  overview: AccountOverviewDto;
  vm: ReturnType<typeof useAccountPage>;
  onPrototypeAction: (message: string) => void;
};

/**
 * Three variants of the Account page, switchable via `?variant=`, on the
 * existing `/account` route. This is a read-only prototype: actions never
 * persist profile or settlement changes.
 */
export function AccountPagePrototype(props: PrototypeProps) {
  const vm = useAccountPage();
  const [notice, setNotice] = useState<string | null>(null);

  if (vm.isLoading) return <AccountPrototypeSkeleton />;
  if (!vm.overview) return null;

  const variantProps: ReadyProps = {
    overview: vm.overview,
    vm,
    onPrototypeAction: setNotice,
  };

  return (
    <>
      <div
        className={cn(
          "pb-24",
          props.variant === "a" ? "bg-white" : "bg-slate-50/70",
        )}
      >
        {notice ? (
          <div className="container mx-auto max-w-6xl px-4 pt-4">
            <div
              role="status"
              className={cn(
                "flex items-center justify-between gap-4 px-4 py-3 text-sm",
                props.variant === "a"
                  ? "border-y border-slate-300 text-slate-700"
                  : "rounded-xl border border-lime-300 bg-lime-50 text-lime-950",
              )}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                {notice} This prototype did not save anything.
              </span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="font-semibold underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {props.variant === "a" ? <VariantA {...variantProps} /> : null}
        {props.variant === "b" ? <VariantB {...variantProps} /> : null}
        {props.variant === "c" ? <VariantC {...variantProps} /> : null}
      </div>

      <PrototypeSwitcher
        current={props.variant}
        options={prototypeOptions}
        onChange={props.onVariantChange}
      />
    </>
  );
}

function VariantA(props: ReadyProps) {
  const memberName = getMemberName(props.overview);
  const newestCard = props.overview.tourCards[0];
  const financial = props.overview.currentSeasonFinancial;
  const needsPayoutAction = Boolean(
    financial?.isComplete &&
      financial.availableCents > 0 &&
      (!financial.request || financial.request.status === "cancelled"),
  );

  return (
    <main className="container mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Account
            </h1>
            <p className="mt-2 truncate text-sm text-slate-500">
              {memberName}
              {newestCard
                ? ` · ${newestCard.tourName} · ${newestCard.seasonLabel}`
                : " · Your PGC career starts here"}
            </p>
          </div>
          <HeaderActions vm={props.vm} />
        </div>

        <dl className="mt-7 grid grid-cols-2 border-t border-slate-200 sm:grid-cols-4 sm:divide-x sm:divide-slate-200 sm:border-y">
          <MinimalStat
            label="Career earnings"
            value={formatMoney(props.overview.career.earningsCents, false)}
          />
          <MinimalStat
            label="PGC Cup points"
            value={formatNumber(props.overview.career.points)}
          />
          <MinimalStat
            label="Tournament wins"
            value={props.overview.career.wins}
          />
          <MinimalStat
            label="Seasons played"
            value={props.overview.career.seasonsPlayed}
          />
        </dl>
      </header>

      {needsPayoutAction && financial ? (
        <a
          href="#payout-instructions"
          className="group flex items-center justify-between gap-5 border-b-2 border-slate-950 bg-slate-950 px-4 py-4 text-white sm:px-5"
        >
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-300">
              Payout action required
            </p>
            <p className="mt-1 text-sm sm:text-base">
              <strong>{formatMoney(financial.availableCents, true)}</strong> is
              ready. Choose how you want to receive it.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide sm:text-sm">
            <span className="hidden sm:inline">Go to payments</span>
            <ArrowRight
              className="h-5 w-5 rotate-90 transition-transform group-hover:translate-y-1 lg:rotate-0 lg:group-hover:translate-x-1 lg:group-hover:translate-y-0"
              aria-hidden="true"
            />
          </span>
        </a>
      ) : null}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 lg:pr-10">
          <section className="border-b border-slate-200 py-8 sm:py-10">
            <MinimalSectionHeading
              eyebrow="Titles"
              title="Career wins"
              detail={`${props.overview.achievements.length} title${props.overview.achievements.length === 1 ? "" : "s"}`}
            />
            <AchievementGrid
              achievements={props.overview.achievements}
              minimal
            />
          </section>

          <section className="border-b border-slate-200 py-8 sm:py-10">
            <MinimalSectionHeading
              eyebrow="Career record"
              title="Seasons played"
              detail="Every tour card"
            />
            <SeasonRows cards={props.overview.tourCards} minimal />
          </section>

          <section className="py-8 sm:py-10">
            <MinimalSectionHeading
              eyebrow="Results"
              title="Tournament history"
              detail={`${props.overview.tournamentHistory.length} completed events`}
            />
            <TournamentRows
              rows={props.overview.tournamentHistory}
              limit={8}
              minimal
            />
          </section>
        </div>

        <aside
          id="payout-instructions"
          className={cn(
            "order-first scroll-mt-4 border-b border-slate-200 py-8 lg:order-last lg:border-b-0 lg:border-l lg:py-10 lg:pl-8",
            needsPayoutAction && "lg:border-l-2 lg:border-slate-950",
          )}
        >
          {needsPayoutAction ? (
            <p className="mb-5 inline-flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white">
              <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Payout action required
            </p>
          ) : null}
          <WalletPanel {...props} minimal />
          <ProfilePanel {...props} minimal />
          <LedgerPanel
            transactions={props.overview.transactions}
            limit={5}
            minimal
          />
        </aside>
      </div>
    </main>
  );
}

type HubSection = "home" | "money" | "history" | "profile";

function VariantB(props: ReadyProps) {
  const [section, setSection] = useState<HubSection>("home");
  const name = getMemberName(props.overview);
  const nav = [
    { key: "home" as const, label: "Overview", icon: CircleUserRound },
    { key: "money" as const, label: "Money", icon: WalletCards },
    { key: "history" as const, label: "History", icon: History },
    { key: "profile" as const, label: "Settings", icon: Settings2 },
  ];

  return (
    <main className="container mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm lg:grid lg:min-h-[44rem] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-b bg-slate-950 text-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 p-5 lg:block lg:p-6">
            <div className="flex min-w-0 items-center gap-3 lg:block">
              <MemberMonogram name={name} small />
              <div className="min-w-0 lg:mt-4">
                <h1 className="truncate text-lg font-bold lg:text-xl">
                  {name}
                </h1>
                <p className="truncate text-xs text-slate-400">
                  {props.overview.member.email}
                </p>
              </div>
            </div>
            <div className="text-right lg:mt-5 lg:rounded-xl lg:bg-white/[0.06] lg:p-4 lg:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">
                Balance
              </p>
              <p className="text-xl font-bold text-lime-300 lg:mt-1 lg:text-2xl">
                {formatMoney(props.overview.member.accountCents, true)}
              </p>
            </div>
          </div>

          <nav
            className="flex overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-4"
            aria-label="Account sections"
          >
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSection(item.key)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors lg:w-full",
                    section === item.key
                      ? "bg-white text-slate-950"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                  aria-current={section === item.key ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden p-4 lg:mt-auto lg:block">
            <button
              type="button"
              onClick={() => props.vm.signOut({ redirectUrl: "/" })}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
            </button>
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-8">
          {section === "home" ? (
            <HubOverview {...props} onNavigate={setSection} />
          ) : null}
          {section === "money" ? <HubMoney {...props} /> : null}
          {section === "history" ? <HubHistory {...props} /> : null}
          {section === "profile" ? <HubProfile {...props} /> : null}
        </div>
      </div>
    </main>
  );
}

function HubOverview(
  props: ReadyProps & { onNavigate: (section: HubSection) => void },
) {
  return (
    <div>
      <PageIntro
        eyebrow="Account overview"
        title={`Good to see you, ${props.overview.member.firstname || "there"}.`}
      >
        Your PGC money, profile, and playing record—together in one place.
      </PageIntro>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CompactStat label="Wins" value={props.overview.career.wins} />
        <CompactStat label="Top 10s" value={props.overview.career.topTen} />
        <CompactStat label="Cuts made" value={props.overview.career.madeCut} />
        <CompactStat label="Events" value={props.overview.career.appearances} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <HubAction
          icon={<WalletCards className="h-5 w-5" />}
          title="Manage my money"
          description={getMoneyStatus(props.overview.currentSeasonFinancial)}
          value={formatMoney(props.overview.member.accountCents, true)}
          onClick={() => props.onNavigate("money")}
        />
        <HubAction
          icon={<History className="h-5 w-5" />}
          title="See my full history"
          description={`${props.overview.career.seasonsPlayed} seasons · ${props.overview.career.appearances} events`}
          value={`${formatNumber(props.overview.career.points)} pts`}
          onClick={() => props.onNavigate("history")}
        />
      </div>

      <div className="mt-9">
        <SectionHeading
          eyebrow="Trophy cabinet"
          title="Career wins"
          icon={<Trophy className="h-5 w-5" />}
        />
        <AchievementGrid achievements={props.overview.achievements} compact />
      </div>
    </div>
  );
}

function HubMoney(props: ReadyProps) {
  return (
    <div>
      <PageIntro eyebrow="Money" title="Balance & requests">
        Choose what happens to your winnings and review every account movement.
      </PageIntro>
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <WalletPanel {...props} expanded />
        <LedgerPanel transactions={props.overview.transactions} />
      </div>
    </div>
  );
}

function HubHistory(props: ReadyProps) {
  return (
    <div>
      <PageIntro eyebrow="Personal history" title="Your PGC career">
        Seasons, results, points, earnings, and every title you have won.
      </PageIntro>
      <div className="mt-8 grid gap-8">
        <SeasonRows cards={props.overview.tourCards} />
        <TournamentRows rows={props.overview.tournamentHistory} />
      </div>
    </div>
  );
}

function HubProfile(props: ReadyProps) {
  return (
    <div className="max-w-2xl">
      <PageIntro eyebrow="Settings" title="Profile & account">
        Keep the personal details attached to your PGC membership up to date.
      </PageIntro>
      <div className="mt-8">
        <ProfilePanel {...props} expanded />
      </div>
    </div>
  );
}

function VariantC(props: ReadyProps) {
  const name = getMemberName(props.overview);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <header className="border-b-4 border-slate-950 pb-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-golf-700">
              Member scorecard
            </p>
            <h1 className="mt-2 font-yellowtail text-5xl font-bold leading-none sm:text-7xl">
              {name}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              A living record of every PGC season, Sunday finish, and dollar
              earned.
            </p>
          </div>
          <HeaderActions vm={props.vm} />
        </div>

        <dl className="mt-8 grid grid-cols-3 gap-x-5 gap-y-6 sm:grid-cols-6">
          <ScorecardStat
            label="Seasons"
            value={props.overview.career.seasonsPlayed}
          />
          <ScorecardStat
            label="Starts"
            value={props.overview.career.appearances}
          />
          <ScorecardStat label="Wins" value={props.overview.career.wins} />
          <ScorecardStat label="Top 5" value={props.overview.career.topFive} />
          <ScorecardStat
            label="Points"
            value={formatNumber(props.overview.career.points)}
          />
          <ScorecardStat
            label="Earnings"
            value={formatMoney(props.overview.career.earningsCents, false)}
          />
        </dl>
      </header>

      <section className="grid border-b border-slate-300 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-golf-100 p-2 text-golf-800">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              PGC account balance
            </p>
            <p className="text-2xl font-bold">
              {formatMoney(props.overview.member.accountCents, true)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("prototype-c-money")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-golf-800 sm:mt-0"
        >
          Review money details <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <div className="grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <div className="flex items-end justify-between gap-4 border-b border-slate-950 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-golf-700">
                Career log
              </p>
              <h2 className="mt-1 text-2xl font-bold">Tournament results</h2>
            </div>
            <span className="text-sm text-muted-foreground">Newest first</span>
          </div>
          <CareerTimeline rows={props.overview.tournamentHistory} />
        </div>

        <aside>
          <div className="border-t-4 border-amber-400 bg-amber-50 px-4 py-5">
            <div className="flex items-center gap-2 text-amber-900">
              <Trophy className="h-5 w-5" />
              <h2 className="font-bold">Wins</h2>
            </div>
            <div className="mt-4 space-y-5">
              {props.overview.achievements.length ? (
                props.overview.achievements.map((win) => (
                  <div
                    key={String(win.id)}
                    className="border-b border-amber-900/15 pb-4 last:border-0 last:pb-0"
                  >
                    <p className="font-bold leading-tight">
                      {win.tournamentName}
                    </p>
                    <p className="mt-1 text-xs text-amber-900/70">
                      Champion · {win.year ?? "PGC"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-amber-900/70">
                  Your first trophy is still out there.
                </p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <div className="border-b border-slate-950 pb-2 text-sm font-bold uppercase tracking-wider">
              Seasons played
            </div>
            <div className="divide-y">
              {props.overview.tourCards.map((card) => (
                <div key={String(card._id)} className="py-4">
                  <p className="font-bold">{card.seasonLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {card.tourName} · {formatNumber(card.points)} pts
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section
        id="prototype-c-money"
        className="scroll-mt-20 border-t-4 border-slate-950 py-9"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <WalletPanel {...props} expanded flat />
          <div className="space-y-8">
            <ProfilePanel {...props} flat />
            <LedgerPanel
              transactions={props.overview.transactions}
              limit={6}
              flat
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function HeaderActions(props: {
  vm: ReturnType<typeof useAccountPage>;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Suspense fallback={<Skeleton className="h-10 w-10 rounded-full" />}>
        <NotificationCenter />
      </Suspense>
      <Button
        variant={props.compact ? "secondary" : "outline"}
        size={props.compact ? "sm" : "default"}
        onClick={() => props.vm.signOut({ redirectUrl: "/" })}
        className={
          props.compact
            ? "bg-white/10 text-white hover:bg-white/20 hover:text-white"
            : undefined
        }
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        Log out
      </Button>
    </div>
  );
}

function WalletPanel(
  props: ReadyProps & {
    expanded?: boolean;
    flat?: boolean;
    minimal?: boolean;
  },
) {
  const financial = props.overview.currentSeasonFinancial;
  const request = financial?.request;
  const activeRequest = request?.status === "cancelled" ? null : request;
  const availableBalanceCents =
    activeRequest?.availableCents ??
    financial?.availableCents ??
    props.overview.member.accountCents;

  return (
    <section
      className={cn(
        !props.flat &&
          !props.minimal &&
          "overflow-hidden rounded-2xl border bg-white shadow-sm",
        props.minimal && "border-b border-slate-200 pb-8",
      )}
    >
      <div
        className={cn(
          props.minimal ? "pb-5" : "bg-golf-900 p-5 text-white",
          props.expanded && !props.minimal && "sm:p-6",
          props.flat && !props.minimal && "rounded-xl",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className={cn(
                "flex items-center gap-2 text-xs font-bold uppercase tracking-widest",
                props.minimal ? "text-slate-500" : "text-golf-100",
              )}
            >
              <WalletCards
                className={cn(
                  "h-4 w-4",
                  props.minimal ? "text-slate-700" : "text-lime-300",
                )}
              />{" "}
              Available balance
            </p>
            <p className="mt-2 text-3xl font-bold">
              {formatMoney(availableBalanceCents, true)}
            </p>
          </div>
          {activeRequest ? (
            <StatusPill status={activeRequest.status} minimal={props.minimal} />
          ) : null}
        </div>
        {financial ? (
          <div
            className={cn(
              "mt-5 border-t pt-4 text-sm",
              props.minimal ? "border-slate-200" : "border-white/15",
            )}
          >
            <p className={props.minimal ? "text-slate-500" : "text-golf-100"}>
              Includes{" "}
              <strong
                className={props.minimal ? "text-slate-950" : "text-white"}
              >
                {formatMoney(financial.earningsCents, true)}
              </strong>{" "}
              in {financial.seasonLabel} winnings.
            </p>
            {financial.accountOffsetCents > 0 ? (
              <p className="mt-1 text-xs opacity-80">
                {formatMoney(financial.accountOffsetCents, true)} offset an
                existing negative account balance.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          props.minimal ? "pt-5" : "p-5",
          props.expanded && !props.minimal && "sm:p-6",
          props.flat && !props.minimal && "px-0",
        )}
      >
        <MoneyControls
          {...props}
          financial={financial}
          minimal={props.minimal}
        />
      </div>
    </section>
  );
}

function MoneyControls(
  props: ReadyProps & {
    financial: AccountSeasonFinancial | null;
    minimal?: boolean;
  },
) {
  const financial = props.financial;
  const request = financial?.request;

  if (!financial)
    return (
      <EmptyCopy minimal={props.minimal}>
        Season winnings are not available yet.
      </EmptyCopy>
    );
  if (!financial.isComplete) {
    return (
      <EmptyCopy minimal={props.minimal}>
        Requests open when {financial.seasonLabel} is complete. Your official
        totals will appear here.
      </EmptyCopy>
    );
  }
  if (request && request.status !== "cancelled") {
    const rows = [
      ["E-transfer", request.transferCents, Send],
      ["Charity donation", request.charityCents, Medal],
      ["PGC donation", request.leagueCents, Flag],
      ["Next-season card", request.nextSeasonCardCents, CreditCard],
      ["Left in account", request.retainedCents, PiggyBank],
    ] as const;
    return (
      <div>
        <p className="font-bold">
          {request.status === "completed"
            ? "Your instructions are complete"
            : "Your request is being processed"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted allocations for {financial.seasonLabel}.
        </p>
        <div className="mt-4 divide-y">
          {rows
            .filter(([, amount]) => amount > 0)
            .map(([label, amount, Icon]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" /> {label}
                </span>
                <span className="font-bold tabular-nums">
                  {formatMoney(amount, true)}
                </span>
              </div>
            ))}
        </div>
        {request.payoutEmail ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> {request.payoutEmail}
          </p>
        ) : null}
      </div>
    );
  }
  if (financial.availableCents <= 0)
    return (
      <EmptyCopy minimal={props.minimal}>
        There are no funds to allocate for this season.
      </EmptyCopy>
    );

  const remainingCents = props.vm.parsedAmounts.remainingCents;
  const reserveTopUpCents = Math.max(
    0,
    NEXT_SEASON_CARD_CENTS - props.vm.parsedAmounts.retainedCents,
  );
  const canReserveCard =
    props.vm.nextSeasonCard ||
    (props.vm.parsedAmounts.valid && reserveTopUpCents <= remainingCents);
  const quickActionClass =
    "flex min-h-12 w-full items-center justify-between gap-3 border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div>
      <p className={cn("font-bold", props.minimal && "text-lg")}>
        Choose how to receive your money
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Assign the full balance, then submit your payout instructions.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MoneyInput
          label="E-transfer"
          value={props.vm.transferAmount}
          onChange={props.vm.setTransferAmount}
        />
        <MoneyInput
          label="Charity"
          value={props.vm.charityAmount}
          onChange={props.vm.setCharityAmount}
        />
        <MoneyInput
          label="PGC donation"
          value={props.vm.leagueAmount}
          onChange={props.vm.setLeagueAmount}
        />
        <MoneyInput
          label="Keep in account"
          value={props.vm.retainedAmount}
          onChange={props.vm.setRetainedAmount}
        />
      </div>
      {props.vm.parsedAmounts.transferCents > 0 ? (
        <label className="mt-4 block">
          <span className="text-xs font-bold text-muted-foreground">
            E-transfer email
          </span>
          <input
            type="email"
            value={props.vm.payoutEmail}
            onChange={(event) => props.vm.setPayoutEmail(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-lg border bg-white px-3 text-sm"
          />
        </label>
      ) : null}
      {props.minimal ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Quick ways to finish
          </p>
          <div className="mt-2 grid gap-2">
            <button
              type="button"
              className={quickActionClass}
              onClick={props.vm.allocateRemainingToTransfer}
              disabled={remainingCents <= 0}
            >
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4" aria-hidden="true" />
                Send remaining by e-transfer
              </span>
              <span className="tabular-nums">
                {formatMoney(remainingCents, true)}
              </span>
            </button>
            <button
              type="button"
              className={quickActionClass}
              onClick={props.vm.allocateRemainingToAccount}
              disabled={remainingCents <= 0}
            >
              <span className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4" aria-hidden="true" />
                Keep remaining in account
              </span>
              <span className="tabular-nums">
                {formatMoney(remainingCents, true)}
              </span>
            </button>
            {financial.availableCents >= NEXT_SEASON_CARD_CENTS ? (
              <button
                type="button"
                aria-pressed={props.vm.nextSeasonCard}
                onClick={() =>
                  props.vm.setNextSeasonCard(!props.vm.nextSeasonCard)
                }
                disabled={!canReserveCard}
                className={cn(
                  quickActionClass,
                  props.vm.nextSeasonCard &&
                    "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                )}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Reserve next season&apos;s card
                </span>
                <span>
                  {props.vm.nextSeasonCard
                    ? "Reserved"
                    : formatMoney(NEXT_SEASON_CARD_CENTS, true)}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : financial.availableCents >= NEXT_SEASON_CARD_CENTS ? (
        <button
          type="button"
          aria-pressed={props.vm.nextSeasonCard}
          onClick={() => props.vm.setNextSeasonCard(!props.vm.nextSeasonCard)}
          className={cn(
            "mt-4 flex min-h-11 w-full items-center justify-between gap-3 border text-left text-sm",
            props.minimal
              ? "border-x-0 border-slate-200 py-3"
              : "rounded-xl px-3 py-2",
            props.vm.nextSeasonCard
              ? props.minimal
                ? "bg-slate-50 text-slate-950"
                : "border-golf-500 bg-golf-50 text-golf-900"
              : "bg-white",
          )}
        >
          <span className="flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4" /> Reserve next season's card
          </span>
          <span className="font-bold">
            {formatMoney(NEXT_SEASON_CARD_CENTS, true)}
          </span>
        </button>
      ) : null}
      <div className="mt-4 flex items-center justify-between border-y py-3 text-sm">
        <span>Left to assign</span>
        <span
          className={cn(
            "font-bold",
            remainingCents === 0 ? "text-golf-700" : "text-amber-700",
          )}
        >
          {formatMoney(remainingCents, true)}
        </span>
      </div>
      {!props.minimal ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={props.vm.allocateRemainingToTransfer}
          >
            Send the rest
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={props.vm.allocateRemainingToAccount}
          >
            Keep the rest
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        size={props.minimal ? "lg" : "default"}
        className={cn("mt-4 w-full", props.minimal && "text-base")}
        disabled={
          !props.vm.parsedAmounts.valid ||
          props.vm.parsedAmounts.remainingCents !== 0
        }
        onClick={() =>
          props.onPrototypeAction("Payout instructions previewed.")
        }
      >
        Submit payout instructions
      </Button>
    </div>
  );
}

function ProfilePanel(
  props: ReadyProps & {
    expanded?: boolean;
    flat?: boolean;
    minimal?: boolean;
  },
) {
  return (
    <section
      className={cn(
        !props.minimal && "p-5",
        !props.flat &&
          !props.minimal &&
          "rounded-2xl border bg-white shadow-sm",
        props.expanded && !props.minimal && "sm:p-6",
        props.flat && !props.minimal && "border-t border-slate-300 px-0",
        props.minimal && "border-b border-slate-200 py-8",
      )}
    >
      <div className="flex items-center gap-2">
        <PencilLine
          className={cn(
            "h-4 w-4",
            props.minimal ? "text-slate-600" : "text-golf-700",
          )}
        />
        <h2 className="font-bold">Personal information</h2>
      </div>
      <div
        className={cn("mt-4 grid gap-4", props.expanded && "sm:grid-cols-2")}
      >
        <TextInput
          label="First name"
          value={props.vm.firstName}
          onChange={props.vm.setFirstName}
        />
        <TextInput
          label="Last name"
          value={props.vm.lastName}
          onChange={props.vm.setLastName}
        />
        <label className={cn("block", props.expanded && "sm:col-span-2")}>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Login email
          </span>
          <input
            value={props.overview.member.email}
            disabled
            className="mt-1.5 min-h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm text-muted-foreground"
          />
        </label>
      </div>
      <Button
        type="button"
        className="mt-4"
        onClick={() => props.onPrototypeAction("Profile changes previewed.")}
      >
        Save changes
      </Button>
    </section>
  );
}

function LedgerPanel(props: {
  transactions: AccountTransaction[];
  limit?: number;
  flat?: boolean;
  minimal?: boolean;
}) {
  const rows = props.limit
    ? props.transactions.slice(0, props.limit)
    : props.transactions;
  return (
    <section
      className={cn(
        !props.minimal && "p-5",
        !props.flat &&
          !props.minimal &&
          "rounded-2xl border bg-white shadow-sm",
        props.flat && !props.minimal && "border-t border-slate-300 px-0",
        props.minimal && "pt-8",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Landmark
            className={cn(
              "h-4 w-4",
              props.minimal ? "text-slate-600" : "text-golf-700",
            )}
          />{" "}
          Account activity
        </h2>
        <span className="text-xs text-muted-foreground">
          {props.transactions.length} entries
        </span>
      </div>
      {rows.length ? (
        <div className="mt-3 divide-y">
          {rows.map((row) => (
            <div
              key={String(row.id)}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">
                    {transactionLabel(row.type)}
                  </p>
                  {row.status !== "completed" ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-slate-600">
                      {row.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(row.processedAt)} · {row.seasonLabel}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 font-bold tabular-nums",
                  row.status !== "completed"
                    ? "text-muted-foreground"
                    : row.amountCents >= 0
                      ? props.minimal
                        ? "text-slate-900"
                        : "text-golf-700"
                      : "text-slate-900",
                )}
              >
                {row.amountCents > 0 ? "+" : ""}
                {formatMoney(row.amountCents, true)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyCopy minimal={props.minimal}>No account activity yet.</EmptyCopy>
      )}
    </section>
  );
}

function AchievementGrid(props: {
  achievements: AccountOverviewDto["achievements"];
  compact?: boolean;
  minimal?: boolean;
}) {
  if (!props.achievements.length)
    return (
      <EmptyCopy minimal={props.minimal}>
        Your first PGC win will be celebrated here.
      </EmptyCopy>
    );

  if (props.minimal) {
    return <MinimalAchievementGroups achievements={props.achievements} />;
  }

  return (
    <div
      className={cn(
        "mt-5 grid gap-3",
        props.compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {props.achievements.map((item) => (
        <div
          key={String(item.id)}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            {item.logoUrl ? (
              <img
                src={item.logoUrl}
                alt=""
                className="h-9 w-9 object-contain"
              />
            ) : (
              <Trophy className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold">{item.tournamentName}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Champion · {item.year ?? "PGC"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MinimalAchievementGroups(props: {
  achievements: AccountOverviewDto["achievements"];
}) {
  const groups = [
    {
      label: "Season champions",
      kinds: ["pgcChampion", "silverChampion"],
    },
    { label: "Major championships", kinds: ["major"] },
    { label: "Tournament wins", kinds: ["tournament"] },
  ] as const;

  return (
    <div className="mt-5 border-b border-slate-200">
      {groups.map((group) => {
        const achievements = props.achievements.filter((achievement) =>
          group.kinds.some((kind) => kind === achievement.kind),
        );
        if (!achievements.length) return null;

        return (
          <section key={group.label} className="border-t border-slate-200 py-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
              {achievements.map((item) => {
                const isSeasonChampion =
                  item.kind === "pgcChampion" || item.kind === "silverChampion";
                return (
                  <article key={String(item.id)} className="min-w-0">
                    <div className="flex h-14 w-14 items-center justify-center text-slate-700">
                      {item.logoUrl ? (
                        <img
                          src={item.logoUrl}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Trophy className="h-8 w-8" />
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-3 text-xs uppercase tracking-wide",
                        isSeasonChampion
                          ? "font-black text-slate-950"
                          : "font-semibold text-slate-600",
                      )}
                    >
                      {item.honorLabel} · {item.year ?? "PGC"}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {item.tournamentName}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SeasonRows(props: {
  cards: AccountOverviewDto["tourCards"];
  minimal?: boolean;
}) {
  if (!props.cards.length)
    return (
      <EmptyCopy minimal={props.minimal}>No seasons played yet.</EmptyCopy>
    );
  return (
    <div
      className={cn(
        "mt-5 divide-y",
        props.minimal
          ? "divide-slate-200 border-y border-slate-200"
          : "rounded-xl border",
      )}
    >
      {props.cards.map((card) => (
        <div
          key={String(card._id)}
          className={cn(
            "grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(4rem,0.55fr))] sm:items-center",
            props.minimal ? "py-4" : "p-4",
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold">{card.seasonLabel}</p>
              {card.isCurrent ? (
                <span
                  className={cn(
                    "px-2 py-0.5 text-[0.65rem] font-bold uppercase",
                    props.minimal
                      ? "border border-slate-300 text-slate-600"
                      : "rounded-full bg-golf-100 text-golf-800",
                  )}
                >
                  Current
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {card.tourName} · {card.displayName}
            </p>
          </div>
          <InlineStat label="Finish" value={card.currentPosition} />
          <InlineStat label="Points" value={formatNumber(card.points)} />
          <InlineStat label="Wins" value={card.wins} />
          <InlineStat
            label="Earnings"
            value={formatMoney(card.earningsCents, false)}
          />
        </div>
      ))}
    </div>
  );
}

function TournamentRows(props: {
  rows: AccountTournamentHistory[];
  limit?: number;
  minimal?: boolean;
}) {
  const rows = props.limit ? props.rows.slice(0, props.limit) : props.rows;
  if (!rows.length)
    return (
      <EmptyCopy minimal={props.minimal}>
        No completed tournament results yet.
      </EmptyCopy>
    );
  return (
    <div
      className={cn(
        "mt-5 overflow-hidden",
        props.minimal ? "border-y border-slate-200" : "rounded-xl border",
      )}
    >
      <div
        className={cn(
          "hidden grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] gap-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground sm:grid",
          props.minimal ? "border-b border-slate-200" : "bg-slate-50 px-4",
        )}
      >
        <span>Tournament</span>
        <span className="text-right">Finish</span>
        <span className="text-right">Points</span>
        <span className="text-right">Earnings</span>
      </div>
      <div className="divide-y">
        {rows.map((row) => (
          <div
            key={String(row.id)}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] sm:items-center",
              !props.minimal && "px-4",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  props.minimal && "border border-slate-200",
                  !props.minimal && "bg-slate-100",
                )}
              >
                {row.logoUrl ? (
                  <img
                    src={row.logoUrl}
                    alt=""
                    className="h-7 w-7 object-contain"
                  />
                ) : (
                  <Flag className="h-4 w-4 text-slate-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{row.tournamentName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.seasonLabel} · {row.tourName} ·{" "}
                  {formatDate(row.playedAt)}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "text-right font-bold",
                row.position === "1" &&
                  (props.minimal ? "text-slate-950" : "text-amber-700"),
              )}
            >
              {row.position}
            </span>
            <span className="hidden text-right text-sm tabular-nums sm:block">
              {formatNumber(row.points)}
            </span>
            <span className="hidden text-right text-sm font-semibold tabular-nums sm:block">
              {formatMoney(row.earningsCents, false)}
            </span>
            <div className="col-span-2 flex gap-4 text-xs text-muted-foreground sm:hidden">
              <span>{formatNumber(row.points)} pts</span>
              <span>{formatMoney(row.earningsCents, false)}</span>
              <span>{formatToPar(row.score)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CareerTimeline(props: { rows: AccountTournamentHistory[] }) {
  if (!props.rows.length)
    return <EmptyCopy>No completed tournament results yet.</EmptyCopy>;
  return (
    <div className="divide-y divide-slate-300">
      {props.rows.map((row) => (
        <article
          key={String(row.id)}
          className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[5rem_minmax(0,1fr)_9rem]"
        >
          <time className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {formatMonthYear(row.playedAt)}
          </time>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold">{row.tournamentName}</h3>
              {row.position === "1" ? (
                <Trophy
                  className="h-4 w-4 text-amber-600"
                  aria-label="Winner"
                />
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.seasonLabel} · {row.tourName} · {row.tierName}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
              <span>
                <strong>{row.position}</strong> finish
              </span>
              <span>
                <strong>{formatToPar(row.score)}</strong> score
              </span>
              <span>
                <strong>{formatNumber(row.points)}</strong> pts
              </span>
            </div>
          </div>
          <div className="col-start-2 text-left sm:col-start-auto sm:text-right">
            <p className="font-bold">{formatMoney(row.earningsCents, false)}</p>
            <p className="text-xs text-muted-foreground">earned</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function HubAction(props: {
  icon: ReactNode;
  title: string;
  description: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group flex min-h-36 flex-col rounded-2xl border bg-slate-50 p-5 text-left hover:border-golf-300 hover:bg-golf-50"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="rounded-lg bg-white p-2 text-golf-800 shadow-sm">
          {props.icon}
        </span>
        <ChevronRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-4 font-bold">{props.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
      <p className="mt-auto pt-4 text-lg font-bold text-golf-800">
        {props.value}
      </p>
    </button>
  );
}

function SectionHeading(props: {
  eyebrow: string;
  title: string;
  detail?: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-golf-700">
          {props.icon}
          {props.eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl">{props.title}</h2>
      </div>
      {props.detail ? (
        <p className="text-xs text-muted-foreground sm:text-sm">
          {props.detail}
        </p>
      ) : null}
    </div>
  );
}

function MinimalSectionHeading(props: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {props.eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl">{props.title}</h2>
      </div>
      {props.detail ? (
        <p className="shrink-0 text-xs text-slate-500 sm:text-sm">
          {props.detail}
        </p>
      ) : null}
    </div>
  );
}

function PageIntro(props: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-golf-700">
        {props.eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {props.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        {props.children}
      </p>
    </div>
  );
}

function MemberMonogram(props: { name: string; small?: boolean }) {
  const initials = props.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "text-golf-950 flex shrink-0 items-center justify-center rounded-full bg-lime-300 font-bold ring-4 ring-white/10",
        props.small
          ? "h-11 w-11 text-sm lg:h-14 lg:w-14 lg:text-lg"
          : "h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl",
      )}
    >
      {initials || <UserRound className="h-6 w-6" />}
    </div>
  );
}

function MinimalStat(props: { label: string; value: string | number }) {
  return (
    <div className="border-b border-slate-200 py-4 odd:border-r odd:pr-4 even:pl-4 sm:border-b-0 sm:border-r-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
        {props.label}
      </dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-slate-950 sm:text-2xl">
        {props.value}
      </dd>
    </div>
  );
}

function CompactStat(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-100 px-4 py-4">
      <p className="text-2xl font-bold">{props.value}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {props.label}
      </p>
    </div>
  );
}

function ScorecardStat(props: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        {props.label}
      </dt>
      <dd className="mt-1 text-xl font-black sm:text-2xl">{props.value}</dd>
    </div>
  );
}

function InlineStat(props: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
      <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </span>
      <p className="font-bold tabular-nums">{props.value}</p>
    </div>
  );
}

function MoneyInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-bold text-muted-foreground">
        {props.label}
      </span>
      <span className="relative mt-1.5 block">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="0.00"
          className="min-h-11 w-full rounded-lg border bg-white py-2 pl-7 pr-3 text-right text-sm tabular-nums"
        />
      </span>
    </label>
  );
}

function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-lg border bg-white px-3 text-sm"
      />
    </label>
  );
}

function StatusPill(props: { status: string; minimal?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold capitalize",
        props.minimal
          ? "border border-slate-300 text-slate-600"
          : "rounded-full border border-white/20 bg-white/10",
      )}
    >
      <Check className="h-3.5 w-3.5" />
      {props.status.replace("_", " ")}
    </span>
  );
}

function EmptyCopy(props: { children: ReactNode; minimal?: boolean }) {
  return (
    <p
      className={cn(
        "mt-4 text-sm text-muted-foreground",
        props.minimal
          ? "border-y border-slate-200 py-4"
          : "rounded-xl bg-slate-50 p-4",
      )}
    >
      {props.children}
    </p>
  );
}

function getMemberName(overview: AccountOverviewDto) {
  return (
    [overview.member.firstname, overview.member.lastname]
      .filter(Boolean)
      .join(" ") ||
    overview.member.email.split("@")[0] ||
    "PGC Member"
  );
}

function getMoneyStatus(financial: AccountSeasonFinancial | null) {
  if (!financial) return "No season balance is available yet";
  if (!financial.isComplete)
    return `${financial.seasonLabel} is still in progress`;
  if (financial.request?.status === "completed")
    return "Your latest instructions are complete";
  if (financial.request) return "Your latest request is being processed";
  return `${formatMoney(financial.availableCents, true)} ready to allocate`;
}

function transactionLabel(value: AccountTransaction["type"]) {
  return String(value).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatMonthYear(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function AccountPrototypeSkeleton() {
  return (
    <div
      className="container mx-auto max-w-6xl space-y-6 px-4 py-8"
      aria-busy="true"
    >
      <Skeleton className="h-64 w-full rounded-[1.75rem]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Skeleton className="h-[34rem] w-full rounded-2xl" />
        <Skeleton className="h-[34rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}
