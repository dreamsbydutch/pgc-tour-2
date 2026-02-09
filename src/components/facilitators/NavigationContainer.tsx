"use client";

import {
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from "@clerk/tanstack-react-start";
import { Link, useLocation } from "@tanstack/react-router";
import { LogIn, UserRound } from "lucide-react";
import { useMemo } from "react";

import { Button, Skeleton } from "@/ui";
import { NAV_ITEMS } from "@/lib";
import type { NavigationContainerProps } from "@/lib";
import { cn, formatUserDisplayName, isNavItemActive } from "@/lib";
import { api, useQuery } from "@/convex";

const keepParams = <TParams extends Record<string, string>>(current: TParams) =>
  current;
const keepSearch = <TSearch extends Record<string, unknown>>(
  current: TSearch,
) => current;

/**
 * Main app navigation with responsive layout and a Clerk-powered account affordance.
 *
 * Data for the user/member is sourced via Clerk (`useUser`) and Convex member lookup.
 * Render states:
 * - Always renders the nav items.
 * - While navigation user state is loading, the account area renders a skeleton.
 * - When signed out, the account area opens the Clerk sign-in modal.
 * - When signed in, the account area links to `/account`.
 *
 * @param props - `NavigationContainerProps`.
 * @returns A fixed navigation bar for mobile and desktop.
 */
export function NavigationContainer(props: NavigationContainerProps) {
  const model = useNavigationContainer(props);

  return (
    <nav
      className={cn(
        props.className,
        "fixed bottom-0 z-50 flex w-full items-center justify-evenly border-t lg:top-0 lg:justify-center lg:gap-8 lg:border-b lg:border-t-0 lg:px-4 lg:py-2 xl:gap-14",
        "h-[52px] text-center lg:h-[48px]",
        "bg-gray-200 shadow-inv",
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {model.navItems.map(({ href, Icon, label, isActive }) => (
        <div key={href}>
          <div className="flex lg:hidden">
            <Link
              to={href}
              params={keepParams}
              search={keepSearch}
              className={cn(
                "relative flex items-center justify-center rounded-md p-2",
                "focus:outline-none",
                "transition-colors duration-200 ease-in-out",
                isActive && "bg-gray-300 shadow-emboss",
                "p-1",
              )}
              aria-label={`Navigate to ${label}`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="flex items-center justify-center">
                <Icon
                  size={32}
                  className={
                    isActive ? "mx-auto text-black" : "mx-auto text-gray-500"
                  }
                  aria-hidden="true"
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
            </Link>
          </div>

          <div className="hidden lg:flex">
            <Link
              to={href}
              params={keepParams}
              search={keepSearch}
              className={cn(
                "relative flex items-center justify-center rounded-md p-2",
                "focus:outline-none",
                "transition-colors duration-200 ease-in-out",
                isActive && "bg-gray-300 shadow-emboss",
              )}
              aria-label={`Navigate to ${label}`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="flex items-center justify-center gap-2 px-4 py-2">
                <Icon
                  size={24}
                  className={
                    isActive ? "mx-auto text-black" : "mx-auto text-gray-500"
                  }
                  aria-hidden="true"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={
                    isActive
                      ? "text-lg font-bold text-black"
                      : "text-lg font-semibold text-gray-500"
                  }
                >
                  {label}
                </span>
              </div>
            </Link>
          </div>
        </div>
      ))}

      <div>
        {model.isAccountLoading ? (
          <NavigationContainerSkeleton />
        ) : (
          <>
            <SignedOut>
              <div className="flex lg:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative p-1"
                  onClick={() => model.openSignIn()}
                >
                  <LogIn
                    size={32}
                    className="mx-auto text-gray-500"
                    strokeWidth={2}
                  />
                </Button>
              </div>

              <div className="hidden lg:flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative p-1"
                  onClick={() => model.openSignIn()}
                >
                  <div className="flex items-center justify-center gap-2 px-4 py-2">
                    <LogIn
                      size={24}
                      className="text-gray-500"
                      strokeWidth={2}
                    />
                    <span className="text-lg font-semibold text-gray-500">
                      Sign In
                    </span>
                  </div>
                </Button>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="flex items-center gap-2">
                <div className="hidden lg:flex lg:flex-col lg:items-end lg:gap-1">
                  <span className="text-lg font-bold text-black">
                    {model.displayName}
                  </span>
                  {typeof model.accountCents === "number" && (
                    <span className="text-sm font-medium text-gray-600">
                      ${(model.accountCents / 100).toFixed(2)}
                    </span>
                  )}
                </div>

                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="relative"
                >
                  <Link to="/account" aria-label="Open account">
                    {model.avatarUrl ? (
                      <img
                        src={model.avatarUrl}
                        alt={model.displayName}
                        className="h-8 w-8 rounded-full object-cover lg:h-10 lg:w-10"
                      />
                    ) : (
                      <UserRound
                        size={32}
                        className="mx-auto text-gray-700"
                        strokeWidth={2}
                      />
                    )}
                  </Link>
                </Button>
              </div>
            </SignedIn>
          </>
        )}
      </div>
    </nav>
  );
}

/**
 * Derives the `NavigationContainer` render model.
 *
 * Responsibilities:
 * - Computes active nav state from TanStack Router location + `NAV_ITEMS`.
 * - Bridges the Clerk sign-in modal (`useClerk().openSignIn`) to button clicks.
 * - Fetches Clerk user identity + the Convex member record to produce the display
 *   name, avatar URL, and member account cents for the signed-in account area.
 *
 * @param _props - Incoming component props (currently unused).
 * @returns A view model with `navItems`, `openSignIn`, and account display fields.
 */
function useNavigationContainer(_props: NavigationContainerProps) {
  const location = useLocation();
  const { openSignIn } = useClerk();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();

  const memberData = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const navItems = useMemo(() => {
    return NAV_ITEMS.map(({ href, icon: Icon, label }) => {
      const isActive = isNavItemActive(href, location.pathname);
      return {
        href,
        Icon,
        label,
        isActive,
      };
    });
  }, [location.pathname]);

  const displayName = useMemo(() => {
    if (!clerkUser) return "User";
    if (!memberData) {
      return formatUserDisplayName(clerkUser.firstName, clerkUser.lastName);
    }

    if (
      typeof memberData !== "object" ||
      Array.isArray(memberData) ||
      !("firstname" in memberData)
    ) {
      return formatUserDisplayName(clerkUser.firstName, clerkUser.lastName);
    }

    return formatUserDisplayName(
      memberData.firstname || clerkUser.firstName,
      memberData.lastname || clerkUser.lastName,
    );
  }, [clerkUser, memberData]);

  const isAccountLoading =
    !isClerkLoaded || (clerkUser && memberData === undefined);

  const accountCents = useMemo(() => {
    if (!clerkUser || !memberData) return undefined;

    if (
      typeof memberData !== "object" ||
      Array.isArray(memberData) ||
      !("account" in memberData)
    )
      return undefined;

    return typeof memberData.account === "number"
      ? memberData.account
      : undefined;
  }, [clerkUser, memberData]);

  return {
    navItems,
    openSignIn: () => openSignIn(),
    isAccountLoading,
    displayName,
    avatarUrl: clerkUser?.imageUrl,
    accountCents,
  };
}

/**
 * Loading UI for the account area inside `NavigationContainer`.
 */
function NavigationContainerSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden lg:mr-2 lg:flex lg:flex-col lg:items-end lg:gap-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-8 rounded-full lg:h-10 lg:w-10" />
    </div>
  );
}
