export function formatToPar(score: number | null | undefined): string {
  if (score === null || score === undefined) return "-";
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

export function formatPercentageDisplay(
  value: number | null | undefined,
): string {
  if (!value) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatMoneyUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || amount === 0) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `$${Math.round(amount / 100)}`;
  }
}
