import { createFileRoute } from "@tanstack/react-router";

import { HardGateSignedIn } from "@/components/displays";
import { AccountPage } from "@/components/facilitators";

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
