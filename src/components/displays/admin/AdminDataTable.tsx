import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";
import { Skeleton } from "@/ui";
import { cn } from "@/lib/utils";

import type { AdminDataTableColumn } from "@/lib/types";

/**
 * Simple admin-friendly data table.
 *
 * Major render states:
 * - Loading: when `rows` is `undefined` or `loading` is true, renders an internal skeleton.
 * - Ready: renders a standard table with the provided columns.
 * - Empty: renders a single empty-message row when there are no rows.
 *
 * @param props Table configuration and rows.
 * @returns A table suitable for admin CRUD screens.
 */
export function AdminDataTable<T extends { _id: string }>(props: {
  rows?: T[];
  columns: Array<AdminDataTableColumn<T>>;
  emptyMessage?: string;
  rowClassName?: string;
  loading?: boolean;
}) {
  const model = useAdminDataTable(props);

  if (model.status === "loading") {
    return <AdminDataTableSkeleton columnCount={props.columns.length} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {model.columns.map((c) => (
            <TableHead key={c.id} className={c.headClassName}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {model.rows?.map((row) => (
          <TableRow key={row._id} className={model.rowClassName}>
            {model.columns.map((c) => (
              <TableCell key={c.id} className={cn(c.cellClassName)}>
                {c.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {model.rows?.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={Math.max(1, model.columns.length)}
              className="text-muted-foreground"
            >
              {model.emptyMessage ?? "No results."}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

/**
 * Computes the render model for `AdminDataTable`.
 */
function useAdminDataTable<T extends { _id: string }>(props: {
  rows?: T[];
  columns: Array<AdminDataTableColumn<T>>;
  emptyMessage?: string;
  rowClassName?: string;
  loading?: boolean;
}) {
  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        rows: T[];
        columns: Array<AdminDataTableColumn<T>>;
        emptyMessage?: string;
        rowClassName?: string;
      };

  const isLoading = props.loading === true || props.rows === undefined;
  if (isLoading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    rows: props.rows ?? [],
    columns: props.columns,
    emptyMessage: props.emptyMessage,
    rowClassName: props.rowClassName,
  } as const satisfies Model;
}

/**
 * Loading UI for `AdminDataTable`.
 */
function AdminDataTableSkeleton(props: { columnCount: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: Math.max(1, props.columnCount) }).map(
            (_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: Math.max(1, props.columnCount) }).map(
              (_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
