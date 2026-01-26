import { Skeleton } from "./skeleton";

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
  if (props.loading) {
    return <FormFeedbackSkeleton />;
  }

  const error = props.error ?? null;
  const success = props.success ?? null;

  if (!error && !success) return null;

  return (
    <div className={props.className ?? "space-y-1"}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </div>
  );
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
