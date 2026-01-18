"use client";

import { useMemo } from "react";

/**
 * Displays the member's display name for the pre-tournament pick flow.
 *
 * Behavior:
 * - Prefers `member.displayName`.
 * - Falls back to `firstname` + `lastname`.
 * - Falls back to `email`.
 *
 * @param props.member - The currently signed-in member.
 * @returns A bold header with the member display name.
 */
export function MemberHeader(props: {
  member: {
    displayName?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
  };
}) {
  const model = useMemberHeader(props);

  if (!model.displayName) {
    return <MemberHeaderSkeleton />;
  }

  return <div className="text-2xl font-bold">{model.displayName}</div>;
}

/**
 * Derives a stable display name for a member.
 *
 * @param args.member - Member fields used to compute the display name.
 * @returns The final display name string.
 */
function useMemberHeader(args: {
  member: {
    displayName?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
  };
}) {
  return useMemo(() => {
    const displayName =
      args.member.displayName ||
      `${args.member.firstname || ""} ${args.member.lastname || ""}`.trim() ||
      args.member.email ||
      "Unknown Member";

    return { displayName };
  }, [
    args.member.displayName,
    args.member.email,
    args.member.firstname,
    args.member.lastname,
  ]);
}

/**
 * Loading UI for `MemberHeader`.
 */
function MemberHeaderSkeleton() {
  return <div className="h-8 w-48 rounded-md bg-slate-100" />;
}
