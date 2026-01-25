import { createFileRoute } from "@tanstack/react-router";

import { AccountPage } from "@/components/pages/AccountPage";
import { HardGateSignedIn } from "@/ui";

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
