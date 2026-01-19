import { useMemo } from "react";

import { AdminRowActions } from "./admin-row-actions";

/**
 * Convenience wrapper for the common admin pattern: an "Edit" button and an
 * optional "Delete" button.
 *
 * @param props.onEdit Callback for the edit action.
 * @param props.onDelete Optional callback for the delete action.
 * @param props.disabled Disables both actions.
 * @param props.editLabel Optional label override (default: "Edit").
 * @param props.deleteLabel Optional label override (default: "Delete").
 * @returns A standardized edit/delete action group.
 */
export function AdminEditDeleteActions(props: {
  onEdit: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  editLabel?: string;
  deleteLabel?: string;
}) {
  const model = useAdminEditDeleteActions(props);

  return <AdminRowActions actions={model.actions} />;
}

/**
 * Builds the action list for `AdminEditDeleteActions`.
 *
 * @param args - Component inputs.
 * @returns View-model used by the UI.
 */
function useAdminEditDeleteActions(args: {
  onEdit: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return useMemo(() => {
    const actions = [
      {
        id: "edit",
        label: args.editLabel ?? "Edit",
        variant: "outline" as const,
        onClick: args.onEdit,
        disabled: args.disabled,
      },
      ...(args.onDelete
        ? ([
            {
              id: "delete",
              label: args.deleteLabel ?? "Delete",
              variant: "destructive" as const,
              onClick: args.onDelete,
              disabled: args.disabled,
            },
          ] as const)
        : []),
    ];

    return { actions };
  }, [
    args.disabled,
    args.editLabel,
    args.deleteLabel,
    args.onEdit,
    args.onDelete,
  ]);
}
