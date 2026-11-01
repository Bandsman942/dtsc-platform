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
