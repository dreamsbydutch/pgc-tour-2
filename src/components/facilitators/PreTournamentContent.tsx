"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "@/lib/constants";
import { TournamentCountdown } from "@/displays";
import { cn, formatMoney } from "@/lib";
import { useMutation, useQuery } from "convex/react";
import { api, Id } from "@/convex";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EnhancedTournamentTeamDoc } from "convex/types/types";

/**
 * Renders the pre-tournament pick experience.
 *
 * Major states:
 * - Picks closed: shows the countdown.
 * - Not signed in (missing `member`/`tourCard`): prompts sign-in.
 * - Regular event: shows the team picker entry point.
 * - Playoff event:
 *   - If ineligible: shows an ineligible message.
 *   - If eligible: shows the picker until the carry-over lock applies.
 *
 * Notes:
 * - The main content relies on the parent route to provide tournament/member data.
 * - The picker dialog fetches the tournament pick pool when opened.
 * - Team-pick persistence happens via the dialog (create/update team).
 *
 * @param props.tournament - Tournament data including `startDate` and (optionally) tier.
 * @param props.member - Current member (required to pick a team).
 * @param props.tourCard - Current tour card (required to pick a team).
 * @param props.existingTeam - The member's existing team (if any).
 * @param props.teamGolfers - Golfers on the member's existing team (optional).
 * @param props.playoffEventIndex - 1-based playoff event index in the season (defaults to 0).
 * @returns The pre-tournament content UI.
 */
export function PreTournamentContent(props: {
  tournament: {
    _id: string;
    name: string;
    startDate: number;
    logoUrl?: string | undefined;
    tier?: { name: string } | undefined;
  };
  member?: {
    firstname?: string | undefined;
    lastname?: string | undefined;
    email: string;
    account: number;
  };
  tourCard?: {
    _id: string;
    tourId: string;
    playoff?: number | undefined;
    currentPosition?: string | undefined;
    points: number;
    earnings: number;
  } | null;
  existingTeam?: EnhancedTournamentTeamDoc;
  teamGolfers: {
    apiId?: number | undefined;
    _id: string;
    playerName?: string | undefined;
    worldRank?: number | undefined;
    rating?: number | undefined;
    group?: number | undefined;
  }[];
  playoffEventIndex?: number;
}) {
  const model = usePreTournamentContentModel(props);

  if (model.kind === "picksClosed") {
    return (
      <TournamentCountdown
        name={props.tournament.name}
        startDate={props.tournament.startDate}
        logoUrl={props.tournament.logoUrl}
      />
    );
  }
  if (model.kind === "mustSignIn") {
    return (
      <>
        <TournamentCountdown
          name={props.tournament.name}
          startDate={props.tournament.startDate}
          logoUrl={props.tournament.logoUrl}
        />
        <SignInPrompt />
      </>
    );
  }
  if (model.kind === "ineligiblePlayoffs") {
    return (
      <>
        <TournamentCountdown
          name={props.tournament.name}
          startDate={props.tournament.startDate}
          logoUrl={props.tournament.logoUrl}
        />
        <IneligiblePlayoffsMessage />
      </>
    );
  }
  if (model.kind === "carryOverLocked") {
    // TODO: Show active playoff leaderboard, instead of just the countdown.
    return (
      <TournamentCountdown
        name={props.tournament.name}
        startDate={props.tournament.startDate}
        logoUrl={props.tournament.logoUrl}
      />
    );
  }

  return (
    <TeamPickCard
      tournamentId={model.tournamentId}
      tourCardId={model.tourCardId}
      existingTeam={model.existingTeam}
      teamGolfers={model.teamGolfers}
      memberName={model.memberName}
      hasBalance={model.hasBalance}
      balanceNotice={model.balanceNotice}
      formattedRank={model.formattedRank}
      pointsDisplay={model.pointsDisplay}
      earningsDisplay={model.earningsDisplay}
      hasExistingTeam={model.hasExistingTeam}
      isPickerOpen={model.isPickerOpen}
      onOpenChange={model.onPickerOpenChange}
      onOpenPicker={model.onOpenPicker}
    />
  );
}

/**
 * Builds the view model for `PreTournamentContent`.
 *
 * This hook only derives and normalizes *incoming* data and controls the picker open state.
 * Data fetching happens either at a higher level (tournament/member/tour card) or inside the
 * picker dialog (tournament pick pool).
 *
 * @param props Inputs from the tournament page.
 * @returns A render model describing which pre-tournament state to show.
 */
function usePreTournamentContentModel(props: {
  tournament: {
    _id: string;
    name: string;
    startDate: number;
    logoUrl?: string | undefined;
    tier?: { name: string } | undefined;
  };
  member?: {
    firstname?: string | undefined;
    lastname?: string | undefined;
    email: string;
    account: number;
  };
  tourCard?: {
    _id: string;
    tourId: string;
    playoff?: number | undefined;
    currentPosition?: string | undefined;
    points: number;
    earnings: number;
  } | null;
  existingTeam?: EnhancedTournamentTeamDoc;
  teamGolfers: {
    apiId?: number | undefined;
    _id: string;
    playerName?: string | undefined;
    worldRank?: number | undefined;
    rating?: number | undefined;
    group?: number | undefined;
  }[];
  playoffEventIndex?: number;
}) {
  const [isPickWindowOpen, setIsPickWindowOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    const openAt = props.tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS;
    const now = Date.now();
    if (now >= openAt) {
      setIsPickWindowOpen(true);
      return;
    }

    setIsPickWindowOpen(false);
    const timeoutId = window.setTimeout(() => {
      setIsPickWindowOpen(true);
    }, openAt - now);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [props.tournament.startDate]);

  const onPickerOpenChange = useCallback((open: boolean) => {
    setIsPickerOpen(open);
  }, []);

  const onOpenPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  return useMemo(() => {
    if (!isPickWindowOpen) {
      return { kind: "picksClosed" as const };
    }
    if (!props.member || !props.tourCard) {
      return { kind: "mustSignIn" as const };
    }

    const tierName = (props.tournament.tier?.name ?? "").toLowerCase();
    const isPlayoff = tierName.includes("playoff");
    const isEligibleForPlayoffs = (props.tourCard.playoff ?? 0) >= 1;
    const isLaterPlayoff = (props.playoffEventIndex ?? 0) > 1;
    const hasExistingTeam = (props.teamGolfers ?? []).length > 0;

    if (isPlayoff && !isEligibleForPlayoffs) {
      return { kind: "ineligiblePlayoffs" as const };
    }
    if (isPlayoff && isLaterPlayoff) {
      return { kind: "carryOverLocked" as const };
    }

    const firstname = props.member.firstname?.trim() ?? "";
    const lastname = props.member.lastname?.trim() ?? "";
    const positionRaw = props.tourCard.currentPosition;
    const memberName =
      firstname && lastname
        ? `${firstname[0]}. ${lastname}`
        : (firstname ?? lastname ?? "Member");
    const balanceNotice =
      (props.member.account ?? 0) > 0
        ? `Please send ${formatMoney(props.member.account ?? 0, true)} to puregolfcollectivetour@gmail.com to unlock your picks.`
        : null;
    const formattedRank = (() => {
      if (typeof positionRaw === "string" && positionRaw.trim()) {
        return positionRaw;
      }
      const n = typeof positionRaw === "number" ? positionRaw : NaN;
      if (!Number.isFinite(n) || n <= 0) return "Unranked";
      if (n >= 11 && n <= 13) return `${n}th`;
      const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
      return `${n}${suffix}`;
    })();
    const pointsDisplay = `${(props.tourCard.points ?? 0).toLocaleString()}`;
    const earningsDisplay =
      props.tourCard.earnings != null && props.tourCard.earnings > 0
        ? ` - ${formatMoney(props.tourCard.earnings, true)}`
        : "";

    return {
      kind: "ready" as const,
      tournamentId: props.tournament._id,
      tourCardId: props.tourCard._id,
      existingTeam: props.existingTeam ?? null,
      teamGolfers: props.teamGolfers,
      memberName,
      hasBalance: (props.member.account ?? 0) > 0,
      balanceNotice,
      formattedRank,
      pointsDisplay,
      earningsDisplay,
      hasExistingTeam,
      isPickerOpen,
      onPickerOpenChange,
      onOpenPicker,
    };
  }, [
    isPickWindowOpen,
    props.member,
    props.playoffEventIndex,
    props.teamGolfers,
    props.tourCard,
    props.tournament._id,
    props.tournament.tier?.name,
    props.existingTeam,
    isPickerOpen,
    onOpenPicker,
    onPickerOpenChange,
  ]);
}

function SignInPrompt() {
  return (
    <div className="text-center">
      <p className="font-medium text-red-800">Please sign in to pick a team.</p>
      <Button
        onClick={() => {
          window.location.href = "/sign-in";
        }}
        variant="outline"
        className="mt-4"
      >
        Sign In
      </Button>
    </div>
  );
}

function IneligiblePlayoffsMessage() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
      <p className="font-medium text-red-800">
        You did not qualify for the PGC Playoffs.
      </p>
    </div>
  );
}

function TeamPickCard(props: {
  tournamentId: string;
  tourCardId: string;
  existingTeam: EnhancedTournamentTeamDoc | null;
  teamGolfers: {
    apiId?: number | undefined;
    _id: string;
    playerName?: string | undefined;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }[];
  memberName: string;
  hasBalance: boolean;
  balanceNotice: string | null;
  formattedRank: string;
  pointsDisplay: string;
  earningsDisplay: string;
  hasExistingTeam: boolean;
  isPickerOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPicker: () => void;
}) {
  return (
    <div className="mx-auto mb-4 w-fit max-w-4xl rounded-lg border border-slate-400 bg-slate-100 px-6 py-2 text-center shadow-xl">
      <div className="text-2xl font-bold">{props.memberName}</div>

      {props.hasBalance && props.balanceNotice ? (
        <div className="mx-auto mb-8 w-5/6 text-center text-lg italic text-red-600">
          {props.balanceNotice}
        </div>
      ) : null}

      <div className="text-lg font-bold">
        {`${props.formattedRank} - ${props.pointsDisplay} pts${props.earningsDisplay}`}
      </div>

      {(props.teamGolfers.length ?? 0) > 0 ? (
        <TeamGolfersList golfers={props.teamGolfers!} />
      ) : null}

      <Button
        onClick={props.onOpenPicker}
        disabled={props.hasBalance}
        variant="default"
        className={cn("mb-4 mt-8 text-xl")}
        size="lg"
      >
        {props.hasExistingTeam ? "Change Your Team" : "Create Your Team"}
      </Button>

      <TournamentTeamPickerDialog
        open={props.isPickerOpen}
        onOpenChange={props.onOpenChange}
        tournamentId={props.tournamentId}
        tourCardId={props.tourCardId}
        existingTeam={props.existingTeam}
        teamGolfers={props.teamGolfers}
      />
    </div>
  );
}

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
function TournamentTeamPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  tourCardId: string;
  existingTeam?: {
    _id: string;
  } | null;
  teamGolfers: {
    apiId?: number | undefined;
    _id: string;
    playerName?: string | undefined;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }[];
}) {
  const { existingTeam, onOpenChange, open, teamGolfers, tournamentId, tourCardId } =
    props;
  const createTeam = useMutation(api.functions.teams.createTeams);
  const updateTeam = useMutation(api.functions.teams.updateTeams);

  const pickPool = useQuery(
    api.functions.tournaments.getTournamentPickPool,
    open ? { tournamentId: tournamentId as unknown as Id<"tournaments"> }
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
    if (!open) return;
    setSelectedApiIds(teamGolfers.map((g) => g.apiId ?? -1) ?? []);
    setErrorMessage(null);
    setIsSaving(false);
  }, [open, teamGolfers]);

  const model = useMemo(() => {
    if (!open) {
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
        const tournamentIdValue = tournamentId as unknown as Id<"tournaments">;
        const tourCardIdValue = tourCardId as unknown as Id<"tourCards">;

        if (existingTeam?._id) {
          await updateTeam({
            teamId: existingTeam._id as unknown as Id<"teams">,
            data: { golferIds: selectedApiIds },
          });
        } else {
          await createTeam({
            data: {
              tournamentId: tournamentIdValue,
              tourCardId: tourCardIdValue,
              golferIds: selectedApiIds,
            },
          });
        }

        onOpenChange(false);
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
    existingTeam,
    onOpenChange,
    open,
    tournamentId,
    tourCardId,
    selectedApiIds,
    updateTeam,
  ]);

  const [expandedCompletedGroups, setExpandedCompletedGroups] = useState<
    Set<number>
  >(new Set());

  const readyGroups = model.kind === "ready" ? model.groups : null;

  useEffect(() => {
    if (!readyGroups) return;

    setExpandedCompletedGroups((prev) => {
      const next = new Set(prev);

      for (const group of readyGroups) {
        if (group.groupKey === 0) continue;
        if (group.selectedCount < 2) next.delete(group.groupKey);
      }

      return next;
    });
  }, [readyGroups]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onClick={() => onOpenChange(false)}
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

  if (props.group.groupKey === 0) return null;
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 font-semibold">{props.group.label}</div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600">
            {props.group.selectedCount}/2
          </div>
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
 * Shows the golfer list for the currently selected team during the pre-tournament flow.
 *
 * Behavior:
 * - Sorts by `worldRank`, then `group`.
 * - Shows world rank and rating when present.
 * - Adds light row separators for readability.
 *
 * @param props.golfers - The golfers on the member's current team.
 * @returns A compact list of golfers.
 */
function TeamGolfersList({
  golfers,
}: {
  golfers: {
    apiId?: number | undefined;
    _id: string;
    playerName?: string | undefined;
    worldRank?: number | null | undefined;
    rating?: number | null | undefined;
    group?: number | null | undefined;
  }[];
}) {
  const sortedGolfers = [...golfers]
    .sort((a, b) => (a.worldRank ?? Infinity) - (b.worldRank ?? Infinity))
    .sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity));
  return (
    <div className="mt-2">
      {sortedGolfers.map((golfer, i) => (
        <div
          key={String(golfer.apiId ?? golfer._id ?? i)}
          className={cn(
            i % 2 !== 0 && i < 9 && "border-b border-slate-500",
            i === 0 && "mt-2",
            "py-0.5",
          )}
        >
          <div className="text-lg">
            {`#${golfer.worldRank} ${golfer.playerName} (${golfer.rating})`}
          </div>
        </div>
      ))}
    </div>
  );
}
