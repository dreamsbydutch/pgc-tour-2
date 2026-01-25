"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import type { DropdownItem, DropdownSection } from "@/lib/types";
import { cn, isNonEmptyString } from "@/lib";

/**
 * Lightweight dropdown container (trigger + floating content).
 *
 * This is a UI primitive that uses DOM effects for interaction (outside-click to close).
 * It should remain free of app hooks (Convex/auth/router) and app data side effects.
 *
 * @param props - Dropdown props.
 * @param props.open - Whether the dropdown is expanded.
 * @param props.onOpenChange - Called to request open-state changes.
 * @param props.triggerContent - The trigger button content.
 * @param props.header - Optional content rendered at the top of the panel.
 * @param props.items - Optional flat list of selectable rows.
 * @param props.sections - Optional grouped list of selectable rows.
 * @param props.emptyState - Optional empty-state content when no rows exist.
 * @param props.children - Optional custom panel content (used when no rows are provided).
 * @returns A trigger button plus an optional floating panel.
 */
export function Dropdown({
  open,
  onOpenChange,
  className,
  triggerContent,
  triggerClassName,
  contentClassName,
  header,
  items,
  sections,
  emptyState,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  triggerContent: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  header?: ReactNode;
  items?: DropdownItem[];
  sections?: DropdownSection[];
  emptyState?: ReactNode;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const resolvedSections = useMemo(() => {
    if (sections && sections.length > 0) return sections;
    if (items && items.length > 0) {
      return [{ key: "items", items } satisfies DropdownSection];
    }
    return null;
  }, [items, sections]);

  const rowCount = useMemo(() => {
    if (!resolvedSections) return 0;
    return resolvedSections.reduce(
      (acc, section) => acc + section.items.length,
      0,
    );
  }, [resolvedSections]);

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
          {header}

          {resolvedSections ? (
            rowCount > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                {resolvedSections.map((section) => (
                  <div key={section.key}>
                    {isNonEmptyString(section.title) && (
                      <div className="bg-gray-700 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-gray-50">
                        {section.title}
                      </div>
                    )}
                    {section.items.map((item) => (
                      <DropdownRow
                        key={item.key}
                        item={item}
                        onSelect={() => {
                          onOpenChange(false);
                          item.onSelect();
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              (emptyState ?? null)
            )
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Standardized row/button for dropdown lists with optional icon, title, and subtitle.
 */
function DropdownRow({
  item,
  onSelect,
}: {
  item: DropdownItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50",
        item.isActive && "bg-blue-50",
        item.className,
      )}
    >
      {isNonEmptyString(item.iconUrl) && (
        <img src={item.iconUrl} alt="" className="h-6 w-6 object-contain" />
      )}
      <div>
        <div className="font-medium">{item.title}</div>
        {isNonEmptyString(item.subtitle) && (
          <div className="text-xs text-gray-500">{item.subtitle}</div>
        )}
      </div>
    </button>
  );
}
