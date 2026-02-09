import { BookText, Home, List, Trophy } from "lucide-react";
import type { NavigationItemConfig } from "./types";
import type { TransactionStatus, TransactionType } from "./types";

export const DEFAULT_MAX_PARTICIPANTS = 75;

export const PGC_LOGO_URL =
  "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPJiXqZRs47Fgtd9BSMeHQ2WnVuLfP8IaTAp6E";

export const PRE_TOURNAMENT_PICK_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

export const NAV_ITEMS: NavigationItemConfig[] = [
  { href: "/", icon: Home, label: "HOME" },
  { href: "/tournament", icon: List, label: "LEADERBOARD" },
  { href: "/standings", icon: Trophy, label: "STANDINGS" },
  { href: "/rulebook", icon: BookText, label: "RULEBOOK" },
] as const;


export const TRANSACTION_TYPES: TransactionType[] = [
  "TourCardFee",
  "TournamentWinnings",
  "Withdrawal",
  "Deposit",
  "LeagueDonation",
  "CharityDonation",
  "Payment",
  "Refund",
  "Adjustment",
];

export const TRANSACTION_STATUSES: TransactionStatus[] = [
  "pending",
  "completed",
  "failed",
  "cancelled",
];
