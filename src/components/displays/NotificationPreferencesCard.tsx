import { BellRing, Smartphone } from "lucide-react";

import { useNotificationPreferences } from "@/hooks";
import type { NotificationCategory, PushDeviceState } from "@/types";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";

const categoryRows: Array<{
  category: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    category: "leagueUpdates",
    label: "League updates",
    description: "Weekly recaps and important league news.",
  },
  {
    category: "pickReminders",
    label: "Pick reminders",
    description: "A reminder when a tournament roster is still missing.",
  },
  {
    category: "finalResults",
    label: "Final results",
    description: "Official tournament positions, points, and earnings.",
  },
  {
    category: "teamMoments",
    label: "Big team moments",
    description: "Leads, top-five moves, and major leaderboard jumps.",
  },
  {
    category: "financial",
    label: "E-transfers and account",
    description: "Settlement requests and administrator confirmations.",
  },
  {
    category: "milestones",
    label: "Milestones",
    description: "Tournament wins, majors, and other achievements.",
  },
];

export function NotificationPreferencesCard() {
  const model = useNotificationPreferences();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="rounded-md border bg-background p-2 text-foreground">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Notifications</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose which updates can reach this device. All updates remain in
              your notification center.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-semibold">Push on this device</p>
              <p className="text-sm text-muted-foreground">
                {deviceStateLabel(
                  model.deviceState,
                  model.subscribedDeviceCount,
                )}
              </p>
            </div>
          </div>
          {model.deviceState === "enabled" ? (
            <Button variant="outline" onClick={() => void model.disablePush()}>
              Disable on this device
            </Button>
          ) : (
            <Button
              onClick={() => void model.enablePush()}
              disabled={
                model.deviceState === "busy" ||
                model.deviceState === "unsupported" ||
                model.deviceState === "not-configured" ||
                model.deviceState === "blocked"
              }
            >
              {model.deviceState === "busy" ? "Working…" : "Enable push"}
            </Button>
          )}
        </div>
        {model.deviceError ? (
          <p role="alert" className="text-sm text-red-700">
            {model.deviceError}
          </p>
        ) : null}
        <div className="divide-y rounded-lg border">
          {categoryRows.map((row) => (
            <label
              key={row.category}
              className="flex min-h-16 cursor-pointer items-center justify-between gap-5 p-4"
            >
              <span>
                <span className="block font-medium">{row.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {row.description}
                </span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-slate-900"
                checked={model.preferences?.[row.category] ?? true}
                disabled={
                  model.isLoading || model.busyCategory === row.category
                }
                onChange={(event) =>
                  void model.setPreference(row.category, event.target.checked)
                }
              />
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function deviceStateLabel(state: PushDeviceState, deviceCount: number) {
  if (state === "enabled") return "Enabled for this device";
  if (state === "blocked") return "Blocked in your browser or device settings";
  if (state === "unsupported") return "This browser does not support Web Push";
  if (state === "not-configured") return "Push delivery is not configured yet";
  if (state === "error") return "This device could not be updated";
  if (state === "busy") return "Updating this device…";
  return deviceCount > 0
    ? `Off here · enabled on ${deviceCount} other device${deviceCount === 1 ? "" : "s"}`
    : "Off on this device";
}
