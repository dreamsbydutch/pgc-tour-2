import type { FormEvent, ReactNode } from "react";

import { AdminDataTable } from "./admin-data-table.tsx";
import { Button } from "../primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../primitives/card";
import { FormFeedback } from "../primitives/form-feedback";
import { Skeleton } from "../primitives/skeleton";
import type { AdminDataTableColumn } from "@/lib/types.ts";
import { cn } from "@/lib/index.ts";

/**
 * AdminCrudSection
 *
 * Standard layout for admin CRUD screens: a form card followed by a list/table card.
 *
 * Data sources:
 * - None directly. This component is purely presentational and consumes data/handlers
 *   from the calling screen's hook.
 *
 * Major render states:
 * - `loading`: renders `AdminCrudSectionSkeleton`.
 * - `ready`: renders a form card and (optionally) a table card.
 *
 * @param props - Component props.
 * @returns A consistent CRUD section wrapper.
 */
export function AdminCrudSection<T extends { _id: string }>(props: {
  loading?: boolean;

  formTitle: ReactNode;
  formDescription?: ReactNode;
  formFields: ReactNode;
  formError?: string | null;
  formSuccess?: string | null;
  submitting?: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;

  tableTitle?: ReactNode;
  tableDescription?: ReactNode;
  tableControls?: ReactNode;
  tableRows?: T[];
  tableColumns?: Array<AdminDataTableColumn<T>>;
  tableEmptyMessage?: string;
  tableFooter?: ReactNode;
}) {
  const model = useAdminCrudSection(props);

  if (model.status === "loading") return <AdminCrudSectionSkeleton />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{model.formTitle}</CardTitle>
          {model.formDescription ? (
            <CardDescription>{model.formDescription}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={model.onSubmit} className="space-y-4">
            {model.formFields}

            <FormFeedback
              error={model.formError ?? null}
              success={model.formSuccess ?? null}
            />

            <AdminFormActions
              primaryLabel={model.primaryActionLabel}
              secondaryLabel={model.secondaryActionLabel}
              onSecondary={model.onSecondaryAction}
              disabled={model.submitting}
            />
          </form>
        </CardContent>
      </Card>

      {model.tableColumns ? (
        <Card>
          <CardHeader>
            {model.tableTitle ? (
              <CardTitle>{model.tableTitle}</CardTitle>
            ) : null}
            {model.tableDescription ? (
              <CardDescription>{model.tableDescription}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {model.tableControls}
            <AdminDataTable
              rows={model.tableRows}
              columns={model.tableColumns}
              emptyMessage={model.tableEmptyMessage}
            />
            {model.tableFooter}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * useAdminCrudSection
 *
 * Shapes the view-model for `AdminCrudSection`.
 *
 * @param props - Inputs from the calling screen.
 * @returns A view-model consumed by the UI.
 */
function useAdminCrudSection<T extends { _id: string }>(props: {
  loading?: boolean;

  formTitle: ReactNode;
  formDescription?: ReactNode;
  formFields: ReactNode;
  formError?: string | null;
  formSuccess?: string | null;
  submitting?: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;

  tableTitle?: ReactNode;
  tableDescription?: ReactNode;
  tableControls?: ReactNode;
  tableRows?: T[];
  tableColumns?: Array<AdminDataTableColumn<T>>;
  tableEmptyMessage?: string;
  tableFooter?: ReactNode;
}) {
  if (props.loading) {
    return { status: "loading" as const };
  }

  return {
    status: "ready" as const,

    formTitle: props.formTitle,
    formDescription: props.formDescription,
    formFields: props.formFields,
    formError: props.formError,
    formSuccess: props.formSuccess,
    submitting: props.submitting === true,
    primaryActionLabel: props.primaryActionLabel,
    secondaryActionLabel: props.secondaryActionLabel,
    onSecondaryAction: props.onSecondaryAction,
    onSubmit: props.onSubmit,

    tableTitle: props.tableTitle,
    tableDescription: props.tableDescription,
    tableControls: props.tableControls,
    tableRows: props.tableRows,
    tableColumns: props.tableColumns,
    tableEmptyMessage: props.tableEmptyMessage,
    tableFooter: props.tableFooter,
  };
}

/**
 * Loading UI for `AdminCrudSection`.
 */
function AdminCrudSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-[520px] max-w-full" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-[520px] max-w-full" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Renders the standard admin form footer actions: a primary submit button and a
 * secondary outline action (usually Reset or Cancel).
 */
function AdminFormActions(props: {
  primaryLabel: string;
  secondaryLabel: string;
  onSecondary: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2", props.className)}>
      <Button type="submit" disabled={props.disabled}>
        {props.primaryLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={props.onSecondary}
        disabled={props.disabled}
      >
        {props.secondaryLabel}
      </Button>
    </div>
  );
}
