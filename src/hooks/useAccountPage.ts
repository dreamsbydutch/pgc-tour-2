import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useEffect, useMemo, useState } from "react";

import { api, useMutation, useViewerBootstrap } from "@/convex";
import { isMemberForAccountValue } from "@/utils/app";
import type { MemberForAccount } from "@/types";

export function useAccountPage() {
  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const bootstrap = useViewerBootstrap();
  const memberRaw = clerkUser ? bootstrap?.member : undefined;
  const updateMyProfile = useMutation(api.functions.members.updateMyProfile);

  const memberForAccount = useMemo<MemberForAccount | null>(
    () => (isMemberForAccountValue(memberRaw) ? memberRaw : null),
    [memberRaw],
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!memberForAccount) return;
    setFirstName(memberForAccount.firstname ?? "");
    setLastName(memberForAccount.lastname ?? "");
  }, [memberForAccount]);

  async function onSaveProfile() {
    if (!memberForAccount) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await updateMyProfile({ firstname: firstName, lastname: lastName });
      setSaveSuccess("Saved");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return {
    openSignIn,
    signOut,
    memberRaw,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    saving,
    saveError,
    saveSuccess,
    memberAccountCents: memberForAccount?.account,
    onSaveProfile,
  };
}
