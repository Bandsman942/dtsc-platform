import type { SessionPayload } from "@/lib/session";

export type PaymentContext = { session: SessionPayload; request: Request };
export type PaymentCheckoutProvider = "MAISHAPAY" | "MANUAL";
export type PaymentTarget = { scope: "PERSONAL"; userId: string } | { scope: "ORGANIZATION"; organizationId: string };

/** Billing entitlement is a platform-level capability required to buy/renew a plan. */
export type PaymentAction = "READ" | "CREATE" | "CANCEL" | "DECIDE" | "FINALIZE";

export type PaymentPageInput = {
  page?: number;
  pageSize?: number;
  status?: "PENDING" | "ACCEPTED" | "PAID" | "FAILED" | "CANCELED";
  from?: Date;
  to?: Date;
};
