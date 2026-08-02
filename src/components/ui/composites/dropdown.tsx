"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { useMemo } from "react";

import type { DropdownItem, DropdownSection } from "@/types";
import { cn } from "@/utils/classNames";
import { isNonEmptyString } from "@/utils/strings";

export function Dropdown({
  open,
  onOpenChange,
  className,
  triggerContent,
  triggerLabel,
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
  triggerLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
  header?: ReactNode;
  items?: DropdownItem[];
  sections?: DropdownSection[];
  emptyState?: ReactNode;
  children?: ReactNode;
}) {
  const resolvedSections = useMemo(() => {
    if (sections && sections.length > 0) return sections;
    if (items && items.length > 0) {
      return [{ key: "items", items } satisfies DropdownSection];
    }
    return null;
  }, [items, sections]);

  const rowCount =
    resolvedSections?.reduce(
      (count, section) => count + section.items.length,
      0,
    ) ?? 0;

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <div className={cn("relative", className)}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            className={cn(
              "flex min-h-11 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              triggerClassName,
            )}
          >
            {triggerContent}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className={cn(
              "z-50 min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              contentClassName,
            )}
          >
            {header}
            {resolvedSections ? (
              rowCount > 0 ? (
                <div className="max-h-72 overflow-y-auto">
                  {resolvedSections.map((section, sectionIndex) => (
                    <DropdownMenu.Group key={section.key}>
                      {sectionIndex > 0 ? (
                        <DropdownMenu.Separator className="h-px bg-border" />
                      ) : null}
                      {isNonEmptyString(section.title) ? (
                        <DropdownMenu.Label className="bg-gray-700 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-gray-50">
                          {section.title}
                        </DropdownMenu.Label>
                      ) : null}
                      {section.items.map((item) => (
                        <DropdownRow key={item.key} item={item} />
                      ))}
                    </DropdownMenu.Group>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  {emptyState ?? null}
                </div>
              )
            ) : (
              children
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </div>
    </DropdownMenu.Root>
  );
}

function DropdownRow({ item }: { item: DropdownItem }) {
  return (
    <DropdownMenu.Item
      onSelect={item.onSelect}
      className={cn(
        "flex min-h-11 cursor-default select-none items-center gap-2 px-4 py-2 text-left text-sm outline-none data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-950",
        item.isActive && "bg-blue-50",
        item.className,
      )}
    >
      {isNonEmptyString(item.iconUrl) ? (
        <img src={item.iconUrl} alt="" className="h-6 w-6 object-contain" />
      ) : null}
      <div>
        <div className="font-medium">{item.title}</div>
        {isNonEmptyString(item.subtitle) ? (
          <div className="text-xs text-gray-500">{item.subtitle}</div>
        ) : null}
      </div>
    </DropdownMenu.Item>
  );
}
