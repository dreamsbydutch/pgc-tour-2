import { createFileRoute } from "@tanstack/react-router";

import { AccountPage, HardGateSignedIn } from "@/facilitators";

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
