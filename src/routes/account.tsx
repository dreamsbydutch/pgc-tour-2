import { createFileRoute } from "@tanstack/react-router";

import { HardGateSignedIn } from "@/widgets";
import { AccountPage } from "@/facilitators";

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
