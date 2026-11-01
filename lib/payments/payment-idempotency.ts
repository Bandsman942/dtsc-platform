import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { paymentError } from "./payment-errors";

export type PaymentReferenceScope = "PERSONAL" | "ORGANIZATION" | "INVOICE";

/** Stable across retries, opaque to clients; no raw tenant ID or request body in the reference. */
export function makePaymentReference(input: {
  scope: PaymentReferenceScope;
  ownerId: string;
  requestId: string;
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify(["DTSC_PAY_V1", input.scope, input.ownerId, input.requestId]))
    .digest("hex")
    .slice(0, 40)
    .toUpperCase();
  return `DTSC-PAY-${input.scope}-${digest}`;
}

/** A reused idempotency key with changed material terms is a conflict, never a new charge. */
export function assertPaymentReplay(input: {
  existing: {
    userId: string;
    organizationId: string | null;
    provider: string;
    currency: string;
    amount: Prisma.Decimal;
    subscriptionId: string | null;
    organizationSubscriptionId: string | null;
  };
  userId: string;
  organizationId?: string | null;
  provider: string;
  currency: string;
  amount: Prisma.Decimal;
  subscriptionId?: string | null;
  organizationSubscriptionId?: string | null;
}) {
  const { existing } = input;
  if (
    existing.userId !== input.userId ||
    existing.organizationId !== (input.organizationId ?? null) ||
    existing.provider !== input.provider ||
    existing.currency !== input.currency ||
    !existing.amount.equals(input.amount) ||
    (input.subscriptionId !== undefined && existing.subscriptionId !== input.subscriptionId) ||
    (input.organizationSubscriptionId !== undefined && existing.organizationSubscriptionId !== input.organizationSubscriptionId)
  ) {
    paymentError("PAYMENT_IDEMPOTENCY_CONFLICT");
  }
}

export function assertExactPaymentAmount(expected: { amount: Prisma.Decimal; currency: string }, received: { amount: Prisma.Decimal; currency: string }) {
  if (expected.currency !== received.currency || !expected.amount.equals(received.amount)) {
    paymentError("PAYMENT_AMOUNT_MISMATCH");
  }
}
