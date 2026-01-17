import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type AdminDataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  headClassName?: string;
  cellClassName?: string;
};

export function AdminDataTable<T extends { _id: string }>(props: {
  rows: T[];
  columns: Array<AdminDataTableColumn<T>>;
  emptyMessage?: string;
  rowClassName?: string;
}) {
  const { rows, columns, emptyMessage, rowClassName } = props;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.id} className={c.headClassName}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row._id} className={rowClassName}>
            {columns.map((c) => (
              <TableCell key={c.id} className={cn(c.cellClassName)}>
                {c.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={Math.max(1, columns.length)}
              className="text-muted-foreground"
            >
              {emptyMessage ?? "No results."}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
