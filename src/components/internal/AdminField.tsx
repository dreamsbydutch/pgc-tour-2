import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared label + control wrapper for admin forms.
 *
 * Major render states:
 * - Loading: when `loading` is true, renders a compact skeleton matching the label/control layout.
 * - Ready: renders a label with the provided children.
 *
 * @param props.label Label text displayed above the control.
 * @param props.children The form control(s) rendered under the label.
 * @param props.loading When true, shows a skeleton instead of children.
 * @returns A consistent admin form field wrapper.
 */
export function Field(props: {
  label: string;
  children: ReactNode;
  loading?: boolean;
}) {
  const model = useField(props);

  if (model.status === "loading") return <FieldSkeleton label={props.label} />;

  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{model.label}</span>
      {model.children}
    </label>
  );
}

/**
 * Derives the render model for `Field`.
 */
function useField(props: {
  label: string;
  children: ReactNode;
  loading?: boolean;
}) {
  type Model =
    | { status: "loading" }
    | { status: "ready"; label: string; children: ReactNode };

  if (props.loading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    label: props.label,
    children: props.children,
  } as const satisfies Model;
}

/**
 * Loading UI for `Field`.
 */
function FieldSkeleton(props: { label: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{props.label}</span>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
