import type {
  AdminHubOverview,
  AdminOperationRun,
  BuildAdminHubOverviewArgs,
} from "@/types";

export function buildAdminHubOverview({
  now,
  appState,
  focusTournament,
  recentLiveSync,
  pendingSettlementCount,
}: BuildAdminHubOverviewArgs): AdminHubOverview {
  if (!focusTournament) {
    return {
      eventName:
        appState?.seasonPhase === "completed"
          ? "Season complete"
          : "No tournament scheduled",
      eventMeta: "The admin hub will update when an event is available.",
      stageLabel:
        appState?.seasonPhase === "completed" ? "Complete" : "Offseason",
      stageTone: appState?.seasonPhase === "completed" ? "complete" : "neutral",
      readinessLabel: "No tournament action needed",
      readinessDetail: "Member and maintenance tools remain available below.",
      recommendation:
        pendingSettlementCount > 0
          ? settlementRecommendation(pendingSettlementCount)
          : noActionRecommendation(),
    };
  }

  const isActive =
    focusTournament.status === "active" ||
    appState?.activeTournamentId === focusTournament._id;
  const picksOpen =
    appState?.pickWindowTournamentId === focusTournament._id &&
    (appState.pickWindowOpensAt === undefined ||
      appState.pickWindowOpensAt <= now) &&
    (appState.pickWindowClosesAt === undefined ||
      appState.pickWindowClosesAt > now);
  const isCompleted = focusTournament.status === "completed";

  const stage = isActive
    ? ({ label: "Live now", tone: "live" } as const)
    : picksOpen
      ? ({ label: "Picks open", tone: "open" } as const)
      : isCompleted
        ? ({ label: "Completed", tone: "complete" } as const)
        : ({ label: "Upcoming", tone: "upcoming" } as const);

  const readiness = isActive
    ? buildLiveReadiness(focusTournament, recentLiveSync)
    : focusTournament.groupsReady
      ? {
          label: "Groups ready",
          detail: `${focusTournament.groupedGolferCount} golfers are assigned across Groups 1–5.`,
        }
      : {
          label: "Event setup needs attention",
          detail:
            focusTournament.totalGolferCount > 0
              ? `${focusTournament.groupedGolferCount} of ${focusTournament.totalGolferCount} golfers are grouped.`
              : "No grouped tournament field is available yet.",
        };

  let recommendation: AdminHubOverview["recommendation"];
  if (isActive) {
    recommendation = {
      task: "liveScoring",
      eyebrow: "Tournament in progress",
      title: "Check live scoring",
      detail:
        focusTournament.syncFailureCount > 0
          ? "The latest scoring cycle reports failures. Review the normal sync before using recovery tools."
          : "Confirm the leaderboard is current. The scheduled sync normally handles this automatically.",
      actionLabel: "Open live scoring",
    };
  } else if (!focusTournament.groupsReady && !isCompleted) {
    recommendation = {
      task: "eventSetup",
      eyebrow: "Next up",
      title: "Prepare the tournament field",
      detail:
        "Refresh world rankings, then create the five golfer groups before picks need to be submitted.",
      actionLabel: "Open event setup",
    };
  } else if (picksOpen) {
    recommendation = {
      task: "weeklyRecap",
      eyebrow: "Picks are open",
      title: "Send the weekly recap",
      detail:
        "Send yourself a test, review the recipient count, then notify eligible members.",
      actionLabel: "Open weekly email",
    };
  } else if (pendingSettlementCount > 0) {
    recommendation = settlementRecommendation(pendingSettlementCount);
  } else {
    recommendation = noActionRecommendation();
  }

  return {
    eventName: focusTournament.name,
    eventMeta: formatEventMeta(
      focusTournament.startDate,
      focusTournament.endDate,
    ),
    stageLabel: stage.label,
    stageTone: stage.tone,
    readinessLabel: readiness.label,
    readinessDetail: readiness.detail,
    recommendation,
  };
}

function buildLiveReadiness(
  focusTournament: NonNullable<BuildAdminHubOverviewArgs["focusTournament"]>,
  recentLiveSync?: AdminOperationRun,
) {
  if (
    focusTournament.syncFailureCount > 0 ||
    recentLiveSync?.status === "failed"
  ) {
    return {
      label: "Scoring needs attention",
      detail:
        "The latest sync reported a failure. Open live scoring for details.",
    };
  }
  const lastSuccessAt =
    focusTournament.lastSyncSuccessAt ?? recentLiveSync?.finishedAt;
  return {
    label: lastSuccessAt ? "Scoring sync healthy" : "Waiting for first sync",
    detail: lastSuccessAt
      ? `Last successful update ${formatDateTime(lastSuccessAt)}.`
      : "The automated scoring chain starts at the tournament boundary.",
  };
}

function settlementRecommendation(
  pendingSettlementCount: number,
): AdminHubOverview["recommendation"] {
  return {
    task: "settlements",
    eyebrow: "Money to process",
    title: `${pendingSettlementCount} payout request${pendingSettlementCount === 1 ? "" : "s"} waiting`,
    detail: "Complete each real-world transfer or allocation and check it off.",
    actionLabel: "Open payout requests",
  };
}

function noActionRecommendation(): AdminHubOverview["recommendation"] {
  return {
    task: null,
    eyebrow: "You’re caught up",
    title: "No immediate admin action",
    detail:
      "Scheduled jobs will continue in the background. All tools remain available below.",
    actionLabel: null,
  };
}

function formatEventMeta(startDate: number, endDate: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  });
  const start = formatter.format(startDate);
  const end = formatter.format(endDate);
  return start === end ? start : `${start}–${end}`;
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
