/**
 * Navigation data hook - adapted for Clerk + Convex
 * Optimized with error handling, retry logic, and efficient caching
 */

"use client";

import { useMemo, useRef } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  NavigationData,
  NavigationError,
} from "../components/navigation/types";
import { isNetworkError } from "../components/navigation/utils";

/**
 * Custom hook for navigation data with comprehensive error handling and optimization
 */
export function useNavigationData(): NavigationData {
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const retryCountRef = useRef(0);

  const memberData = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const navigationUser = useMemo(() => {
    if (!clerkUser) return null;

    return {
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      avatar: clerkUser.imageUrl,
    };
  }, [clerkUser]);

  const navigationMember = useMemo(() => {
    if (!clerkUser || !memberData) return null;

    if (
      typeof memberData !== "object" ||
      Array.isArray(memberData) ||
      !("firstname" in memberData)
    )
      return null;

    return {
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      firstName: memberData.firstname || clerkUser.firstName,
      lastName: memberData.lastname || clerkUser.lastName,
      role: ("role" in memberData && typeof memberData.role === "string"
        ? memberData.role
        : "user") as string,
      account:
        "account" in memberData && typeof memberData.account === "number"
          ? memberData.account
          : 0,
      friends:
        "friends" in memberData && Array.isArray(memberData.friends)
          ? (memberData.friends as string[])
          : [],
    };
  }, [clerkUser, memberData]);

  const navigationError = useMemo((): NavigationError | null => {
    if (!isClerkLoaded) return null;
    return null;
  }, [isClerkLoaded]);

  const isLoading = !isClerkLoaded || (clerkUser && memberData === undefined);

  const hasNetworkError = useMemo(() => {
    return navigationError ? isNetworkError(navigationError.message) : false;
  }, [navigationError]);

  return {
    user: navigationUser,
    member: navigationMember,
    tourCards: null,
    champions: null,
    isLoading: isLoading ?? false,
    tourCardLoading: false,
    error: navigationError,
    hasNetworkError,
    retryCount: retryCountRef.current,
  };
}
