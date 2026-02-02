export function getPath<T = unknown, R = unknown>(
  obj: T,
  path: string,
): R | undefined {
  if (!obj || typeof path !== "string" || !path) return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && key in (acc as object)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    ) as R | undefined;
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    return "Unserializable error";
  }
}

export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function sortItems<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "desc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal == null || bVal == null) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function formatScore(score: number | null): string {
  if (score === 0) return "E";
  if (!score) return "-";
  if (score > 0) return `+${score}`;
  return String(score);
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

export function getGolferTeeTime(golfer: {
  round?: number | null;
  roundOneTeeTime?: string | null;
  roundTwoTeeTime?: string | null;
  roundThreeTeeTime?: string | null;
  roundFourTeeTime?: string | null;
}): string | undefined {
  if (!golfer || typeof golfer.round !== "number") return undefined;
  const roundMap = [
    undefined,
    "roundOneTeeTime",
    "roundTwoTeeTime",
    "roundThreeTeeTime",
    "roundFourTeeTime",
  ];
  const key = roundMap[golfer.round];
  const teeTime =
    key && golfer[key as keyof typeof golfer]
      ? String(golfer[key as keyof typeof golfer])
      : undefined;
  if (!teeTime) return undefined;

  const date = new Date(teeTime);
  if (!isNaN(date.getTime())) {
    return date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  }

  const timeRegex = /(\d{1,2}):(\d{2})/;
  const match = timeRegex.exec(teeTime);
  if (match) {
    const hour = Number(match[1]);
    const minute = match[2];
    let period = "AM";
    let displayHour = hour;
    if (hour === 0) {
      displayHour = 12;
    } else if (hour >= 12) {
      period = "PM";
      if (hour > 12) displayHour = hour - 12;
    }
    return `${displayHour}:${minute} ${period}`;
  }

  return teeTime;
}
