"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib";

/**
 * Renders a fixed, layered “secondary” toolbar for page-level navigation.
 *
 * Behavior:
 * - Fixed positioning above the primary bottom nav (default offset matches the primary nav height).
 * - Supports a tertiary layer via `level="tertiary"` for stacked navigation.
 *
 * Intended usage:
 * - Use in the app shell (or page facilitators) when a screen needs a second row of navigation.
 * - Pass any buttons/links/toggles as `children`.
 *
 * @param props.children - Toolbar contents.
 * @param props.className - Optional extra classes.
 * @param props.level - Visual/positioning preset for secondary vs tertiary rows.
 * @returns A fixed toolbar wrapper.
 */
export function SecondaryToolbar(props: {
  children: ReactNode;
  className?: string;
  level?: "secondary" | "tertiary";
}) {
  const level = props.level ?? "secondary";

  const baseClasses =
    "fixed flex items-center justify-center transition-all duration-200 shadow-lg border-t bg-gray-100";

  const positionClasses =
    level === "tertiary"
      ? "bottom-24 left-0 right-0"
      : "bottom-14 left-0 right-0";

  const sizeClasses = level === "tertiary" ? "h-7 text-sm z-10" : "h-10 z-20";

  return (
    <div
      className={cn(baseClasses, positionClasses, sizeClasses, props.className)}
    >
      {props.children}
    </div>
  );
}
