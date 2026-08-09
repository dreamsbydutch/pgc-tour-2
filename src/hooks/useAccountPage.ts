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

  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [charityAmount, setCharityAmount] = useState("");
  const [leagueAmount, setLeagueAmount] = useState("");
  const [nextSeasonCard, setNextSeasonCard] = useState(false);
  const [payoutEmail, setPayoutEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!overview) return;
    setFirstName(overview.member.firstname ?? "");
    setLastName(overview.member.lastname ?? "");
    setPayoutEmail(overview.member.email);
  }, [overview]);

  useEffect(() => {
    if (!overview || selectedSeasonId) return;
    setSelectedSeasonId(
      overview.currentSeasonFinancial?.seasonId ??
        overview.seasonFinancials[0]?.seasonId ??
        "",
    );
  }, [overview, selectedSeasonId]);

  const selectedFinancial = useMemo(
    () =>
      overview?.seasonFinancials.find(
        (financial) => financial.seasonId === selectedSeasonId,
      ) ??
      overview?.currentSeasonFinancial ??
      null,
    [overview, selectedSeasonId],
  );

  const parsedAmounts = useMemo(() => {
    const transferCents = cadInputToCents(transferAmount);
    const charityCents = cadInputToCents(charityAmount);
    const leagueCents = cadInputToCents(leagueAmount);
    const valid =
      transferCents !== null && charityCents !== null && leagueCents !== null;
    const allocatedCents = valid
      ? getAllocationTotal({
          transferCents,
          charityCents,
          leagueCents,
          nextSeasonCard,
        })
      : 0;
    return {
      valid,
      transferCents: transferCents ?? 0,
      charityCents: charityCents ?? 0,
      leagueCents: leagueCents ?? 0,
      allocatedCents,
      remainingCents: (selectedFinancial?.availableCents ?? 0) - allocatedCents,
    };
  }, [
    charityAmount,
    leagueAmount,
    nextSeasonCard,
    selectedFinancial,
    transferAmount,
  ]);

  const request = selectedFinancial?.request ?? null;
  const canSubmitSettlement = Boolean(
    selectedFinancial?.isComplete &&
      selectedFinancial.availableCents > 0 &&
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
    if (!selectedFinancial || !parsedAmounts.valid) return;
    const nonTransfer =
      parsedAmounts.charityCents +
      parsedAmounts.leagueCents +
      (nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0);
    setTransferAmount(
      centsToCadInput(
        Math.max(0, selectedFinancial.availableCents - nonTransfer),
      ),
    );
  }

  async function onSubmitSettlement() {
    if (!selectedFinancial || !canSubmitSettlement) return;
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
        seasonId: selectedFinancial.seasonId as Id<"seasons">,
        transferCents: parsedAmounts.transferCents,
        charityCents: parsedAmounts.charityCents,
        leagueCents: parsedAmounts.leagueCents,
        nextSeasonCardCents: nextSeasonCard ? NEXT_SEASON_CARD_CENTS : 0,
        payoutEmail:
          parsedAmounts.transferCents > 0 ? payoutEmail.trim() : undefined,
      });
      setSubmitSuccess(
        "Your earnings instructions were sent to the PGC admin hub.",
      );
      setTransferAmount("");
      setCharityAmount("");
      setLeagueAmount("");
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
    isLoading: Boolean(clerkUser && overview === undefined),
    firstName,
    setFirstName,
    lastName,
    setLastName,
    saving,
    saveError,
    saveSuccess,
    onSaveProfile,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedFinancial,
    transferAmount,
    setTransferAmount,
    charityAmount,
    setCharityAmount,
    leagueAmount,
    setLeagueAmount,
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
    onSubmitSettlement,
  };
}
