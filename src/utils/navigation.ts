export function isNavItemActive(href: string, pathname: string): boolean {
  if (!href || !pathname) return false;
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function formatUserDisplayName(
  firstName: string | null,
  lastName: string | null,
): string {
  const first = firstName?.trim() || "";
  const last = lastName?.trim() || "";

  if (!first && !last) return "User";
  return `${first} ${last}`.trim();
}
