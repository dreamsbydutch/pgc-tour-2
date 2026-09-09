import { createFileRoute } from "@tanstack/react-router";

import { HardGateSignedIn } from "@/widgets";
import { AccountPage } from "@/facilitators";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
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
  return (
    <HardGateSignedIn>
      <AccountPage />
    </HardGateSignedIn>
  );
}
