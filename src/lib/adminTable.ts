import type { ReactNode } from "react";

import type { AdminDataTableColumn } from "@/lib/types";

/**
 * Builds the standard AdminDataTable "actions" column used by CRUD screens.
 *
 * @param cell Renders the actions UI for a given row.
 * @param options Optional overrides for id/header/classNames.
 * @returns A column definition suitable for `AdminDataTable`.
 */
export function adminActionsColumn<T>(
  cell: (row: T) => ReactNode,
  options?: {
    id?: string;
    header?: ReactNode;
    headClassName?: string;
    cellClassName?: string;
  },
): AdminDataTableColumn<T> {
  return {
    id: options?.id ?? "actions",
    header: options?.header ?? "",
    headClassName: options?.headClassName ?? "w-[1%]",
    cellClassName: options?.cellClassName,
    cell,
  };
}
