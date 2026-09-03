import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useEffect, useMemo, useState } from "react";

import { api, type Id, useMutation, useQuery } from "@/convex";
import {
  NEXT_SEASON_CARD_CENTS,
  cadInputToCents,
  centsToCadInput,
  getAllocationTotal,
} from "@/utils";

export function useAccountPage() {
  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const overview = useQuery(
    api.functions.account.getMyOverview,
    clerkUser ? {} : "skip",
  );
  const updateMyProfile = useMutation(api.functions.members.updateMyProfile);
  const submitSettlement = useMutation(
    api.functions.settlements.submitMyRequest,
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [transferAmount, setTransferAmount] = useState("");
  const [charityAmount, setCharityAmount] = useState("");
  const [leagueAmount, setLeagueAmount] = useState("");
  const [retainedAmount, setRetainedAmount] = useState("");
  const [nextSeasonCard, setNextSeasonCard] = useState(false);
  const [payoutEmail, setPayoutEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!overview) return;
    setFirstName(overview.member.firstname ?? "");
    setLastName(overview.member.lastname ?? "");
    setPayoutEmail((current) => current || overview.member.email);
  }, [overview]);

  const currentSeasonFinancial = overview?.currentSeasonFinancial ?? null;

  const parsedAmounts = useMemo(() => {
    const transferCents = cadInputToCents(transferAmount);
    const charityCents = cadInputToCents(charityAmount);
    const leagueCents = cadInputToCents(leagueAmount);
    const retainedCents = cadInputToCents(retainedAmount);
    const valid =
      transferCents !== null &&
      charityCents !== null &&
      leagueCents !== null &&
      retainedCents !== null;
    const allocatedCents = valid
      ? getAllocationTotal({
          transferCents,
          charityCents,
          leagueCents,
          nextSeasonCard,
          retainedCents,
        })
      : 0;
    return {
      valid,
      transferCents: transferCents ?? 0,
      charityCents: charityCents ?? 0,
      leagueCents: leagueCents ?? 0,
      retainedCents: retainedCents ?? 0,
      allocatedCents,
      remainingCents:
        (currentSeasonFinancial?.availableCents ?? 0) - allocatedCents,
    };
  }, [
    charityAmount,
    leagueAmount,
    nextSeasonCard,
    retainedAmount,
    currentSeasonFinancial,
    transferAmount,
  ]);

  const request = currentSeasonFinancial?.request ?? null;
  const canSubmitSettlement = Boolean(
    currentSeasonFinancial?.isComplete &&
      currentSeasonFinancial.availableCents > 0 &&
      (!request || request.status === "cancelled"),
  );

  async function onSaveProfile() {
    if (!overview) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await updateMyProfile({ firstname: firstName, lastname: lastName });
      setSaveSuccess("Profile saved");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function allocateRemainingToTransfer() {
    if (!currentSeasonFinancial || !parsedAmounts.valid) return;
    const nonTransfer =
      parsedAmounts.charityCents +
      parsedAmounts.leagueCents +
      (nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0);
    setTransferAmount(
      centsToCadInput(
        Math.max(0, currentSeasonFinancial.availableCents - nonTransfer),
      ),
    );
  }

  function allocateRemainingToAccount() {
    if (!currentSeasonFinancial || !parsedAmounts.valid) return;
    const nonRetained =
      parsedAmounts.transferCents +
      parsedAmounts.charityCents +
      parsedAmounts.leagueCents +
      (nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0);
    setRetainedAmount(
      centsToCadInput(
        Math.max(0, currentSeasonFinancial.availableCents - nonRetained),
      ),
    );
  }

  async function onSubmitSettlement() {
    if (!currentSeasonFinancial || !canSubmitSettlement) return;
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!parsedAmounts.valid) {
      setSubmitError(
        "Enter valid dollar amounts with no more than two decimals",
      );
      return;
    }
    if (parsedAmounts.remainingCents !== 0) {
      setSubmitError(
        "Allocate the full available earnings amount before submitting",
      );
      return;
    }
    setSubmitting(true);
    try {
      await submitSettlement({
        seasonId: currentSeasonFinancial.seasonId as Id<"seasons">,
        transferCents: parsedAmounts.transferCents,
        charityCents: parsedAmounts.charityCents,
        leagueCents: parsedAmounts.leagueCents,
        nextSeasonCardCents: nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0,
        retainedCents: parsedAmounts.retainedCents,
        payoutEmail:
          parsedAmounts.transferCents > 0 ? payoutEmail.trim() : undefined,
      });
      setSubmitSuccess(
        "Your earnings instructions were sent to the PGC admin hub.",
      );
      setTransferAmount("");
      setCharityAmount("");
      setLeagueAmount("");
      setRetainedAmount("");
      setNextSeasonCard(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to submit request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    openSignIn,
    signOut,
    overview,
    memberRaw: overview?.member,
    memberAccountCents: overview?.member.accountCents,
    isLoading: Boolean(clerkUser && overview === undefined),
    firstName,
    setFirstName,
    lastName,
    setLastName,
    saving,
    saveError,
    saveSuccess,
    onSaveProfile,
    currentSeasonFinancial,
    transferAmount,
    setTransferAmount,
    charityAmount,
    setCharityAmount,
    leagueAmount,
    setLeagueAmount,
    retainedAmount,
    setRetainedAmount,
    nextSeasonCard,
    setNextSeasonCard,
    payoutEmail,
    setPayoutEmail,
    submitting,
    submitError,
    submitSuccess,
    parsedAmounts,
    request,
    canSubmitSettlement,
    allocateRemainingToTransfer,
    allocateRemainingToAccount,
    onSubmitSettlement,
  };
}
