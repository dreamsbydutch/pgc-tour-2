import { useMemo } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Renders a compact, right-aligned set of action buttons for admin table rows.
 *
 * @param props.actions - Buttons to render, in order.
 * @param props.align - Horizontal alignment for the group (default: "end").
 * @param props.className - Optional wrapper className.
 * @returns A consistent row-actions button group.
 */
export function AdminRowActions(props: {
  actions: Array<{
    id?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    type?: ButtonProps["type"];
  }>;
  loading?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  const model = useAdminRowActions(props);

  if (model.kind === "loading") {
    return <AdminRowActionsSkeleton />;
  }

  return (
    <div className={model.className}>
      {model.actions.map((a, index) => (
        <Button
          key={a.id ?? `${a.label}-${index}`}
          type={a.type ?? "button"}
          variant={a.variant}
          size={a.size ?? "sm"}
          onClick={a.onClick}
          disabled={a.disabled}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Builds display state for `AdminRowActions`.
 *
 * @param args - Component inputs.
 * @returns View-model used by the UI.
 */
function useAdminRowActions(args: {
  actions: Array<{
    id?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    type?: ButtonProps["type"];
  }>;
  loading?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  return useMemo(() => {
    if (args.loading) {
      return { kind: "loading" as const };
    }

    const justify = args.align === "start" ? "justify-start" : "justify-end";

    return {
      kind: "ready" as const,
      actions: args.actions,
      className: cn("flex gap-2", justify, args.className),
    };
  }, [args.actions, args.align, args.className, args.loading]);
}

/**
 * Loading UI for `AdminRowActions`.
 */
function AdminRowActionsSkeleton() {
  return (
    <div className="flex justify-end gap-2">
      <Skeleton className="h-9 w-20" />
      <Skeleton className="h-9 w-20" />
    </div>
  );
}
