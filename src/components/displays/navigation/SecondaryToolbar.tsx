"use client";

import type { ReactNode, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib";

function useIsHorizontallyOverflowing(ref: RefObject<HTMLElement | null>) {
  const [isOverflowing, setIsOverflowing] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;

    if (!el) {
      setIsOverflowing(false);
      return;
    }

    setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [ref]);

  useLayoutEffect(() => {
    update();
  });

  useEffect(() => {
    update();

    const el = ref.current;
    let ro: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined" && el) {
      ro = new ResizeObserver(() => {
        update();
      });
      ro.observe(el);
    }

    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [ref, update]);

  return isOverflowing;
}

/**
 * Renders a fixed, layered “secondary” toolbar for page-level navigation.
 *
 * Behavior:
 * - Fixed positioning above the primary bottom nav (default offset matches the primary nav height).
 * - Supports a tertiary layer via `level="tertiary"` for stacked navigation.
 * - Centers contents when they fit; switches to left-aligned horizontal scrolling when contents overflow.
 *
 * Intended usage:
 * - Use in the app shell (or page facilitators) when a screen needs a second row of navigation.
 * - Pass any buttons/links/toggles as `children`.
 *
 * @param props.children - Toolbar contents.
 * @param props.className - Optional extra classes.
 * @param props.level - Visual/positioning preset for secondary vs tertiary rows.
 * @returns A fixed toolbar wrapper.
 */
export function SecondaryToolbar(props: {
  children: ReactNode;
  className?: string;
  level?: "secondary" | "tertiary";
}) {
  const level = props.level ?? "secondary";
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isOverflowing = useIsHorizontallyOverflowing(contentRef);

  const baseClasses =
    "fixed left-0 right-0 transition-all duration-200 shadow-lg bg-gray-100";

  const positionClasses =
    level === "tertiary"
      ? "bottom-24 lg:bottom-auto lg:top-[88px]"
      : "bottom-14 lg:bottom-auto lg:top-[48px]";

  const sizeClasses = level === "tertiary" ? "h-7 text-sm z-30" : "h-10 z-40";

  const borderClasses = "border-t lg:border-t-0 lg:border-b";

  return (
    <div
      className={cn(
        baseClasses,
        positionClasses,
        sizeClasses,
        borderClasses,
        props.className,
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          "flex h-full w-full items-center overflow-x-auto",
          isOverflowing ? "justify-start" : "justify-center",
        )}
      >
        {props.children}
      </div>
    </div>
  );
}
