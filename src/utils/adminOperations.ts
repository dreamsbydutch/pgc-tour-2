import type {
  AdminBulkEmailPreviewArgs,
  AdminDryRunPreview,
  AdminImportPreviewArgs,
  AdminImportRow,
  AdminOperationRun,
  AdminOperationStatus,
  AdminPaymentPreviewArgs,
  AdminRepairPreviewArgs,
} from "@/types";

export function buildImportTeamsPreview(
  args: AdminImportPreviewArgs,
): AdminDryRunPreview {
  const warnings: string[] = [];
  const lines = [
    {
      label: "Target tournament",
      value: args.tournamentName || args.tournamentId.trim() || "Not selected",
    },
  ];

  if (!args.tournamentId.trim()) {
    warnings.push("Select a tournament before previewing the import.");
  }

  if (!args.teamsJson.trim()) {
    warnings.push("Paste a JSON array of teams to generate a preview.");
    return {
      title: "Preview: team import",
      description: "Nothing will be written until you confirm the import.",
      lines: [...lines, { label: "Rows", value: "0" }],
      warnings,
      canRun: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(args.teamsJson);
  } catch {
    warnings.push("The team data is not valid JSON.");
    return {
      title: "Preview: team import",
      description: "Nothing will be written until you confirm the import.",
      lines: [...lines, { label: "Rows", value: "Unable to parse" }],
      warnings,
      canRun: false,
    };
  }

  if (!Array.isArray(parsed)) {
    warnings.push("The top-level JSON value must be an array.");
    return {
      title: "Preview: team import",
      description: "Nothing will be written until you confirm the import.",
      lines: [...lines, { label: "Rows", value: "0" }],
      warnings,
      canRun: false,
    };
  }

  const rows = parsed.filter(
    (row): row is AdminImportRow => Boolean(row) && typeof row === "object",
  );
  const validRows = rows.filter((row) => {
    const golferIds = Array.isArray(row.golferIds)
      ? row.golferIds.filter((value) => typeof value === "number")
      : [];
    return (
      typeof row.tourCardId === "string" &&
      row.tourCardId.trim().length > 0 &&
      golferIds.length > 0
    );
  });
  const invalidRows = parsed.length - validRows.length;
  const scoredRows = validRows.filter(
    (row) => typeof row.score === "number",
  ).length;
  const positionedRows = validRows.filter(
    (row) => typeof row.position === "string",
  ).length;

  lines.push(
    { label: "Rows to import", value: String(validRows.length) },
    { label: "Rows with scores", value: String(scoredRows) },
    { label: "Rows with positions", value: String(positionedRows) },
  );

  if (invalidRows > 0) {
    warnings.push(
      `${invalidRows} row${invalidRows === 1 ? " is" : "s are"} missing a tourCardId or golferIds.`,
    );
  }
  if (validRows.length === 0) {
    warnings.push("No importable team rows were found.");
  }

  return {
    title: "Preview: team import",
    description:
      "Existing teams for matching tour cards will be updated; other rows will create teams.",
    lines,
    warnings,
    canRun:
      Boolean(args.tournamentId.trim()) &&
      validRows.length > 0 &&
      invalidRows === 0,
  };
}

export function buildPaymentPreview(
  args: AdminPaymentPreviewArgs,
): AdminDryRunPreview {
  const amountCents = Math.round(Number(args.amountDollars) * 100);
  const amountIsValid = Number.isSafeInteger(amountCents) && amountCents !== 0;
  const warnings: string[] = [];

  if (!args.memberName)
    warnings.push("Select the member receiving the payment.");
  if (!args.seasonName) warnings.push("Select the season for this payment.");
  if (!amountIsValid) warnings.push("Enter a non-zero dollar amount.");

  const lines = [
    { label: "Member", value: args.memberName ?? "Not selected" },
    { label: "Season", value: args.seasonName ?? "Not selected" },
    {
      label: "Payment",
      value: amountIsValid ? formatCurrency(amountCents) : "Invalid amount",
    },
  ];

  if (args.currentBalanceCents !== undefined && amountIsValid) {
    lines.push(
      {
        label: "Current balance",
        value: formatCurrency(args.currentBalanceCents),
      },
      {
        label: "Balance after payment",
        value: formatCurrency(args.currentBalanceCents + amountCents),
      },
    );
  }

  return {
    title: "Preview: payment result",
    description:
      "This preview shows the completed transaction and account balance change that will be recorded.",
    lines,
    warnings,
    canRun: Boolean(args.memberName && args.seasonName && amountIsValid),
  };
}

export function buildRepairPreview(
  args: AdminRepairPreviewArgs,
): AdminDryRunPreview {
  const warnings = args.tournamentName
    ? []
    : ["Select a tournament to preview the repair."];
  return {
    title: "Preview: tournament repair",
    description:
      "The repair will resync tournament results, recalculate team awards, and recompute affected standings.",
    lines: [
      { label: "Tournament", value: args.tournamentName ?? "Not selected" },
      { label: "Current status", value: args.tournamentStatus ?? "Unknown" },
      {
        label: "Tournament date",
        value: args.tournamentStartDate
          ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(
              args.tournamentStartDate,
            )
          : "Unknown",
      },
      { label: "Downstream work", value: "Scores, awards, standings" },
    ],
    warnings,
    canRun: Boolean(args.tournamentName),
  };
}

export function buildBulkEmailPreview(
  args: AdminBulkEmailPreviewArgs,
): AdminDryRunPreview {
  const warnings: string[] = [];
  if (!args.tournamentName) {
    warnings.push("There is no upcoming tournament for the weekly recap.");
  }
  if (args.recipientCount === undefined) {
    warnings.push("Recipient information is still loading.");
  } else if (args.recipientCount === 0) {
    warnings.push("No eligible recipients were found.");
  }

  return {
    title: "Preview: email recipients",
    description:
      "Recipients are deduplicated active members with a tour card in the upcoming tournament's season.",
    lines: [
      { label: "Tournament", value: args.tournamentName ?? "Not available" },
      {
        label: "Recipients",
        value:
          args.recipientCount === undefined
            ? "Loading"
            : String(args.recipientCount),
      },
      {
        label: "Custom message",
        value: args.customBlurb.trim()
          ? `${args.customBlurb.trim().length} characters`
          : "No custom message",
      },
    ],
    warnings,
    canRun: Boolean(
      args.tournamentName &&
        args.recipientCount !== undefined &&
        args.recipientCount > 0,
    ),
  };
}

export function toAdminOperationStatus(
  run?: AdminOperationRun,
): AdminOperationStatus {
  if (!run) {
    return {
      isBusy: false,
      statusLabel: "Ready",
      lastRunLabel: "Not run in this session",
      tone: "idle",
    };
  }

  if (run.status === "running") {
    return {
      isBusy: true,
      statusLabel: "Running",
      lastRunLabel: `Started ${formatDateTime(run.startedAt)}`,
      result: run.result,
      tone: "running",
    };
  }

  const finishedAt = run.finishedAt ?? run.startedAt;
  const duration = Math.max(0, finishedAt - run.startedAt);
  return {
    isBusy: false,
    statusLabel: run.status === "succeeded" ? "Completed" : "Failed",
    lastRunLabel: `${formatDateTime(finishedAt)} · ${formatDuration(duration)}`,
    result: run.result,
    tone: run.status === "succeeded" ? "success" : "error",
  };
}

export function toLatestAdminOperationStatus(
  runs: Array<AdminOperationRun | undefined>,
): AdminOperationStatus {
  const latestRun = runs
    .filter((run): run is AdminOperationRun => Boolean(run))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  return toAdminOperationStatus(latestRun);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round(
    (durationMs % 60_000) / 1_000,
  )}s`;
}
