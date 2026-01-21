import { BookText, Home, List, Trophy } from "lucide-react";
import type { NavigationItemConfig } from "./types";
import type { AdminDashboardSection } from "./types";

export const DEFAULT_MAX_PARTICIPANTS = 75;

export const PRE_TOURNAMENT_PICK_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

export const ADMIN_FORM_CONTROL_CLASSNAME =
  "w-full rounded-md border px-3 py-2 text-sm";

export const NAV_ITEMS: NavigationItemConfig[] = [
  { href: "/", icon: Home, label: "HOME" },
  { href: "/tournament", icon: List, label: "LEADERBOARD" },
  { href: "/standings", icon: Trophy, label: "STANDINGS" },
  { href: "/rulebook", icon: BookText, label: "RULEBOOK" },
] as const;

export const ADMIN_DASHBOARD_SECTIONS: readonly AdminDashboardSection[] = [
  "seasons",
  "tours",
  "tiers",
  "courses",
  "members",
  "account-audit",
  "transactions",
  "emails",
  "tournaments",
  "teams",
  "tourcards",
  "golfers",
  "crons",
] as const;
