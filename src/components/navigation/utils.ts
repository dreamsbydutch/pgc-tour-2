import { BookText, Home, List, Trophy } from "lucide-react";
import type { NavItem, NavigationError } from "./types";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, label: "HOME" },
  { href: "/tournament", icon: List, label: "LEADERBOARD" },
  { href: "/standings", icon: Trophy, label: "STANDINGS" },
  { href: "/rulebook", icon: BookText, label: "RULEBOOK" },
] as const;

/**
 * Check if a navigation item is active based on current pathname
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (!href || !pathname) return false;
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

/**
 * Format user display name with fallback handling
 */
export function formatUserDisplayName(
  firstName: string | null,
  lastName: string | null,
): string {
  const first = firstName?.trim() || "";
  const last = lastName?.trim() || "";

  if (!first && !last) return "User";
  return `${first} ${last}`.trim();
}

/**
 * Create navigation error with consistent structure
 */
export function createNavigationError(
  code: string,
  message: string,
  retry?: () => void,
): NavigationError {
  return { code, message, retry };
}

/**
 * Check if an error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = String(error).toLowerCase();
  const networkKeywords = [
    "network",
    "fetch",
    "connection",
    "timeout",
    "offline",
    "unreachable",
  ];

  return networkKeywords.some((keyword) => errorMessage.includes(keyword));
}

/**
 * Get retry delay with exponential backoff
 */
export function getRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
}
