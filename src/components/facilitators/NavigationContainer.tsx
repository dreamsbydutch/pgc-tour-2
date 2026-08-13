"use client";

import { Show } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { LogIn, UserRound } from "lucide-react";
import { lazy, Suspense } from "react";

import { MemberNameWithBadges } from "@/components/ui/composites/member-name-with-badges";
import { loadNotificationCenter } from "@/displays";
import { Button } from "@/components/ui/primitives/button";
import { Skeleton } from "@/components/ui/primitives/skeleton";
import type { NavigationContainerProps } from "@/types";
import { useNavigationContainer } from "@/hooks/useNavigationContainer";
import { cn } from "@/utils/classNames";

const NotificationCenter = lazy(async () => {
  const module = await loadNotificationCenter();
  return { default: module.NotificationCenter };
});

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
  const model = useNavigationContainer();

  return (
    <nav
      className={cn(
        props.className,
        "app-navigation fixed bottom-0 z-50 flex w-full items-center border-t lg:top-0 lg:justify-center lg:gap-8 lg:border-b lg:border-t-0 lg:px-4 xl:gap-14",
        "text-center",
        "bg-gray-200 shadow-inv",
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {model.navItems.map(({ href, Icon, label, isActive }) => (
        <div
          key={href}
          className="flex flex-1 justify-center lg:block lg:flex-none"
        >
          <div className="flex lg:hidden">
            <Link
              to={href}
              search={{}}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "transition-colors duration-200 ease-in-out",
                isActive && "bg-gray-300 shadow-emboss",
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
              search={{}}
              className={cn(
                "relative flex items-center justify-center rounded-md p-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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

      <div className="contents lg:block">
        {model.isAccountLoading ? (
          <NavigationContainerSkeleton />
        ) : (
          <>
            <Show when="signed-out">
              <div className="flex flex-1 justify-center lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => model.openSignIn()}
                  aria-label="Sign in"
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
            </Show>

            <Show when="signed-in">
              <div className="contents lg:flex lg:items-center lg:gap-2">
                <div className="hidden lg:flex lg:flex-col lg:items-end lg:gap-1">
                  <span className="text-lg font-bold text-black">
                    <MemberNameWithBadges
                      name={model.displayName}
                      badges={
                        model.memberId
                          ? model.majorChampionBadgesByMemberId[model.memberId]
                          : undefined
                      }
                    />
                  </span>
                  {typeof model.accountCents === "number" && (
                    <span className="text-sm font-medium text-gray-600">
                      ${(model.accountCents / 100).toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 justify-center lg:flex-none">
                  <Suspense fallback={<Skeleton className="h-10 w-10" />}>
                    <NotificationCenter />
                  </Suspense>
                </div>

                <div className="flex flex-1 justify-center lg:flex-none">
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="relative"
                  >
                    <Link to="/account" search={{}} aria-label="Open account">
                      {model.avatarUrl ? (
                        <img
                          src={model.avatarUrl}
                          alt={model.displayName}
                          className="h-8 w-8 rounded-full object-cover lg:h-10 lg:w-10"
                        />
                      ) : (
                        <UserRound
                          size={32}
                          className="mx-auto text-gray-500"
                          strokeWidth={2}
                        />
                      )}
                    </Link>
                  </Button>
                </div>
              </div>
            </Show>
          </>
        )}
      </div>
    </nav>
  );
}

/**
 * Loading UI for the account area inside `NavigationContainer`.
 */
function NavigationContainerSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 lg:flex-none">
      <div className="hidden lg:mr-2 lg:flex lg:flex-col lg:items-end lg:gap-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-8 rounded-full lg:h-10 lg:w-10" />
    </div>
  );
}
