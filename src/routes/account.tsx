import { createFileRoute } from "@tanstack/react-router";

import { AccountPage } from "@/components/pages/AccountPage";
import { HardGateSignedIn } from "@/components/internal/HardGateSignedIn";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
});

function AccountRoute() {
  return (
    <HardGateSignedIn>
      <AccountPage />
    </HardGateSignedIn>
  );
}
