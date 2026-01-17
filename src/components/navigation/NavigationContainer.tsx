/**
 * NavigationContainer Component
 * Main navigation bar with responsive design, error handling, and accessibility
 * Adapted for TanStack Start + Clerk + Convex
 */

"use client";

import { useLocation } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { NavItem } from "./NavItem";
import { ErrorBoundary } from "./ErrorBoundary";
import { UserAccountNav, UserAccountSkeleton } from "./UserAccountNav";
import { useNavigationData } from "@/hooks/useNavigationData";
import { NAV_ITEMS, isNavItemActive } from "./utils";
import type { NavigationContainerProps } from "./types";

export function NavigationContainer({ className }: NavigationContainerProps) {
  const location = useLocation();
  const navigationData = useNavigationData();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const navItems = useMemo(() => {
    return NAV_ITEMS.map(({ href, icon: Icon, label }) => {
      const isActive = isNavItemActive(href, location.pathname);
      return {
        href,
        Icon,
        label,
        isActive,
        key: href,
      };
    });
  }, [location.pathname]);

  return (
    <ErrorBoundary fallback={<NavigationFallback />}>
      <nav
        className={cn(
          className,
          "fixed bottom-0 z-50 flex w-full items-center justify-evenly border-t lg:top-0 lg:justify-center lg:gap-8 lg:border-b lg:border-t-0 lg:px-4 lg:py-2 xl:gap-14",
          "h-[52px] text-center lg:h-[48px]",
          "bg-gray-200 shadow-inv",
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {navItems.map(({ href, Icon, label, isActive, key }) => (
          <div key={key}>
            <div className="flex lg:hidden">
              <NavItem
                href={href}
                isActive={isActive}
                aria-label={`Navigate to ${label}`}
                className="relative p-1"
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
              </NavItem>
            </div>

            <div className="hidden lg:flex">
              <NavItem
                href={href}
                isActive={isActive}
                aria-label={`Navigate to ${label}`}
                className="relative"
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
              </NavItem>
            </div>
          </div>
        ))}

        <div>
          {isHydrated ? (
            <Suspense fallback={<UserAccountSkeleton />}>
              <UserAccountNav navigationData={navigationData} />
            </Suspense>
          ) : (
            <UserAccountSkeleton />
          )}
        </div>
      </nav>
    </ErrorBoundary>
  );
}

/**
 * Fallback component for navigation errors
 */
function NavigationFallback() {
  return (
    <div
      className="fixed bottom-0 z-50 flex h-[52px] w-full items-center justify-center border-t border-gray-200 bg-white text-center shadow-sm lg:top-0 lg:h-[48px] lg:border-b lg:border-t-0"
      role="navigation"
      aria-label="Navigation unavailable"
    >
      <div className="text-sm text-gray-500">
        Navigation temporarily unavailable
      </div>
    </div>
  );
}
