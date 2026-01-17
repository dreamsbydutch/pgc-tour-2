import type { MemberHeaderProps } from "./utils/types";

export function MemberHeader({ member }: MemberHeaderProps) {
  const displayName =
    member?.displayName ||
    `${member?.firstname || ""} ${member?.lastname || ""}`.trim() ||
    member?.email ||
    "Unknown Member";

  return <div className="text-2xl font-bold">{displayName}</div>;
}
