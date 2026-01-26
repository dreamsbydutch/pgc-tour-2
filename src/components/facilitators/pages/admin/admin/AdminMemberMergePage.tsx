import { useMemo, useState } from "react";

import { api, useMutation, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";

import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";

import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Renders an admin-only tool for merging two member records.
 *
 * This is intended for handling the case where a user signs in with Clerk and a new member record is
 * created, but the person already had an existing member record under a different email.
 *
 * Behavior:
 * - Select a source member (the newly created record with the Clerk id) and a target member (the existing record).
 * - Shows a preview of how many documents will be reassigned.
 * - On merge, moves all `memberId` references (tourCards, transactions, push subscriptions, audit logs, friends references)
 *   from source → target, copies the Clerk id onto the target member, transfers account balance, then deletes the source.
 *
 * Data sources:
 * - `api.functions.members.getMembers` (member selectors)
 * - `api.functions.members.adminGetMemberMergePreview` (impact preview)
 * - `api.functions.members.adminMergeMembers` (execute merge)
 *
 * @returns Admin UI for merging member records.
 */
export function AdminMemberMergePage() {
  const vm = useAdminMemberMergePage();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Member Merge</CardTitle>
          <CardDescription>
            Move a Clerk identity onto an existing member and reassign all
            related records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Source member (new)</div>
              <input
                value={vm.sourceSearch}
                onChange={(e) => vm.setSourceSearch(e.target.value)}
                placeholder="Filter…"
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              />
              <select
                value={vm.sourceMemberId ?? ""}
                onChange={(e) =>
                  vm.setSourceMemberId(
                    (e.target.value || null) as Id<"members"> | null,
                  )
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              >
                <option value="">Select source member…</option>
                {vm.sourceOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {vm.sourceSelected ? (
                <div className="rounded-md border bg-muted p-3 text-xs">
                  <div>
                    <span className="font-medium">ID:</span>{" "}
                    {vm.sourceSelected._id}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span>{" "}
                    {vm.sourceSelected.email}
                  </div>
                  <div>
                    <span className="font-medium">Clerk:</span>{" "}
                    {vm.sourceSelected.clerkId ?? "—"}
                  </div>
                  <div>
                    <span className="font-medium">Account:</span>{" "}
                    {vm.sourceSelected.account}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">
                Target member (existing)
              </div>
              <input
                value={vm.targetSearch}
                onChange={(e) => vm.setTargetSearch(e.target.value)}
                placeholder="Filter…"
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              />
              <select
                value={vm.targetMemberId ?? ""}
                onChange={(e) =>
                  vm.setTargetMemberId(
                    (e.target.value || null) as Id<"members"> | null,
                  )
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              >
                <option value="">Select target member…</option>
                {vm.targetOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {vm.targetSelected ? (
                <div className="rounded-md border bg-muted p-3 text-xs">
                  <div>
                    <span className="font-medium">ID:</span>{" "}
                    {vm.targetSelected._id}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span>{" "}
                    {vm.targetSelected.email}
                  </div>
                  <div>
                    <span className="font-medium">Clerk:</span>{" "}
                    {vm.targetSelected.clerkId ?? "—"}
                  </div>
                  <div>
                    <span className="font-medium">Account:</span>{" "}
                    {vm.targetSelected.account}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
            This action reassigns all records from source → target and deletes
            the source member.
          </div>

          {vm.preview ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Preview</div>
              {vm.previewWarnings.length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="font-medium">Warnings</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {vm.previewWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(vm.preview, null, 2)}
              </pre>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vm.overwriteTargetClerkId}
                onChange={(e) => vm.setOverwriteTargetClerkId(e.target.checked)}
              />
              Overwrite target clerkId (dangerous)
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vm.confirm}
                onChange={(e) => vm.setConfirm(e.target.checked)}
              />
              Confirm merge
            </label>

            <Button
              type="button"
              disabled={!vm.canMerge}
              onClick={() => vm.merge()}
            >
              {vm.isMerging ? "Merging…" : "Merge members"}
            </Button>
          </div>

          {vm.result ? (
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(vm.result, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hook backing `AdminMemberMergePage`.
 *
 * Fetches members for selection, computes a merge preview, and executes the merge mutation.
 *
 * @returns View-model state for rendering and actions.
 */
function useAdminMemberMergePage() {
  const membersResult = useQuery(api.functions.members.getMembers, {
    options: {
      pagination: { limit: 500 },
      sort: { sortBy: "email", sortOrder: "asc" },
    },
  });

  const members = useMemo(() => {
    const list = Array.isArray(membersResult)
      ? membersResult
      : membersResult &&
          typeof membersResult === "object" &&
          "members" in membersResult
        ? (membersResult as { members?: unknown }).members
        : undefined;

    return Array.isArray(list) ? (list as Doc<"members">[]) : [];
  }, [membersResult]);

  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [sourceMemberId, setSourceMemberId] = useState<Id<"members"> | null>(
    null,
  );
  const [targetMemberId, setTargetMemberId] = useState<Id<"members"> | null>(
    null,
  );
  const [confirm, setConfirm] = useState(false);
  const [overwriteTargetClerkId, setOverwriteTargetClerkId] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const preview = useQuery(
    api.functions.members.adminGetMemberMergePreview,
    sourceMemberId
      ? { sourceMemberId, ...(targetMemberId ? { targetMemberId } : {}) }
      : "skip",
  );

  const mergeMutation = useMutation(api.functions.members.adminMergeMembers);

  const sourceSelected =
    sourceMemberId && members.length > 0
      ? (members.find((m) => m._id === sourceMemberId) ?? null)
      : null;
  const targetSelected =
    targetMemberId && members.length > 0
      ? (members.find((m) => m._id === targetMemberId) ?? null)
      : null;

  const sourceOptions = useMemo(() => {
    const needle = sourceSearch.trim().toLowerCase();
    const filtered = needle
      ? members.filter((m) => {
          const name = `${m.firstname ?? ""} ${m.lastname ?? ""}`
            .trim()
            .replace(/\s+/g, " ");
          const label = `${m.email} ${name} ${String(m._id)}`.toLowerCase();
          return label.includes(needle);
        })
      : members;

    return filtered.slice(0, 200).map((m) => ({
      _id: m._id,
      label: `${`${m.firstname ?? ""} ${m.lastname ?? ""}`
        .trim()
        .replace(/\s+/g, " ")} ${m.email} (${String(m._id).slice(-6)})`,
    }));
  }, [members, sourceSearch]);

  const targetOptions = useMemo(() => {
    const needle = targetSearch.trim().toLowerCase();
    const filtered = needle
      ? members.filter((m) => {
          const name = `${m.firstname ?? ""} ${m.lastname ?? ""}`
            .trim()
            .replace(/\s+/g, " ");
          const label = `${m.email} ${name} ${String(m._id)}`.toLowerCase();
          return label.includes(needle);
        })
      : members;

    return filtered.slice(0, 200).map((m) => ({
      _id: m._id,
      label: `${`${m.firstname ?? ""} ${m.lastname ?? ""}`
        .trim()
        .replace(/\s+/g, " ")} ${m.email} (${String(m._id).slice(-6)})`,
    }));
  }, [members, targetSearch]);

  const previewWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (!preview || typeof preview !== "object" || !("warnings" in preview)) {
      return warnings;
    }

    const w = (preview as { warnings?: unknown }).warnings;
    const warningsObj =
      w && typeof w === "object" ? (w as Record<string, unknown>) : {};

    if (warningsObj.sourceMissingClerkId === true) {
      warnings.push("Source member has no clerkId; merge will fail.");
    }
    if (warningsObj.clerkIdAlsoOnDifferentMember === true) {
      warnings.push("Source clerkId is already on a different member.");
    }
    if (warningsObj.targetAlreadyHasDifferentClerkId === true) {
      warnings.push(
        "Target member has a different clerkId (enable overwrite if you really mean it).",
      );
    }

    return warnings;
  }, [preview]);

  const canMerge =
    !!sourceMemberId &&
    !!targetMemberId &&
    sourceMemberId !== targetMemberId &&
    confirm &&
    !isMerging;

  async function merge() {
    if (!sourceMemberId || !targetMemberId) return;

    setIsMerging(true);
    try {
      const res = await mergeMutation({
        sourceMemberId,
        targetMemberId,
        options: overwriteTargetClerkId ? { overwriteTargetClerkId: true } : {},
      });
      setResult(res);
      setConfirm(false);
      setSourceMemberId(null);
      setTargetMemberId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, error: message });
    } finally {
      setIsMerging(false);
    }
  }

  return {
    members,
    sourceSearch,
    setSourceSearch,
    targetSearch,
    setTargetSearch,
    sourceMemberId,
    setSourceMemberId,
    targetMemberId,
    setTargetMemberId,
    sourceSelected,
    targetSelected,
    sourceOptions,
    targetOptions,
    preview:
      preview &&
      typeof preview === "object" &&
      "ok" in preview &&
      (preview as { ok?: unknown }).ok === true
        ? preview
        : null,
    previewWarnings,
    confirm,
    setConfirm,
    overwriteTargetClerkId,
    setOverwriteTargetClerkId,
    canMerge,
    isMerging,
    merge,
    result,
  };
}
