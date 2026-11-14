import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PAY-4B: a configured callback secret is mandatory. SHA-256 digests provide
 * equal-length buffers for constant-time comparison and never enter logs.
 */
export function isAuthorizedMaishaPayCallback(
  configuredSecret: string | null | undefined,
  suppliedSecret: string | null | undefined,
): boolean {
  if (!configuredSecret?.trim() || !suppliedSecret) return false;
  const expected = createHash("sha256").update(configuredSecret, "utf8").digest();
  const actual = createHash("sha256").update(suppliedSecret, "utf8").digest();
  return timingSafeEqual(expected, actual);
}

const paidValues = new Set(["200", "success", "successful", "paid", "completed", "confirmed"]);
const rejectedStatuses = new Set(["failed", "failure", "error", "rejected", "declined", "cancelled", "canceled", "pending", "processing", "refunded"]);

export function isConfirmedMaishaPayStatus(data: { status?: string | number; statusCode?: string | number }): boolean {
  const status = data.status == null ? "" : String(data.status).trim().toLowerCase();
  const code = data.statusCode == null ? "" : String(data.statusCode).trim().toLowerCase();
  // An explicit negative/pending payment status takes precedence over the
  // HTTP-like statusCode 200 so callbacks cannot report contradictory success.
  if (status && rejectedStatuses.has(status)) return false;
  return (status ? paidValues.has(status) : false) || (!status && paidValues.has(code));
}

function monetaryCents(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fractional = ""] = raw.split(".");
  return BigInt(whole) * 100n + BigInt((fractional + "00").slice(0, 2));
}

export function validateMaishaPayPaymentEvidence(
  callback: { amount?: string | number; currency?: string; transactionId?: string },
  payment: { provider: string; amount: { toString(): string } | string | number; currency: string; providerReference?: string | null },
): string | null {
  if (payment.provider !== "MAISHAPAY") return "PAYMENT_PROVIDER_MISMATCH";
  const expectedAmount = monetaryCents(payment.amount);
  const reportedAmount = monetaryCents(callback.amount);
  if (reportedAmount === null || expectedAmount === null || expectedAmount <= 0n || reportedAmount !== expectedAmount) {
    return "PAYMENT_AMOUNT_MISMATCH";
  }
  const currency = typeof callback.currency === "string" ? callback.currency.trim().toUpperCase() : "";
  if (!currency || currency !== payment.currency.trim().toUpperCase()) return "PAYMENT_CURRENCY_MISMATCH";
  if (payment.providerReference && callback.transactionId && callback.transactionId !== payment.providerReference) {
    return "PAYMENT_PROVIDER_REFERENCE_MISMATCH";
  }
  return null;
}
