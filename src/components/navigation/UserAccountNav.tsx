/**
 * UserAccountNav Component
 * Handles user authentication state and account navigation with error handling
 * Adapted for Clerk + Convex with UserButton for clean popover experience
 */

"use client";

import { useMemo } from "react";
import { AlertTriangle, RefreshCw, LogIn, UserRound } from "lucide-react";
import {
  SignedIn,
  SignedOut,
  useUser,
  useClerk,
} from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { formatUserDisplayName } from "./utils";
import type { UserAccountNavProps } from "./types";

export function UserAccountNav({ navigationData }: UserAccountNavProps) {
  const { member, error, hasNetworkError, retryCount } = navigationData;
  const { openSignIn } = useClerk();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();

  const displayName = useMemo(() => {
    if (!member?.firstName && !member?.lastName) {
      if (clerkUser?.firstName && clerkUser?.lastName) {
        return formatUserDisplayName(clerkUser.firstName, clerkUser.lastName);
      }
      return (
        clerkUser?.username ||
        clerkUser?.emailAddresses?.[0]?.emailAddress ||
        "User"
      );
    }
    return formatUserDisplayName(member.firstName, member.lastName);
  }, [
    member?.firstName,
    member?.lastName,
    clerkUser?.firstName,
    clerkUser?.lastName,
    clerkUser?.username,
    clerkUser?.emailAddresses,
  ]);

  if (!isClerkLoaded) {
    return (
      <div className="flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (error && hasNetworkError && retryCount < 3 && !clerkUser) {
    return (
      <div className="flex flex-col items-center gap-2 p-2">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <Button
          variant="outline"
          size="sm"
          onClick={error.retry}
          className="border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <SignedOut>
        <div className="flex lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="relative p-1"
            onClick={() => openSignIn()}
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
            onClick={() => openSignIn()}
          >
            <div className="flex items-center justify-center gap-2 px-4 py-2">
              <LogIn size={24} className="text-gray-500" strokeWidth={2} />
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
            <span className="text-lg font-bold text-black">{displayName}</span>
            {member?.account !== undefined && (
              <span className="text-sm font-medium text-gray-600">
                ${(member.account / 100).toFixed(2)}
              </span>
            )}
          </div>

          <Button asChild variant="ghost" size="icon" className="relative">
            <Link to="/account" aria-label="Open account">
              {clerkUser?.imageUrl ? (
                <img
                  src={clerkUser.imageUrl}
                  alt={displayName}
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
  );
}

/**
 * Loading skeleton for user account section
 */
export function UserAccountSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden lg:mr-2 lg:flex lg:flex-col lg:items-end lg:gap-1">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="h-8 w-8 animate-pulse rounded-full border border-gray-300 bg-gray-200 lg:h-10 lg:w-10" />
    </div>
  );
}
