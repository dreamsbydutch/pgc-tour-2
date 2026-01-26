import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib";
import { Button } from "@/ui";

type PaginationStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "LoadingMore"
  | "Exhausted"
  | (string & {});

/**
 * Renders a small “load more” control for cursor-paginated tables.
 *
 * This is a UI primitive that uses an `IntersectionObserver` to optionally auto-load
 * when the sentinel enters the viewport.
 *
 * @param props - Component props.
 * @param props.status - Pagination status.
 * @param props.onLoadMore - Callback invoked with the next page size.
 * @param props.pageSize - Page size per load (default: 100).
 * @param props.auto - Whether to auto-load when visible (default: true).
 * @param props.className - Optional wrapper class.
 * @param props.label - Optional button label override.
 * @returns A sentinel + button to load more results.
 */
export function AdminLoadMore(props: {
  status: PaginationStatus;
  onLoadMore: (pageSize: number) => void;
  pageSize?: number;
  auto?: boolean;
  className?: string;
  label?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { onLoadMore } = props;

  const pageSize = props.pageSize ?? 100;
  const auto = props.auto !== false;

  const canLoadMore =
    props.status === "CanLoadMore" || props.status === "LoadingMore";
  const isLoadingMore = props.status === "LoadingMore";

  const buttonLabel = useMemo(() => {
    if (props.status === "LoadingFirstPage") return "Loading…";
    if (props.status === "LoadingMore") return "Loading more…";
    if (props.status === "Exhausted") return "All loaded";
    return props.label ?? "Load more";
  }, [props.label, props.status]);

  useEffect(() => {
    if (!auto) return;
    if (!canLoadMore) return;
    if (isLoadingMore) return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        onLoadMore(pageSize);
      },
      { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [auto, canLoadMore, isLoadingMore, onLoadMore, pageSize]);

  return (
    <div className={cn("flex flex-col items-center gap-2", props.className)}>
      <div ref={sentinelRef} className="h-px w-full" />
      <Button
        type="button"
        variant="outline"
        onClick={() => onLoadMore(pageSize)}
        disabled={props.status !== "CanLoadMore"}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
