"use client";

import { cn, isNonEmptyString } from "@/lib";
import { Skeleton } from "./skeleton";

/**
 * DropdownRow Component
 *
 * Standardized row/button for dropdown lists with optional icon, title, and subtitle.
 */
export function DropdownRow({
  title,
  subtitle,
  iconUrl,
  isActive,
  onSelect,
  className,
}: {
  title: string;
  subtitle?: string;
  iconUrl?: string | null;
  isActive?: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50",
        isActive && "bg-blue-50",
        className,
      )}
    >
      {isNonEmptyString(iconUrl) && (
        <img src={iconUrl} alt="" className="h-6 w-6 object-contain" />
      )}
      <div>
        <div className="font-medium">{title}</div>
        {isNonEmptyString(subtitle) && (
          <div className="text-xs text-gray-500">{subtitle}</div>
        )}
      </div>
    </button>
  );
}

/**
 * DropdownRowSkeleton Component
 *
 * Loading state for `DropdownRow`.
 */
export function DropdownRowSkeleton() {
  return (
    <div className="flex w-full items-center gap-2 px-4 py-2">
      <Skeleton className="h-6 w-6 rounded" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}
