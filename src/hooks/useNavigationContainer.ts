import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

import { useViewerBootstrap } from "@/convex";
import { NAV_ITEMS } from "@/utils/constants";
import { formatUserDisplayName, isNavItemActive } from "@/utils/navigation";

export function useNavigationContainer() {
  const location = useLocation();
  const { openSignIn } = useClerk();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const bootstrap = useViewerBootstrap();
  const memberData = bootstrap?.member ?? null;
  const majorChampionBadgesByMemberId =
    memberData && bootstrap
      ? {
          [String(memberData._id)]: bootstrap.badges.map((badge) => ({
            tournamentId: String(badge.tournamentId),
            tournamentName: badge.tournamentName,
            logoUrl: badge.logoUrl ?? null,
          })),
        }
      : {};
  const navItems = useMemo(
    () =>
      NAV_ITEMS.map(({ href, icon: Icon, label }) => ({
        href,
        Icon,
        label,
        isActive: isNavItemActive(href, location.pathname),
      })),
    [location.pathname],
  );
  const displayName = useMemo(() => {
    if (!clerkUser) return "User";
    if (!memberData || !("firstname" in memberData)) {
      return formatUserDisplayName(clerkUser.firstName, clerkUser.lastName);
    }
    return formatUserDisplayName(
      memberData.firstname || clerkUser.firstName,
      memberData.lastname || clerkUser.lastName,
    );
  }, [clerkUser, memberData]);
  const accountCents =
    clerkUser && memberData && "account" in memberData
      ? memberData.account
      : undefined;
  return {
    navItems,
    openSignIn: () => openSignIn(),
    isAccountLoading: !isClerkLoaded || (clerkUser && bootstrap === undefined),
    displayName,
    memberId: memberData ? String(memberData._id) : null,
    majorChampionBadgesByMemberId,
    avatarUrl: clerkUser?.imageUrl,
    accountCents,
  };
}
