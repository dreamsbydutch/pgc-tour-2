import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MemberDoc } from "../../../convex/types/types";
import { AdminEditDeleteActions } from "@/components/ui/admin-edit-delete-actions";
import { AdminCrudSection } from "@/components/internal/AdminCrudSection";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { Field } from "@/components/internal/AdminField";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { formatCentsAsDollars, normalizeList } from "@/lib/utils";
import { adminActionsColumn } from "@/lib/adminTable";

/**
 * Admin UI for managing members.
 *
 * Data sources:
 * - Convex query for members.
 * - Convex mutations for create/update/delete.
 *
 * Major render states:
 * - Loading: shows a skeleton until the members list is available.
 * - Ready: shows a create/update form plus a searchable members table.
 *
 * @returns Members management UI.
 */
export function MembersManager() {
  const model = useMembersManager();

  if (model.status === "loading") return <MembersManagerSkeleton />;

  return (
    <AdminCrudSection<MemberDoc>
      formTitle={model.isEditing ? "Update Member" : "Create Member"}
      formDescription="Manage core profile details, roles, and balances."
      formFields={
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Clerk ID">
            <input
              value={model.form.clerkId}
              onChange={(e) => model.updateField("clerkId", e.target.value)}
              disabled={model.submitting || model.isEditing}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="user_123..."
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={model.form.email}
              onChange={(e) => model.updateField("email", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="First name">
            <input
              value={model.form.firstname}
              onChange={(e) => model.updateField("firstname", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Last name">
            <input
              value={model.form.lastname}
              onChange={(e) => model.updateField("lastname", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>

          <Field label="Display name (optional)">
            <input
              value={model.form.displayName}
              readOnly
              disabled
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from first and last name.
            </p>
          </Field>

          <Field label="Role">
            <select
              value={model.form.role}
              onChange={(e) =>
                model.updateField(
                  "role",
                  e.target.value as typeof model.form.role,
                )
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">Use default (regular)</option>
              <option value="regular">regular</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
          </Field>

          <Field label="Account balance (cents)">
            <input
              value={model.form.accountCents}
              onChange={(e) =>
                model.updateField("accountCents", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              inputMode="numeric"
            />
          </Field>
        </div>
      }
      formError={model.error}
      formSuccess={model.success}
      submitting={model.submitting}
      primaryActionLabel={
        model.submitting
          ? "Saving…"
          : model.isEditing
            ? "Update Member"
            : "Create Member"
      }
      secondaryActionLabel={model.isEditing ? "Cancel" : "Reset"}
      onSecondaryAction={model.resetForm}
      onSubmit={model.onSubmit}
      tableTitle="Members"
      tableDescription="Search, edit, or remove members."
      tableControls={
        <Field label="Search">
          <input
            value={model.searchTerm}
            onChange={(e) => model.setSearchTerm(e.target.value)}
            className={ADMIN_FORM_CONTROL_CLASSNAME}
            placeholder="Search by name, email, or Clerk ID"
          />
        </Field>
      }
      tableRows={model.filteredMembers}
      tableEmptyMessage="No members match your search."
      tableColumns={[
        {
          id: "name",
          header: "Name",
          cell: (member) =>
            model.formatMemberDisplayName(
              member.firstname,
              member.lastname,
              member.email,
            ),
        },
        { id: "email", header: "Email", cell: (member) => member.email },
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
        adminActionsColumn((member) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadMember(member)}
            onDelete={() => void model.onDelete(member)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Fetches and manages create/update/delete state for `MembersManager`.
 *
 * @returns View-model used by the UI to render and to perform mutations.
 */
function useMembersManager() {
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

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        members: MemberDoc[];
        searchTerm: string;
        setSearchTerm: (next: string) => void;
        filteredMembers: MemberDoc[];
        form: MemberFormState;
        isEditing: boolean;
        submitting: boolean;
        error: string | null;
        success: string | null;
        updateField: <K extends keyof MemberFormState>(
          key: K,
          value: MemberFormState[K],
        ) => void;
        resetForm: () => void;
        loadMember: (member: MemberDoc) => void;
        onSubmit: (e: FormEvent) => Promise<void>;
        onDelete: (member: MemberDoc) => Promise<void>;
        formatMemberDisplayName: (
          firstname?: string,
          lastname?: string,
          fallbackEmail?: string,
        ) => string;
      };

  const capitalizeWord = (value: string): string => {
    if (!value) return "";
    return value[0].toUpperCase() + value.slice(1);
  };

  const formatMemberDisplayName = (
    firstname?: string,
    lastname?: string,
    fallbackEmail?: string,
  ): string => {
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
  };

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

  const emptyDisplayName = formatMemberDisplayName("", "", "");

  const [form, setForm] = useState<MemberFormState>({
    memberId: "",
    clerkId: "",
    email: "",
    firstname: "",
    lastname: "",
    displayName: emptyDisplayName,
    role: "",
    accountCents: "0",
  });
  const isEditing = Boolean(form.memberId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = <K extends keyof MemberFormState>(
    key: K,
    value: MemberFormState[K],
  ) => {
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
  };

  const resetForm = () => {
    setForm({
      memberId: "",
      clerkId: "",
      email: "",
      firstname: "",
      lastname: "",
      displayName: emptyDisplayName,
      role: "",
      accountCents: "0",
    });
    setError(null);
    setSuccess(null);
  };

  const loadMember = (member: MemberDoc) => {
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
  };

  const onSubmit = async (e: FormEvent) => {
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
  };

  const onDelete = async (member: MemberDoc) => {
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
  };

  const isStillLoading = membersResult === undefined;
  if (isStillLoading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    members,
    searchTerm,
    setSearchTerm,
    filteredMembers,
    form,
    isEditing,
    submitting,
    error,
    success,
    updateField,
    resetForm,
    loadMember,
    onSubmit,
    onDelete,
    formatMemberDisplayName,
  } as const satisfies Model;
}

/**
 * Loading UI for `MembersManager`.
 */
function MembersManagerSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
