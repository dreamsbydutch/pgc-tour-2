import {
  CheckCircle2,
  Clock3,
  Flag,
  HeartHandshake,
  Landmark,
  Mail,
  PiggyBank,
  Send,
  TicketCheck,
  WalletCards,
} from "lucide-react";

import type { AccountSeasonFinancial } from "@/types";
import { Button, Card, CardContent } from "@/ui";
import { NEXT_SEASON_CARD_CENTS, settlementStatusLabel } from "@/utils";
import { formatMoney } from "@/utils/app";
import { cn } from "@/utils/classNames";

type Props = {
  balanceCents: number;
  financial: AccountSeasonFinancial | null;
  transferAmount: string;
  onTransferAmountChange: (value: string) => void;
  charityAmount: string;
  onCharityAmountChange: (value: string) => void;
  leagueAmount: string;
  onLeagueAmountChange: (value: string) => void;
  retainedAmount: string;
  onRetainedAmountChange: (value: string) => void;
  nextSeasonCard: boolean;
  onNextSeasonCardChange: (value: boolean) => void;
  payoutEmail: string;
  onPayoutEmailChange: (value: string) => void;
  parsedAmounts: {
    valid: boolean;
    transferCents: number;
    retainedCents: number;
    allocatedCents: number;
    remainingCents: number;
  };
  canSubmit: boolean;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: string | null;
  onAllocateRemainingToTransfer: () => void;
  onAllocateRemainingToAccount: () => void;
  onSubmit: () => void;
};

export function SeasonWinningsCard(props: Props) {
  const financial = props.financial;
  const request = financial?.request ?? null;
  const summary = request ?? financial;
  const retainedTopUp = Math.max(
    0,
    NEXT_SEASON_CARD_CENTS - props.parsedAmounts.retainedCents,
  );
  const showTourCardAction =
    (financial?.availableCents ?? 0) >= NEXT_SEASON_CARD_CENTS;
  const canReserveTourCard =
    props.nextSeasonCard ||
    (props.parsedAmounts.valid &&
      props.parsedAmounts.remainingCents >= retainedTopUp);

  return (
    <Card id="earnings" className="scroll-mt-20 overflow-hidden">
      <div className="border-b border-golf-800/20 bg-golf-900 px-5 py-5 text-white sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <WalletCards
                className="h-7 w-7 text-amber-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-medium text-golf-100">
                  Available balance
                </h2>
                <p className="text-3xl font-bold tracking-tight">
                  {formatMoney(props.balanceCents, true)}
                </p>
              </div>
            </div>
          </div>
          {request ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-bold",
                request.status === "completed"
                  ? "border-golf-400/50 bg-golf-800 text-golf-50"
                  : request.status === "cancelled"
                    ? "border-red-300/50 bg-red-950/40 text-red-100"
                    : "border-amber-300/50 bg-amber-300/15 text-amber-100",
              )}
            >
              {settlementStatusLabel(request.status)}
            </span>
          ) : null}
        </div>
      </div>

      <CardContent className="space-y-5 p-5 sm:p-6">
        {!financial ? (
          <p className="text-sm text-muted-foreground">
            Season winnings are not available yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 divide-x py-1">
              <FinancialStat
                label="Season winnings"
                value={formatMoney(summary?.earningsCents ?? 0, true)}
              />
              <FinancialStat
                label="Balance offset"
                value={formatMoney(summary?.accountOffsetCents ?? 0, true)}
              />
              <FinancialStat
                label="To allocate"
                value={formatMoney(summary?.availableCents ?? 0, true)}
                accent
              />
            </div>

            {!financial.isComplete ? (
              <div className="flex items-start gap-3 bg-muted/30 p-4">
                <Clock3
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">
                    Requests open after the season
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your official winnings will be ready to distribute once the
                    season is complete.
                  </p>
                </div>
              </div>
            ) : request && request.status !== "cancelled" ? (
              <RequestSummary request={request} />
            ) : financial.availableCents <= 0 ? (
              <div className="bg-muted/30 p-4 text-sm text-muted-foreground">
                There are no season winnings available to distribute.
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onSubmit();
                }}
              >
                {request?.status === "cancelled" ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Your previous request was cancelled. Review the amounts and
                    submit new instructions.
                  </div>
                ) : null}
                <div>
                  <h2 className="text-lg font-bold">
                    Choose where your winnings go
                  </h2>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-5">
                  <AllocationInput
                    id="settlement-transfer"
                    icon={Send}
                    label="E-transfer"
                    value={props.transferAmount}
                    onChange={props.onTransferAmountChange}
                    disabled={!props.canSubmit || props.submitting}
                  />
                  <AllocationInput
                    id="settlement-charity"
                    icon={HeartHandshake}
                    label="Donate to charity"
                    value={props.charityAmount}
                    onChange={props.onCharityAmountChange}
                    disabled={!props.canSubmit || props.submitting}
                  />
                  <AllocationInput
                    id="settlement-league"
                    icon={Flag}
                    label="Donate to the PGC"
                    value={props.leagueAmount}
                    onChange={props.onLeagueAmountChange}
                    disabled={!props.canSubmit || props.submitting}
                  />
                  <AllocationInput
                    id="settlement-retained"
                    icon={PiggyBank}
                    label="Leave in my account"
                    value={props.retainedAmount}
                    onChange={props.onRetainedAmountChange}
                    disabled={!props.canSubmit || props.submitting}
                  />
                </div>

                {props.parsedAmounts.transferCents > 0 ? (
                  <label
                    className="block space-y-1.5"
                    htmlFor="settlement-email"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Mail
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      E-transfer email
                    </span>
                    <input
                      id="settlement-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={props.payoutEmail}
                      onChange={(event) =>
                        props.onPayoutEmailChange(event.target.value)
                      }
                      disabled={!props.canSubmit || props.submitting}
                      className="min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                    />
                    <span className="text-xs text-muted-foreground">
                      This can be different from your PGC login email.
                    </span>
                  </label>
                ) : null}

                <div className="border-y py-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Allocated</span>
                    <span className="font-semibold">
                      {formatMoney(props.parsedAmounts.allocatedCents, true)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2">
                    <span className="font-semibold">Still to allocate</span>
                    <span
                      className={cn(
                        "text-lg font-bold",
                        props.parsedAmounts.remainingCents === 0
                          ? "text-golf-700"
                          : "text-amber-800",
                      )}
                    >
                      {formatMoney(props.parsedAmounts.remainingCents, true)}
                    </span>
                  </div>
                  {props.parsedAmounts.remainingCents > 0 ||
                  showTourCardAction ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {props.parsedAmounts.remainingCents > 0 ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={props.onAllocateRemainingToTransfer}
                          >
                            Send the rest
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={props.onAllocateRemainingToAccount}
                          >
                            Keep the rest
                          </Button>
                        </>
                      ) : null}
                      {showTourCardAction ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={props.nextSeasonCard ? "default" : "outline"}
                          aria-pressed={props.nextSeasonCard}
                          disabled={
                            !props.canSubmit ||
                            props.submitting ||
                            !canReserveTourCard
                          }
                          onClick={() =>
                            props.onNextSeasonCardChange(!props.nextSeasonCard)
                          }
                        >
                          <TicketCheck
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          {props.nextSeasonCard
                            ? "Tour card reserved"
                            : "Buy next season tour card"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {props.submitError ? (
                  <p role="alert" className="text-sm text-red-700">
                    {props.submitError}
                  </p>
                ) : null}
                {props.submitSuccess ? (
                  <p role="status" className="text-sm text-golf-700">
                    {props.submitSuccess}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={
                    !props.canSubmit ||
                    props.submitting ||
                    !props.parsedAmounts.valid ||
                    props.parsedAmounts.remainingCents !== 0
                  }
                >
                  {props.submitting
                    ? "Submitting…"
                    : "Submit winnings instructions"}
                </Button>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FinancialStat(props: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-3 py-2 first:pl-0 last:pr-0 sm:px-4",
        props.accent && "text-golf-800",
      )}
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-bold sm:text-lg",
          props.accent && "text-golf-800",
        )}
      >
        {props.value}
      </p>
    </div>
  );
}

function AllocationInput(props: {
  id: string;
  icon: typeof Landmark;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const Icon = props.icon;
  return (
    <label htmlFor={props.id} className="block w-36 max-w-full">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-golf-700" aria-hidden="true" />
        {props.label}
      </span>
      <span className="relative mt-2 block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <input
          id={props.id}
          type="text"
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
          placeholder="0.00"
          className="min-h-11 w-full rounded-md border bg-background py-2 pl-7 pr-3 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        />
      </span>
    </label>
  );
}

function RequestSummary(props: {
  request: NonNullable<AccountSeasonFinancial["request"]>;
}) {
  const request = props.request;
  if (!request) return null;
  const rows = [
    ["E-transfer", request.transferCents],
    ["Charity", request.charityCents],
    ["PGC league", request.leagueCents],
    ["Next-season card", request.nextSeasonCardCents],
    ["Left in account", request.retainedCents],
  ] as const;
  return (
    <div className="bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        {request.status === "completed" ? (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-golf-700"
            aria-hidden="true"
          />
        ) : (
          <Clock3
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {request.status === "completed"
              ? "Your instructions are complete"
              : request.status === "cancelled"
                ? "This request was cancelled"
                : "Your instructions are being processed"}
          </p>
          <dl className="mt-3 divide-y text-sm">
            {rows
              .filter(([, amount]) => amount > 0)
              .map(([label, amount]) => (
                <div key={label} className="flex justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{formatMoney(amount, true)}</dd>
                </div>
              ))}
          </dl>
          {request.payoutEmail ? (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              E-transfer to {request.payoutEmail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
