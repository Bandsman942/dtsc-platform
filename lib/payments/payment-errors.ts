/** Public, stable errors. Never include a provider response or private object in a message. */
export type PaymentErrorCode =
  | "PAYMENT_UNAUTHENTICATED"
  | "PAYMENT_ACCESS_DENIED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_INVALID_INPUT"
  | "PAYMENT_INVALID_TRANSITION"
  | "PAYMENT_IDEMPOTENCY_CONFLICT"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_INVOICE_CONFLICT"
  | "PAYMENT_EVIDENCE_REQUIRED"
  | "PAYMENT_VALIDATOR_REQUIRED"
  | "PAYMENT_SELF_APPROVAL_FORBIDDEN"
  | "PAYMENT_RATE_LIMITED"
  | "PAYMENT_UNSUPPORTED_OPERATION";

const httpStatuses: Record<PaymentErrorCode, number> = {
  PAYMENT_UNAUTHENTICATED: 401,
  PAYMENT_ACCESS_DENIED: 403,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_INVALID_INPUT: 400,
  PAYMENT_INVALID_TRANSITION: 409,
  PAYMENT_IDEMPOTENCY_CONFLICT: 409,
  PAYMENT_AMOUNT_MISMATCH: 409,
  PAYMENT_INVOICE_CONFLICT: 409,
  PAYMENT_EVIDENCE_REQUIRED: 422,
  PAYMENT_VALIDATOR_REQUIRED: 403,
  PAYMENT_SELF_APPROVAL_FORBIDDEN: 403,
  PAYMENT_RATE_LIMITED: 429,
  PAYMENT_UNSUPPORTED_OPERATION: 422,
};

export class PaymentDomainError extends Error {
  readonly code: PaymentErrorCode;
  readonly status: number;

  constructor(code: PaymentErrorCode) {
    super(code);
    this.name = "PaymentDomainError";
    this.code = code;
    this.status = httpStatuses[code];
  }
}

export function paymentError(code: PaymentErrorCode): never {
  throw new PaymentDomainError(code);
}
