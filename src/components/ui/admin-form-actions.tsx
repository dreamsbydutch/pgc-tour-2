import { Button } from "./button";
import { cn } from "@/lib";

/**
 * Renders the standard admin form footer actions: a primary submit button and a
 * secondary outline action (usually Reset or Cancel).
 *
 * @param props.primaryLabel Label for the submit button.
 * @param props.secondaryLabel Label for the secondary button.
 * @param props.onSecondary Click handler for the secondary button.
 * @param props.disabled Disables both actions.
 * @param props.className Optional wrapper className.
 * @returns A consistent admin form action row.
 */
export function AdminFormActions(props: {
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
