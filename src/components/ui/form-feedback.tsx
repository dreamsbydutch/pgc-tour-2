import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders standard inline form feedback messages.
 *
 * Use this component anywhere a form needs to show an error and/or success message
 * in a consistent style.
 *
 * @param props.error - Error message (renders in red) or `null`/`undefined`.
 * @param props.success - Success message (renders in green) or `null`/`undefined`.
 * @param props.className - Optional wrapper className.
 * @returns Inline feedback UI or `null` when there is nothing to show.
 */
export function FormFeedback(props: {
  error?: string | null;
  success?: string | null;
  loading?: boolean;
  className?: string;
}) {
  const model = useFormFeedback(props);

  if (model.kind === "loading") {
    return <FormFeedbackSkeleton />;
  }

  if (!model.hasAny) return null;

  return (
    <div className={model.className}>
      {model.error ? (
        <p className="text-sm text-red-600">{model.error}</p>
      ) : null}
      {model.success ? (
        <p className="text-sm text-green-700">{model.success}</p>
      ) : null}
    </div>
  );
}

/**
 * Builds display state for `FormFeedback`.
 *
 * @param args - Component inputs.
 * @returns View-model used by the UI.
 */
function useFormFeedback(args: {
  error?: string | null;
  success?: string | null;
  loading?: boolean;
  className?: string;
}) {
  return useMemo(() => {
    if (args.loading) {
      return { kind: "loading" as const };
    }

    const error = args.error ?? null;
    const success = args.success ?? null;

    const hasAny = Boolean(error || success);

    return {
      kind: "ready" as const,
      error,
      success,
      hasAny,
      className: args.className ?? "space-y-1",
    };
  }, [args.className, args.error, args.loading, args.success]);
}

/**
 * Loading UI for `FormFeedback`.
 */
function FormFeedbackSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}
