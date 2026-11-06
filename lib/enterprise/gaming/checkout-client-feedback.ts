import type { gamingCheckoutCopy } from "@/components/enterprise/gaming/gaming-checkout-i18n";

type Copy = ReturnType<typeof gamingCheckoutCopy>;
type ApiFailure = { status: number; code: string; details?: unknown };

const formFields = [
  "sessionId", "invoiceApproverUserId", "warehouseId", "financialAccountId",
  "approverUserId", "amount", "reason", "methodType", "extraItems",
] as const;
export type GamingCheckoutField = typeof formFields[number];
export type GamingCheckoutFeedback = { message: string; fields: Partial<Record<GamingCheckoutField, string>> };

/** Only recognize field names, never leak raw Zod/domain details or error codes into the UI. */
function fieldsFromDetails(details: unknown, message: string) {
  const fields: Partial<Record<GamingCheckoutField, string>> = {};
  if (!details || typeof details !== "object" || !("issues" in details) || !Array.isArray(details.issues)) return fields;
  for (const issue of details.issues.slice(0, 20)) {
    const field = issue && typeof issue === "object" && Array.isArray(issue.path) ? issue.path[0] : null;
    if (typeof field === "string" && formFields.some((value) => value === field)) {
      fields[field as GamingCheckoutField] = message;
    }
  }
  return fields;
}

export function gamingCheckoutFailureFeedback(failure: ApiFailure | null, copy: Copy): GamingCheckoutFeedback {
  if (!failure) return { message: copy.feedbackUnavailable, fields: {} };
  const mapped: Record<string, { message: string; field?: GamingCheckoutField }> = {
    GAMING_CHECKOUT_SESSION_NOT_READY: { message: copy.feedbackSessionNotReady, field: "sessionId" },
    GAMING_CHECKOUT_BILLABLE_SESSION_REQUIRED: { message: copy.feedbackSessionNotReady, field: "sessionId" },
    GAMING_CHECKOUT_WAREHOUSE_REQUIRED: { message: copy.feedbackWarehouseRequired, field: "warehouseId" },
    GAMING_CHECKOUT_WAREHOUSE_INVALID: { message: copy.feedbackWarehouseRequired, field: "warehouseId" },
    GAMING_CHECKOUT_WAREHOUSE_SITE_MISMATCH: { message: copy.feedbackWarehouseRequired, field: "warehouseId" },
    GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING: { message: copy.feedbackPaymentExceeds, field: "amount" },
    GAMING_CHECKOUT_OPEN_CASH_SESSION_REQUIRED: { message: copy.openCashSessionRequired, field: "financialAccountId" },
    GAMING_CHECKOUT_PAYMENT_INVALID: { message: copy.feedbackPaymentInvalid, field: "financialAccountId" },
    GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN: { message: copy.feedbackRefundApprover, field: "approverUserId" },
    GAMING_CHECKOUT_DUPLICATE_EXTRA_ITEM: { message: copy.feedbackExtraItem, field: "extraItems" },
    GAMING_CHECKOUT_EXTRA_ITEM_INVALID: { message: copy.feedbackExtraItem, field: "extraItems" },
    GAMING_CHECKOUT_REVISION_CONFLICT: { message: copy.feedbackConflict },
  };
  // HTTP status is authoritative even if a response supplies a misleading code or message.
  const status = failure.status;
  const known = status >= 400 && status < 500 ? mapped[failure.code] : undefined;
  const message = status === 401 ? copy.feedbackUnauthenticated
    : status === 403 ? copy.feedbackForbidden
      : status === 429 ? copy.feedbackRateLimited
        : known?.message || (status === 400 || status === 422 ? copy.feedbackValidation
          : status === 409 ? copy.feedbackConflict : status >= 500 ? copy.feedbackUnavailable : copy.actionFailed);
  const fields = status === 400 || status === 422
    ? fieldsFromDetails(failure.details, copy.feedbackFieldInvalid)
    : {} as Partial<Record<GamingCheckoutField, string>>;
  if (known?.field && status !== 401 && status !== 403 && status !== 429) fields[known.field] = known.message;
  return {
    message: Object.keys(fields).length > 1 ? `${message} ${copy.feedbackMultipleFields}` : message,
    fields,
  };
}
