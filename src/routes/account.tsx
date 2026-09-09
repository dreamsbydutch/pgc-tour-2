import { createFileRoute } from "@tanstack/react-router";

import { HardGateSignedIn } from "@/widgets";
import { AccountPage, AccountPagePrototype } from "@/facilitators";
import type { AccountPrototypeVariant, AccountSearch } from "@/types";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
  validateSearch: (search: Record<string, unknown>): AccountSearch => ({
    variant:
      search.variant === "a" || search.variant === "b" || search.variant === "c"
        ? search.variant
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Account | PGC Tour" },
      {
        name: "description",
        content: "Manage your PGC Tour profile and account.",
      },
    ],
  }),
});

function AccountRoute() {
  const { variant = "a" } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <HardGateSignedIn>
      {import.meta.env.PROD ? (
        <AccountPage />
      ) : (
        <AccountPagePrototype
          variant={variant}
          onVariantChange={(nextVariant: AccountPrototypeVariant) =>
            navigate({ search: { variant: nextVariant }, replace: true })
          }
        />
      )}
    </HardGateSignedIn>
  );
}
