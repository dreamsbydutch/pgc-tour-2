"use client";

import { useEffect, useMemo, useState } from "react";

import { api, useMutation, useQuery, type Id } from "@/convex";
import { cn } from "@/lib";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Modal team picker for a single tournament.
 *
 * This widget:
 * - Fetches the tournament pick pool (tournament golfers + group) when opened.
 * - Allows selecting exactly 10 golfers, with a max of 2 golfers per group.
 * - Creates or updates the viewer's team for the tournament via Convex.
 *
 * Data sources:
 * - `api.functions.tournaments.getTournamentPickPool`
 * - `api.functions.teams.createTeams` / `api.functions.teams.updateTeams`
 *
 * @param props.open - Controls dialog visibility.
 * @param props.onOpenChange - Requests open-state changes.
 * @param props.tournamentId - Tournament document id.
 * @param props.tourCardId - Tour card document id.
 * @param props.existingTeamId - Existing team id (when editing).
 * @param props.existingGolferIds - Existing team golfer API ids (for initialization).
 * @returns A dialog containing grouped golfer selection and a save action.
 */
export function TournamentTeamPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  tourCardId: string;
  existingTeamId?: string | null;
  existingGolferIds?: number[] | null;
}) {
  const model = useTournamentTeamPickerDialog(props);

  const [expandedCompletedGroups, setExpandedCompletedGroups] = useState<
    Set<number>
  >(new Set());

  useEffect(() => {
    if (model.kind !== "ready") return;

    setExpandedCompletedGroups((prev) => {
      const next = new Set(prev);

      for (const group of model.groups) {
        if (group.groupKey === 0) continue;
        if (group.selectedCount < 2) next.delete(group.groupKey);
      }

      return next;
    });
  }, [model.kind, model.kind === "ready" ? model.groups : null]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick Your Team</DialogTitle>
          <DialogDescription>
            Pick 10 golfers total (max 2 per group).
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          {model.kind === "loading" ? (
            <div className="text-center text-sm text-gray-600">
              Loading golfers...
            </div>
          ) : model.kind === "error" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {model.message}
            </div>
          ) : (
            <div className="space-y-4">
              {model.groups.map((group) => (
                <TournamentTeamPickerGroup
                  key={group.groupKey}
                  group={group}
                  isCollapsed={
                    group.groupKey !== 0 &&
                    group.selectedCount >= 2 &&
                    !expandedCompletedGroups.has(group.groupKey)
                  }
                  onToggleCollapse={() => {
                    setExpandedCompletedGroups((prev) => {
                      const next = new Set(prev);
                      const isCompleted =
                        group.groupKey !== 0 && group.selectedCount >= 2;
                      if (!isCompleted) return next;

                      if (next.has(group.groupKey)) next.delete(group.groupKey);
                      else next.add(group.groupKey);

                      return next;
                    });
                  }}
                  onToggleGolfer={model.toggleGolfer}
                />
              ))}

              <div className="text-center text-sm text-gray-700">
                {model.totalSelected}/10 selected
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={model.isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={model.onSave}
            disabled={!model.canSave || model.isSaving}
          >
            {model.isSaving ? "Saving..." : "Save Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A single group section inside `TournamentTeamPickerDialog`.
 *
 * @param props.group - Group model.
 * @param props.isCollapsed - Whether the section is collapsed.
 * @param props.onToggleCollapse - Toggle handler for the section.
 * @param props.onToggleGolfer - Toggle handler for a golfer checkbox.
 * @returns A bordered section with an optional collapsed body.
 */
function TournamentTeamPickerGroup(props: {
  group: {
    groupKey: number;
    label: string;
    selectedCount: number;
    golfers: Array<{
      golferApiId: number;
      playerName: string;
      group: number | null;
      worldRank: number | null;
      rating: number | null;
      isSelected: boolean;
      isDisabled: boolean;
    }>;
  };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleGolfer: (apiId: number) => void;
}) {
  const isCollapsible =
    props.group.groupKey !== 0 && props.group.selectedCount >= 2;

  const selectedGolfers = props.group.golfers.filter((g) => g.isSelected);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 font-semibold">{props.group.label}</div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600">{props.group.selectedCount}/2</div>
          {isCollapsible ? (
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-md p-1 text-gray-600 hover:bg-gray-100",
              )}
              onClick={props.onToggleCollapse}
              aria-label={props.isCollapsed ? "Expand group" : "Collapse group"}
              title={props.isCollapsed ? "Expand" : "Collapse"}
            >
              {props.isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {props.isCollapsed ? (
        <div className="text-sm text-gray-700">
          {selectedGolfers.length > 0 ? (
            <div className="grid grid-cols-1 gap-1">
              {selectedGolfers.map((g) => (
                <div key={g.golferApiId} className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-600">
                    {g.worldRank != null ? `#${g.worldRank}` : ""}
                  </span>
                  <span className="font-medium">{g.playerName}</span>
                  <span className="text-xs text-gray-600">
                    {g.rating != null ? `(${g.rating})` : "(N/A)"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600">No golfers selected</div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {props.group.golfers.map((g) => (
            <label
              key={g.golferApiId}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2"
            >
              <input
                type="checkbox"
                checked={g.isSelected}
                disabled={g.isDisabled}
                onChange={() => props.onToggleGolfer(g.golferApiId)}
              />{" "}
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-gray-600">
                  {g.worldRank != null ? `#${g.worldRank}` : ""}
                </span>
                <span className="truncate text-sm font-medium">
                  {g.playerName}
                </span>
                <span className="text-xs text-gray-600">
                  {g.rating != null ? `(${g.rating})` : "(N/A)"}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Builds the view model and server actions for `TournamentTeamPickerDialog`.
 *
 * @param props - Dialog props.
 * @returns Derived groups, selection constraints, and a save handler.
 */
function useTournamentTeamPickerDialog(props: {
  open: boolean;
  tournamentId: string;
  tourCardId: string;
  existingTeamId?: string | null;
  existingGolferIds?: number[] | null;
  onOpenChange: (open: boolean) => void;
}) {
  const createTeam = useMutation(api.functions.teams.createTeams);
  const updateTeam = useMutation(api.functions.teams.updateTeams);

  const pickPool = useQuery(
    api.functions.tournaments.getTournamentPickPool,
    props.open
      ? { tournamentId: props.tournamentId as unknown as Id<"tournaments"> }
      : "skip",
  ) as
    | Array<{
        golferApiId: number;
        playerName: string;
        group: number | null;
        worldRank: number | null;
        rating: number | null;
      }>
    | undefined;

  const [selectedApiIds, setSelectedApiIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setSelectedApiIds(props.existingGolferIds ?? []);
    setErrorMessage(null);
    setIsSaving(false);
  }, [props.existingGolferIds, props.open]);

  return useMemo(() => {
    if (!props.open) {
      return {
        kind: "loading" as const,
        isSaving,
        canSave: false,
        totalSelected: 0,
        groups: [],
        toggleGolfer: (_apiId: number) => {},
        onSave: async () => {},
      };
    }

    if (pickPool === undefined) {
      return {
        kind: "loading" as const,
        isSaving,
        canSave: false,
        totalSelected: selectedApiIds.length,
        groups: [],
        toggleGolfer: (_apiId: number) => {},
        onSave: async () => {},
      };
    }

    const pool = Array.isArray(pickPool) ? pickPool : [];

    if (pool.length === 0) {
      return {
        kind: "error" as const,
        message: "No golfers available for this tournament yet.",
        isSaving,
        canSave: false,
        totalSelected: selectedApiIds.length,
        groups: [],
        toggleGolfer: (_apiId: number) => {},
        onSave: async () => {},
      };
    }

    const totalSelected = selectedApiIds.length;

    const groupToSelectedCount = new Map<number, number>();
    for (const apiId of selectedApiIds) {
      const g = pool.find((x) => x.golferApiId === apiId);
      const group = g?.group;
      if (typeof group !== "number") continue;
      groupToSelectedCount.set(
        group,
        (groupToSelectedCount.get(group) ?? 0) + 1,
      );
    }

    const byGroup = new Map<number, typeof pool>();
    for (const g of pool) {
      const key = typeof g.group === "number" ? g.group : 0;
      byGroup.set(key, [...(byGroup.get(key) ?? []), g]);
    }

    const groups = Array.from(byGroup.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupKey, golfers]) => {
        const selectedCount =
          groupKey === 0 ? 0 : (groupToSelectedCount.get(groupKey) ?? 0);

        const sorted = [...golfers].sort(
          (a, b) => (a.worldRank ?? Infinity) - (b.worldRank ?? Infinity),
        );

        return {
          groupKey,
          label: groupKey === 0 ? "Ungrouped" : `Group ${groupKey}`,
          selectedCount,
          golfers: sorted.map((g) => {
            const isSelected = selectedApiIds.includes(g.golferApiId);
            const nextGroupCount =
              typeof g.group === "number"
                ? (groupToSelectedCount.get(g.group) ?? 0)
                : 0;

            const wouldExceedTotal = !isSelected && totalSelected >= 10;
            const wouldExceedGroup =
              typeof g.group === "number" && !isSelected && nextGroupCount >= 2;

            return {
              ...g,
              isSelected,
              isDisabled: wouldExceedTotal || wouldExceedGroup || isSaving,
            };
          }),
        };
      });

    const toggleGolfer = (apiId: number) => {
      setErrorMessage(null);

      setSelectedApiIds((prev) => {
        const has = prev.includes(apiId);
        if (has) return prev.filter((x) => x !== apiId);

        if (prev.length >= 10) return prev;

        const g = pool.find((x) => x.golferApiId === apiId);
        const group = g?.group;
        if (typeof group === "number") {
          const currentGroupCount = prev
            .map((id) => pool.find((x) => x.golferApiId === id))
            .filter((x) => x?.group === group).length;
          if (currentGroupCount >= 2) return prev;
        }

        return [...prev, apiId];
      });
    };

    const canSave = totalSelected === 10 && !isSaving;

    const onSave = async () => {
      if (!canSave) return;

      setIsSaving(true);
      setErrorMessage(null);

      try {
        const tournamentId = props.tournamentId as unknown as Id<"tournaments">;
        const tourCardId = props.tourCardId as unknown as Id<"tourCards">;

        if (props.existingTeamId) {
          await updateTeam({
            teamId: props.existingTeamId as unknown as Id<"teams">,
            data: { golferIds: selectedApiIds },
          });
        } else {
          await createTeam({
            data: {
              tournamentId,
              tourCardId,
              golferIds: selectedApiIds,
            },
          });
        }

        props.onOpenChange(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save team.";
        setErrorMessage(message);
      } finally {
        setIsSaving(false);
      }
    };

    if (errorMessage) {
      return {
        kind: "error" as const,
        message: errorMessage,
        isSaving,
        canSave: false,
        totalSelected,
        groups,
        toggleGolfer,
        onSave,
      };
    }

    return {
      kind: "ready" as const,
      isSaving,
      canSave,
      totalSelected,
      groups,
      toggleGolfer,
      onSave,
    };
  }, [
    createTeam,
    errorMessage,
    isSaving,
    pickPool,
    props.existingTeamId,
    props.onOpenChange,
    props.open,
    props.tournamentId,
    props.tourCardId,
    selectedApiIds,
    updateTeam,
  ]);
}
