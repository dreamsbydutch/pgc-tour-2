import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface NavigationUser {
  id: string;
  email: string;
  avatar?: string;
}

export interface NavigationMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  account: number;
  friends: string[];
}

export interface NavigationTourCard {
  appearances: number;
  win: number;
  topTen: number;
  points: number;
  earnings: number;
}

export interface NavigationChampion {
  id: number;
  tournament: {
    name: string;
    logoUrl: string | null;
    startDate: Date;
    currentRound: number | null;
  };
}

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export interface NavigationError {
  code: string;
  message: string;
  retry?: () => void;
}

export interface NavigationData {
  user: NavigationUser | null;
  member: NavigationMember | null;
  tourCards: NavigationTourCard[] | null;
  champions: NavigationChampion[] | null;
  isLoading: boolean;
  tourCardLoading: boolean;
  error: NavigationError | null;
  hasNetworkError: boolean;
  retryCount: number;
}

export interface NavigationContainerProps {
  className?: string;
}

export interface NavigationProviderProps {
  children: ReactNode;
}

export interface UserAccountNavProps {
  navigationData: NavigationData;
}

export interface NavItemProps {
  href: string;
  isActive: boolean;
  children: ReactNode;
  "aria-label"?: string;
  className?: string;
  onClick?: () => void;
}
