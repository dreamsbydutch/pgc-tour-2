export type TransactionType =
  | "TourCardFee"
  | "TournamentWinnings"
  | "Withdrawal"
  | "Deposit"
  | "LeagueDonation"
  | "CharityDonation"
  | "Payment"
  | "Refund"
  | "Adjustment";

export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export type ToSignedAmountCentsArgs = {
  transactionType: TransactionType;
  amountCents: number;
};

export type MemberEmailRow = {
  member: {
    email: string;
  };
};
