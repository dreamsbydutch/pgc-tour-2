import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/utils/classNames";

type PrototypeOption<T extends string> = {
  key: T;
  label: string;
};

type PrototypeSwitcherProps<T extends string> = {
  current: T;
  options: readonly PrototypeOption<T>[];
  onChange: (value: T) => void;
};

export function PrototypeSwitcher<T extends string>(
  props: PrototypeSwitcherProps<T>,
) {
  const currentIndex = Math.max(
    0,
    props.options.findIndex((option) => option.key === props.current),
  );

  function cycle(direction: -1 | 1) {
    const nextIndex =
      (currentIndex + direction + props.options.length) % props.options.length;
    const next = props.options[nextIndex];
    if (next) props.onChange(next.key);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select, [contenteditable]") ||
          target.closest("[contenteditable]"))
      ) {
        return;
      }
      event.preventDefault();
      cycle(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const active = props.options[currentIndex];

  return (
    <div
      className={cn(
        "fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-slate-950 p-1 text-white shadow-2xl",
        "lg:bottom-4",
      )}
      role="group"
      aria-label="Account prototype variants"
    >
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
        onClick={() => cycle(-1)}
        aria-label="Previous prototype"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-40 items-center justify-center gap-2 px-2 text-center text-xs font-semibold sm:min-w-52">
        <FlaskConical
          className="h-3.5 w-3.5 text-lime-300"
          aria-hidden="true"
        />
        <span>
          {active?.key.toUpperCase()} · {active?.label}
        </span>
      </div>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
        onClick={() => cycle(1)}
        aria-label="Next prototype"
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
