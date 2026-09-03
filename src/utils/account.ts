export const NEXT_SEASON_CARD_CENTS = 10_000;

export function cadInputToCents(value: string): number | null {
  const normalized = value.trim().replace(/^\$/, "").replaceAll(",", "");
  if (!normalized) return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function centsToCadInput(value: number): string {
  return (Math.max(0, value) / 100).toFixed(2);
}

export function getAllocationTotal(args: {
  transferCents: number;
  charityCents: number;
  leagueCents: number;
  nextSeasonCard: boolean;
  retainedCents: number;
}) {
  return (
    args.transferCents +
    args.charityCents +
    args.leagueCents +
    (args.nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0) +
    args.retainedCents
  );
}

export function settlementStatusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
