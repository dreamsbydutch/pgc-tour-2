import { CENTS_PER_DOLLAR } from "../functions/_constants";

export function formatCents(cents: number): string {
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}
