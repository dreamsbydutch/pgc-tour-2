"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib";
import { Skeleton } from "./skeleton";

/**
 * Dropdown Component
 *
 * Lightweight, dependency-free dropdown container (trigger + floating content).
 * Designed for complex dropdown content where a native <select> is not suitable.
 */
export function Dropdown({
  open,
  onOpenChange,
  className,
  triggerContent,
  triggerClassName,
  contentClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  triggerContent: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50",
          triggerClassName,
        )}
      >
        {triggerContent}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-1 rounded-md border border-gray-200 bg-white shadow-lg",
            contentClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * DropdownSkeleton Component
 *
 * Loading state for the `Dropdown` trigger.
 */
export function DropdownSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-40 rounded-md", className)} />;
}
