import { AlertTriangle } from "lucide-react";

import type { AdminTaskPanelProps } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui";
import { cn } from "@/utils/classNames";

export function AdminTaskPanel({
  open,
  title,
  description,
  tone = "routine",
  children,
  footer,
  onClose,
}: AdminTaskPanelProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className={cn(
          "inset-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          tone === "advanced" && "border-t-4 border-red-500",
          tone === "communication" && "border-t-4 border-violet-500",
          tone === "financial" && "border-t-4 border-amber-500",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        {tone === "advanced" ? (
          <div className="mx-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900 sm:mx-6">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            Recovery tool. Review the selected target and result before leaving
            this screen.
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t bg-background px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-4">
            <div className="flex flex-wrap justify-end gap-2">{footer}</div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
