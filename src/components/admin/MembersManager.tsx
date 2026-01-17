import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MemberDoc } from "../../../convex/types/types";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Field, formatCentsAsDollars, normalizeList } from "./shared";

type MemberFormState = {
  memberId: Id<"members"> | "";
  clerkId: string;
  email: string;
  firstname: string;
  lastname: string;
  displayName: string;
  role: "admin" | "moderator" | "regular" | "";
  accountCents: string;
};

function capitalizeWord(value: string): string {
  if (!value) return "";
  return value[0].toUpperCase() + value.slice(1);
}

function formatMemberDisplayName(
  firstname?: string,
  lastname?: string,
  fallbackEmail?: string,
): string {
  const first = (firstname ?? "").trim();
  const last = (lastname ?? "").trim();

  if (first && last) {
    return `${first[0].toUpperCase()}. ${capitalizeWord(last)}`;
  }

  if (last) {
    return capitalizeWord(last);
  }

  if (first) {
    return `${first[0].toUpperCase()}.`;
  }

  return fallbackEmail ?? "";
}

export function MembersManager() {
  const createMember = useMutation(api.functions.members.createMembers);
  const updateMember = useMutation(api.functions.members.updateMembers);
  const deleteMember = useMutation(api.functions.members.deleteMembers);

  const membersResult = useQuery(api.functions.members.getMembers, {
    options: {
      pagination: { limit: 500 },
      sort: { sortBy: "lastname", sortOrder: "asc" },
    },
  });

  const members = useMemo(() => {
    return normalizeList<MemberDoc, "members">(
      membersResult as unknown,
      "members",
    );
  }, [membersResult]);

  const [searchTerm, setSearchTerm] = useState("");
  const filteredMembers = useMemo(() => {
    if (!searchTerm.trim()) return members;
    const term = searchTerm.toLowerCase();
    return members.filter((member) => {
      const email = member.email?.toLowerCase() ?? "";
      const first = member.firstname?.toLowerCase() ?? "";
      const last = member.lastname?.toLowerCase() ?? "";
      const display = formatMemberDisplayName(
        member.firstname,
        member.lastname,
        member.email,
      )
        .toLowerCase()
        .trim();
      const clerk = member.clerkId?.toLowerCase() ?? "";
      return (
        email.includes(term) ||
        first.includes(term) ||
        last.includes(term) ||
        display.includes(term) ||
        clerk.includes(term)
      );
    });
  }, [members, searchTerm]);

  const [form, setForm] = useState<MemberFormState>({
    memberId: "",
    clerkId: "",
    email: "",
    firstname: "",
    lastname: "",
    displayName: formatMemberDisplayName("", "", ""),
    role: "",
    accountCents: "0",
  });
  const isEditing = Boolean(form.memberId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof MemberFormState>(
    key: K,
    value: MemberFormState[K],
  ) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      } as MemberFormState;

      if (key === "firstname" || key === "lastname" || key === "email") {
        next.displayName = formatMemberDisplayName(
          next.firstname,
          next.lastname,
          next.email,
        );
      }

      return next;
    });
  }

  function resetForm() {
    setForm({
      memberId: "",
      clerkId: "",
      email: "",
      firstname: "",
      lastname: "",
      displayName: formatMemberDisplayName("", "", ""),
      role: "",
      accountCents: "0",
    });
    setError(null);
    setSuccess(null);
  }

  function loadMember(member: MemberDoc) {
    const derivedDisplay = formatMemberDisplayName(
      member.firstname,
      member.lastname,
      member.email,
    );
    setForm({
      memberId: member._id,
      clerkId: member.clerkId ?? "",
      email: member.email ?? "",
      firstname: member.firstname ?? "",
      lastname: member.lastname ?? "",
      displayName: derivedDisplay,
      role: (member.role ?? "regular") as MemberFormState["role"],
      accountCents: `${member.account ?? 0}`,
    });
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const email = form.email.trim();
    if (!email) {
      setError("Email is required.");
      return;
    }

    if (!isEditing && !form.clerkId.trim()) {
      setError("Clerk ID is required to create a member.");
      return;
    }

    const accountRaw = Number(form.accountCents || "0");
    if (!Number.isFinite(accountRaw)) {
      setError("Account balance must be a number of cents.");
      return;
    }
    const account = Math.trunc(accountRaw);

    const firstname = form.firstname.trim();
    const lastname = form.lastname.trim();
    const derivedDisplayName = formatMemberDisplayName(
      firstname,
      lastname,
      email,
    );

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateMember({
          memberId: form.memberId as Id<"members">,
          data: {
            email,
            ...(firstname ? { firstname } : { firstname: "" }),
            ...(lastname ? { lastname } : { lastname: "" }),
            displayName: derivedDisplayName,
            ...(form.role
              ? { role: form.role as Exclude<MemberFormState["role"], ""> }
              : {}),
            account,
          },
        });
        setSuccess("Member updated.");
      } else {
        await createMember({
          data: {
            clerkId: form.clerkId.trim(),
            email,
            ...(firstname ? { firstname } : {}),
            ...(lastname ? { lastname } : {}),
            displayName: derivedDisplayName,
            ...(form.role
              ? { role: form.role as Exclude<MemberFormState["role"], ""> }
              : {}),
            account,
          },
          options: {
            setActive: true,
          },
        });
        setSuccess("Member created.");
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save member.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(member: MemberDoc) {
    const derivedDisplay = formatMemberDisplayName(
      member.firstname,
      member.lastname,
      member.email,
    );
    const confirmed = window.confirm(
      `Delete member ${derivedDisplay || member.email}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteMember({
        memberId: member._id,
        options: { cascadeDelete: false },
      });
      setSuccess("Member deleted.");
      if (form.memberId === member._id) {
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Update Member" : "Create Member"}</CardTitle>
          <CardDescription>
            Manage core profile details, roles, and balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clerk ID">
                <input
                  value={form.clerkId}
                  onChange={(e) => updateField("clerkId", e.target.value)}
                  disabled={submitting || isEditing}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="user_123..."
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="First name">
                <input
                  value={form.firstname}
                  onChange={(e) => updateField("firstname", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Last name">
                <input
                  value={form.lastname}
                  onChange={(e) => updateField("lastname", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Display name (optional)">
                <input
                  value={form.displayName}
                  readOnly
                  disabled
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from first and last name.
                </p>
              </Field>

              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) =>
                    updateField(
                      "role",
                      e.target.value as MemberFormState["role"],
                    )
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Use default (regular)</option>
                  <option value="regular">regular</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </Field>

              <Field label="Account balance (cents)">
                <input
                  value={form.accountCents}
                  onChange={(e) => updateField("accountCents", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving…"
                  : isEditing
                    ? "Update Member"
                    : "Create Member"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                {isEditing ? "Cancel" : "Reset"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Search, edit, or remove members.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Field label="Search">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Search by name, email, or Clerk ID"
              />
            </Field>
          </div>

          <AdminDataTable<MemberDoc>
            rows={filteredMembers}
            emptyMessage="No members match your search."
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (member) =>
                  formatMemberDisplayName(
                    member.firstname,
                    member.lastname,
                    member.email,
                  ),
              },
              {
                id: "email",
                header: "Email",
                cell: (member) => member.email,
              },
              {
                id: "role",
                header: "Role",
                cell: (member) => member.role ?? "regular",
              },
              {
                id: "balance",
                header: "Balance",
                cell: (member) => formatCentsAsDollars(member.account ?? 0),
              },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (member) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadMember(member)}
                      disabled={submitting}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void onDelete(member)}
                      disabled={submitting}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
