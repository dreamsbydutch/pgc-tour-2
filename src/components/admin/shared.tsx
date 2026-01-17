import React from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function normalizeList<T, K extends string>(
  result: unknown,
  key: K,
): Array<T> {
  if (!result) return [];
  if (Array.isArray(result)) {
    return (result as Array<T | null>).filter((x): x is T => x !== null);
  }
  if (typeof result === "object" && result !== null && key in result) {
    const value = (result as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return (value as Array<T | null>).filter((x): x is T => x !== null);
    }
  }
  return [];
}

export function formatCentsAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function parseNumberList(input: string): number[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) {
    throw new Error("List must be comma-separated numbers");
  }
  return nums.map((n) => Math.trunc(n));
}
