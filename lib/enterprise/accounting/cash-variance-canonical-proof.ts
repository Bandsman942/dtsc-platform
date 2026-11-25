import { Prisma } from "@prisma/client";

/** Deliberately exact and one-to-one. A matching amount is never sufficient proof. */
export function cashVarianceCanonicalProofMatches(input: {
  accountId: string; currencyCode: string; amount: Prisma.Decimal;
  submittedAt: Date; firstBusinessDate: string; lastBusinessDate: string;
  transaction: { financialAccountId: string; currencyCode: string; amount: Prisma.Decimal; direction: string; status: string; reversedAt: Date | null; createdAt: Date };
  transactionBusinessDate: string; sourceStatus: string; confirmedAt: Date | null;
  alreadyIncluded: boolean; sourceReferenceCount: number;
}) {
  const t = input.transaction;
  return t.financialAccountId === input.accountId && t.currencyCode === input.currencyCode &&
    t.status === "CONFIRMED" && !t.reversedAt && t.amount.greaterThan(0) &&
    t.amount.equals(input.amount.abs()) && t.direction === (input.amount.isNegative() ? "OUTBOUND" : "INBOUND") &&
    input.sourceStatus === "CONFIRMED" && Boolean(input.confirmedAt && input.confirmedAt > input.submittedAt) &&
    t.createdAt > input.submittedAt && input.transactionBusinessDate >= input.firstBusinessDate &&
    input.transactionBusinessDate <= input.lastBusinessDate && !input.alreadyIncluded && input.sourceReferenceCount === 1;
}
