import type { PaymentStatus } from "@prisma/client";
import { paymentError } from "./payment-errors";

/** PaymentStatus is the schema enum, not a second provider-specific state machine. */
const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["ACCEPTED", "PAID", "FAILED", "CANCELED"],
  ACCEPTED: ["PAID", "FAILED", "CANCELED"],
  PAID: [],
  FAILED: ["PENDING"],
  CANCELED: ["PENDING"],
};

/** Idempotent replay is a no-op; retry of terminal failures must be explicit. */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus, options: { retry?: boolean } = {}) {
  if (from === to) return "UNCHANGED" as const;
  if (!transitions[from]?.includes(to)) paymentError("PAYMENT_INVALID_TRANSITION");
  if ((from === "FAILED" || from === "CANCELED") && to === "PENDING" && !options.retry) {
    paymentError("PAYMENT_INVALID_TRANSITION");
  }
  return "CHANGED" as const;
}

export function assertPaymentCanFinalize(status: PaymentStatus) {
  if (status === "PAID") return "UNCHANGED" as const;
  if (status !== "PENDING" && status !== "ACCEPTED") paymentError("PAYMENT_INVALID_TRANSITION");
  return "CHANGED" as const;
}

/**
 * A PSP checkout/callback is not a locally reversible reservation. Until PAY-4
 * confirms a provider cancellation or explicit new attempt, a simple status
 * change must never pretend that external money has been rolled back.
 */
export function assertPaymentProviderNotStarted(payment: {
  providerReference?: string | null;
  checkoutPayload?: unknown;
  callbackPayload?: unknown;
}) {
  if (payment.providerReference || payment.checkoutPayload != null || payment.callbackPayload != null) {
    paymentError("PAYMENT_UNSUPPORTED_OPERATION");
  }
}
