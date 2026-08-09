import { Bell, CheckCheck, Circle } from "lucide-react";
import { useState } from "react";

import { useNotificationCenter } from "@/hooks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui";

export function NotificationCenter() {
  const model = useNotificationCenter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${model.unreadCount ? `, ${model.unreadCount} unread` : ""}`}
        >
          <Bell className="h-6 w-6 text-gray-700" aria-hidden="true" />
          {model.unreadCount > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {model.unreadCount > 99 ? "99+" : model.unreadCount}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Notifications</DialogTitle>
              <DialogDescription>
                League, team, picks, and account updates.
              </DialogDescription>
            </div>
            {model.unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="mr-7"
                onClick={() => void model.markAllRead()}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto border-t">
          {model.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : model.items.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nothing new yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your PGC updates will collect here.
              </p>
            </div>
          ) : (
            model.items.map((item) => (
              <a
                key={item._id}
                href={item.href}
                onClick={() => {
                  void model.markRead(item._id);
                  setOpen(false);
                }}
                className="flex gap-3 border-b p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Circle
                  className={`mt-1 h-2.5 w-2.5 shrink-0 ${item.readAt ? "fill-gray-300 text-gray-300" : "fill-emerald-600 text-emerald-600"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={item.readAt ? "font-medium" : "font-bold"}>
                      {item.title}
                    </p>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatNotificationAge(item.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </a>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatNotificationAge(createdAt: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days}d`
    : new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
      }).format(new Date(createdAt));
}
