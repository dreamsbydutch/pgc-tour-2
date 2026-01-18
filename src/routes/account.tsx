import { createFileRoute } from "@tanstack/react-router";

import { AccountPage } from "@/components/pages/AccountPage";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
});

function AccountRoute() {
  return <AccountPage />;
}
