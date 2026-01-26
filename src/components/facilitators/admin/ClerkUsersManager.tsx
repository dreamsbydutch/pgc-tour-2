import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useConvex } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";

import { api } from "@/convex";
import type { Id } from "@/convex";

import { AdminDataTable, AdminRowActions } from "@/displays";
import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";
import { FormFeedback, Skeleton } from "@/ui";

import type { AdminDataTableColumn } from "@/lib/types";
import { adminActionsColumn } from "@/lib/adminTable";

/**
 * Admin UI for finding Clerk users that are not linked to a `members` row.
 *
 * Data sources:
 * - Convex action `clerk.listClerkUsers` for fetching Clerk user pages.
 * - Convex query `members.listMembersForClerkLinking` for fetching all members.
 * - Convex mutations to link a member to a Clerk user, or to create+link a member.
 *
 * Major render states:
 * - Loading: renders an internal skeleton while initial member data is being fetched.
 * - Ready: renders a refresh/load button, status messages, and a table of unlinked users.
 *
 * @returns Clerk user linking UI.
 */
export function ClerkUsersManager() {
  const model = useClerkUsersManager();

  if (model.status === "loading") return <ClerkUsersManagerSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlinked Clerk users</CardTitle>
        <CardDescription>
          Shows Clerk users that do not have a matching `members.clerkId`.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={model.refresh}
            disabled={model.loading}
          >
            {model.loading ? "Loading…" : model.clerkUsers ? "Refresh" : "Load"}
          </Button>
        </div>

        <FormFeedback error={model.error} success={model.success} />

        {model.clerkUsers && model.unlinked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All Clerk users in this page are linked.
          </p>
        ) : null}

        {model.clerkUsers ? (
          <div className="overflow-x-auto">
            <AdminDataTable
              rows={model.unlinked}
              columns={model.columns}
              emptyMessage="All Clerk users in this page are linked."
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Fetches and manages state for `ClerkUsersManager`.
 *
 * @returns View-model used by the UI to render rows and perform link/create actions.
 */
function useClerkUsersManager() {
  type ClerkUserRow = {
    clerkId: string;
    email: string | null;
    fullName: string;
  };

  type MemberForLinking = {
    _id: Id<"members">;
    clerkId?: string;
    email: string;
    firstname?: string;
    lastname?: string;
    role: string;
  };

  type UnlinkedRow = {
    _id: string;
    clerkId: string;
    fullName: string;
    email: string | null;
    suggestedMemberId: Id<"members"> | null;
    suggestedMemberEmail: string | null;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        clerkUsers: ClerkUserRow[] | null;
        unlinked: UnlinkedRow[];
        columns: Array<AdminDataTableColumn<UnlinkedRow>>;
        loading: boolean;
        error: string | null;
        success: string | null;
        refresh: () => Promise<void>;
      };

  const { user } = useUser();
  const convex = useConvex();

  const listClerkUsers = useAction(api.functions.members.listClerkUsers);
  const linkMember = useMutation(
    api.functions.members.adminLinkMemberToClerkUser,
  );
  const createMember = useMutation(
    api.functions.members.adminCreateMemberForClerkUser,
  );

  const [allMembers, setAllMembers] = useState<MemberForLinking[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [clerkUsers, setClerkUsers] = useState<ClerkUserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllMembers() {
      setMembersLoading(true);
      const accumulated: MemberForLinking[] = [];
      let cursor: string | null = null;

      try {
        while (true) {
          if (cancelled) break;

          const result: {
            members: MemberForLinking[];
            continueCursor: string | null;
            isDone: boolean;
          } = await convex.query(
            api.functions.members.listMembersForClerkLinking,
            cursor ? { cursor } : {},
          );

          accumulated.push(...result.members);

          if (result.isDone) break;
          cursor = result.continueCursor ?? null;
        }

        if (!cancelled) {
          setAllMembers(accumulated);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching all members:", err);
        }
      } finally {
        if (!cancelled) {
          setMembersLoading(false);
        }
      }
    }

    void fetchAllMembers();

    return () => {
      cancelled = true;
    };
  }, [convex]);

  const unlinked = useMemo<UnlinkedRow[]>(() => {
    if (!clerkUsers) return [];
    if (allMembers.length === 0 && membersLoading) return [];

    const linkedClerkIds = new Set<string>();
    const unlinkedMemberByEmail = new Map<
      string,
      { id: Id<"members">; email: string }
    >();

    for (const m of allMembers) {
      if (m.clerkId) linkedClerkIds.add(m.clerkId);
      else if (m.email) {
        unlinkedMemberByEmail.set(m.email.toLowerCase(), {
          id: m._id,
          email: m.email,
        });
      }
    }

    return clerkUsers
      .filter((u) => !linkedClerkIds.has(u.clerkId))
      .map((u) => {
        const key = u.email ? u.email.toLowerCase() : null;
        const suggested = key ? (unlinkedMemberByEmail.get(key) ?? null) : null;
        return {
          _id: u.clerkId,
          clerkId: u.clerkId,
          fullName: u.fullName,
          email: u.email,
          suggestedMemberId: suggested?.id ?? null,
          suggestedMemberEmail: suggested?.email ?? null,
        };
      });
  }, [clerkUsers, allMembers, membersLoading]);

  const refresh = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const result = await listClerkUsers(
        user?.id
          ? { clerkId: user.id, options: { limit: 200, offset: 0 } }
          : { options: { limit: 200, offset: 0 } },
      );
      setClerkUsers(result?.users ?? []);

      setMembersLoading(true);
      const accumulated: MemberForLinking[] = [];
      let cursor: string | null = null;

      while (true) {
        const memberResult = (await convex.query(
          api.functions.members.listMembersForClerkLinking,
          cursor ? { cursor } : {},
        )) as {
          members: MemberForLinking[];
          continueCursor: string | null;
          isDone: boolean;
        };

        accumulated.push(...memberResult.members);

        if (memberResult.isDone) break;
        cursor = memberResult.continueCursor ?? null;
      }

      setAllMembers(accumulated);
      setMembersLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch Clerk users",
      );
      setMembersLoading(false);
    } finally {
      setLoading(false);
    }
  }, [convex, listClerkUsers, user?.id]);

  const onCreateMember = useCallback(
    async (row: UnlinkedRow) => {
      setError(null);
      setSuccess(null);

      if (!row.email) {
        setError("Cannot create member: Clerk user has no email.");
        return;
      }

      setLoading(true);
      try {
        await createMember({
          adminClerkId: user?.id,
          clerkId: row.clerkId,
          email: row.email,
        });
        setSuccess("Member created and linked.");
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create member",
        );
      } finally {
        setLoading(false);
      }
    },
    [createMember, refresh, user?.id],
  );

  const onLinkSuggested = useCallback(
    async (row: UnlinkedRow) => {
      setError(null);
      setSuccess(null);

      if (!row.suggestedMemberId) {
        setError("No suggested member to link.");
        return;
      }

      setLoading(true);
      try {
        await linkMember({
          adminClerkId: user?.id,
          memberId: row.suggestedMemberId,
          clerkId: row.clerkId,
        });
        setSuccess("Linked Clerk user to existing member.");
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link member");
      } finally {
        setLoading(false);
      }
    },
    [linkMember, refresh, user?.id],
  );

  const columns = useMemo<Array<AdminDataTableColumn<UnlinkedRow>>>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => <span className="font-medium">{row.fullName}</span>,
      },
      {
        id: "email",
        header: "Email",
        cell: (row) => row.email ?? "—",
      },
      {
        id: "clerkId",
        header: "Clerk ID",
        cellClassName: "max-w-[260px] truncate",
        cell: (row) => row.clerkId,
      },
      {
        id: "suggested",
        header: "Suggested member",
        cell: (row) =>
          row.suggestedMemberId
            ? `${row.suggestedMemberEmail ?? "(member)"}`
            : "—",
      },
      adminActionsColumn(
        (row) => (
          <AdminRowActions
            actions={[
              ...(row.suggestedMemberId
                ? ([
                    {
                      id: "linkSuggested",
                      label: "Link suggested",
                      type: "button",
                      variant: "outline",
                      size: "sm",
                      onClick: () => {
                        void onLinkSuggested(row);
                      },
                      disabled: loading,
                    },
                  ] as const)
                : []),
              {
                id: "createMember",
                label: "Create member",
                type: "button",
                size: "sm",
                onClick: () => {
                  void onCreateMember(row);
                },
                disabled: loading || !row.email,
              },
            ]}
          />
        ),
        {
          header: <span className="block text-right">Actions</span>,
          cellClassName: "text-right",
        },
      ),
    ],
    [loading, onCreateMember, onLinkSuggested],
  );

  const isStillLoading =
    membersLoading && allMembers.length === 0 && !clerkUsers;
  if (isStillLoading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    clerkUsers,
    unlinked,
    columns,
    loading,
    error,
    success,
    refresh,
  } as const satisfies Model;
}

/**
 * Loading UI for `ClerkUsersManager`.
 */
function ClerkUsersManagerSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-[520px] max-w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
