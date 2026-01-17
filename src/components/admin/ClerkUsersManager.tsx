import { useMemo, useState, useEffect, useCallback } from "react";
import { useAction, useMutation, useConvex } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/components/admin/AdminDataTable";

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

export function ClerkUsersManager() {
  const { user } = useUser();
  const convex = useConvex();

  const listClerkUsers = useAction(api.functions.clerk.listClerkUsers);
  const linkMember = useMutation(
    api.functions.members.adminLinkMemberToClerkUser,
  );
  const createMember = useMutation(
    api.functions.members.adminCreateMemberForClerkUser,
  );

  const [allMembers, setAllMembers] = useState<MemberForLinking[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [clerkUsers, setClerkUsers] = useState<Array<{
    clerkId: string;
    email: string | null;
    fullName: string;
  }> | null>(null);
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

    fetchAllMembers();

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
      else if (m.email)
        unlinkedMemberByEmail.set(m.email.toLowerCase(), {
          id: m._id,
          email: m.email,
        });
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
      {
        id: "actions",
        header: <span className="block text-right">Actions</span>,
        cellClassName: "text-right",
        cell: (row) => (
          <div className="flex justify-end gap-2">
            {row.suggestedMemberId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLinkSuggested(row)}
                disabled={loading}
              >
                Link suggested
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => onCreateMember(row)}
              disabled={loading || !row.email}
            >
              Create member
            </Button>
          </div>
        ),
      },
    ],
    [loading, onCreateMember, onLinkSuggested],
  );

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
          <Button type="button" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : clerkUsers ? "Refresh" : "Load"}
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        {clerkUsers && unlinked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All Clerk users in this page are linked.
          </p>
        ) : null}

        {clerkUsers ? (
          <div className="overflow-x-auto">
            <AdminDataTable
              rows={unlinked}
              columns={columns}
              emptyMessage="All Clerk users in this page are linked."
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
