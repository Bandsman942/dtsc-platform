import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MaishaPay documents an HMAC-SHA256 signature of the unmodified HTTP request
 * body in X-MaishaPay-Signature, formatted sha256=<64 hex characters>.
 * NEVER sign JSON.stringify(parsedBody), a normalized object, or an API key.
 */
export function isAuthorizedMaishaPayCallback(
  configuredSecret: string | null | undefined,
  rawBody: Uint8Array | string,
  signature: string | null | undefined,
): boolean {
  if (!configuredSecret?.trim() || !signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const supplied = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", configuredSecret)
    .update(rawBody)
    .digest();
  return timingSafeEqual(supplied, expected);
}

const paidValues = new Set(["200", "success", "successful", "paid", "completed", "confirmed"]);
const rejectedStatuses = new Set(["failed", "failure", "error", "rejected", "declined", "cancelled", "canceled", "pending", "processing", "refunded"]);

export function isConfirmedMaishaPayStatus(data: { status?: string | number; statusCode?: string | number }): boolean {
  const status = data.status == null ? "" : String(data.status).trim().toLowerCase();
  const code = data.statusCode == null ? "" : String(data.statusCode).trim().toLowerCase();
  if (status && rejectedStatuses.has(status)) return false;
  return (status ? paidValues.has(status) : false) || (!status && paidValues.has(code));
}

export type MaishaPayPaymentNotification = {
  transactionReference?: string;
  originatingTransactionId?: string;
  transactionId?: string;
  status?: string | number;
  statusCode?: string | number;
  amount?: string | number;
  currency?: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function numericField(value: unknown): string | number | undefined {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? value : undefined;
}

/**
 * API v2 transaction.* envelopes use integer minor units (centimes);
 * merchant payment.* callbacks show decimal major units. Never use floats to
 * convert amounts: a misidentified unit must fail closed, not mark PAID.
 */
function minorUnitsToMajor(value: unknown): string | undefined {
  const raw = typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 0 ? String(value) : null
    : typeof value === "string" ? value.trim() : null;
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const cents = BigInt(raw);
  const units = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${units.toString()}.${fraction}`;
}

/**
 * Supports both MaishaPay's documented v2 envelope
 * {type:"transaction.success",data:{reference,transaction_id,amount,currency,payment_status}}
 * and its merchant callback {event:"payment.success", transactionReference,...}.
 * Unrecognized/conflicting event types never become a successful payment.
 */
export function normalizeMaishaPayWebhook(input: unknown): MaishaPayPaymentNotification | null {
  const event = record(input);
  if (!event) return null;
  const nested = record(event.data);
  const source = nested ?? event;
  const eventName = textField(event.type) ?? textField(event.event);
  const permittedEvents = new Set([
    "transaction.success", "transaction.failed", "transaction.pending", "transaction.cancelled",
    "payment.success", "payment.failed", "payment.pending", "payment.cancelled",
  ]);
  if (eventName && !permittedEvents.has(eventName)) return null;
  if (nested && !eventName) return null;
  if (nested && !eventName?.startsWith("transaction.")) return null;
  const rawStatus = numericField(source.payment_status ?? source.status ?? event.status);
  const eventStatus = eventName
    ? eventName.endsWith(".success") ? "SUCCESS" : eventName.split(".").at(-1)?.toUpperCase()
    : undefined;
  const status = rawStatus ?? eventStatus;
  // Do not treat an event claiming "success" as paid when its payment_status
  // contradicts the event type, or vice versa.
  if (rawStatus && eventStatus &&
      isConfirmedMaishaPayStatus({status: rawStatus}) !== isConfirmedMaishaPayStatus({status: eventStatus})) {
    return null;
  }
  return {
    transactionReference: textField(source.transactionReference ?? source.reference ?? source.transaction_reference),
    originatingTransactionId: textField(source.originatingTransactionId),
    transactionId: textField(source.transactionId ?? source.transaction_id),
    status,
    statusCode: numericField(source.statusCode),
    amount: nested ? minorUnitsToMajor(source.amount) : numericField(source.amount),
    currency: textField(source.currency),
  };
}

function monetaryCents(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fractional = ""] = raw.split(".");
  return BigInt(whole) * BigInt(100) + BigInt((fractional + "00").slice(0, 2));
}

export function validateMaishaPayPaymentEvidence(
  callback: { amount?: string | number; currency?: string; transactionId?: string },
  payment: { provider: string; amount: { toString(): string } | string | number; currency: string; providerReference?: string | null },
): string | null {
  if (payment.provider !== "MAISHAPAY") return "PAYMENT_PROVIDER_MISMATCH";
  const expectedAmount = monetaryCents(payment.amount);
  const reportedAmount = monetaryCents(callback.amount);
  if (reportedAmount === null || expectedAmount === null || expectedAmount <= BigInt(0) || reportedAmount !== expectedAmount) {
    return "PAYMENT_AMOUNT_MISMATCH";
  }
  const currency = typeof callback.currency === "string" ? callback.currency.trim().toUpperCase() : "";
  if (!currency || currency !== payment.currency.trim().toUpperCase()) return "PAYMENT_CURRENCY_MISMATCH";
  if (payment.providerReference && callback.transactionId !== payment.providerReference) {
    return "PAYMENT_PROVIDER_REFERENCE_MISMATCH";
  }
  return null;
}

/**
 * Persist immutable signed evidence, not a bare untrusted "verified":true flag.
 * The dispatcher recomputes the HMAC from the original exact body on replay.
 */
export type MaishaPaySignedEvent = {
  bodyBase64: string;
  signature: string;
};
export function readVerifiedMaishaPayEvent(
  payload: unknown,
  secret: string | null | undefined,
): MaishaPayPaymentNotification | null {
  const envelope = record(payload);
  if (!envelope || typeof envelope.bodyBase64 !== "string" || typeof envelope.signature !== "string") return null;
  // Reconstruct the exact original bytes; JSON reserialization is not a valid signature input.
  const signedBytes = Buffer.from(envelope.bodyBase64, "base64");
  if (!isAuthorizedMaishaPayCallback(secret, signedBytes, envelope.signature)) return null;
  try {
    return normalizeMaishaPayWebhook(JSON.parse(signedBytes.toString("utf8")));
  } catch {
    return null;
  }
}
