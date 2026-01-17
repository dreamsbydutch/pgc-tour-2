"use client";

import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { NavItemProps } from "./types";

export function NavItem({
  href,
  isActive,
  children,
  "aria-label": ariaLabel,
  className,
  onClick,
}: NavItemProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.();

      if (href === window.location.pathname) {
        e.preventDefault();
      }
    },
    [href, onClick],
  );
  return (
    <Link
      to={href}
      params={(current) => current}
      search={(current) => current}
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-center rounded-md p-2",
        "focus:outline-none",
        "transition-colors duration-200 ease-in-out",
        isActive && "bg-gray-300 shadow-emboss",
        className,
      )}
      aria-label={ariaLabel}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
