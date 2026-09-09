import type { AccountPrototypeVariant } from "@/types";

export function getAccountPrototypeVariant(
  variant: AccountPrototypeVariant | undefined,
) {
  return variant ?? null;
}
