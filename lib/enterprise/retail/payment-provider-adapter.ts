export type RetailProviderContext = {
  organizationId: string;
  providerId: string;
  providerCode: string;
  adapterCode: string;
  credentialReference: string | null;
  webhookSecretReference: string | null;
  settings: Record<string, unknown>;
};

export type RetailPaymentIntent = {
  operationId: string;
  paymentTransactionId: string | null;
  amount: string;
  currencyCode: string;
  clientReference: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RetailProviderResult = {
  status: "PENDING_PROVIDER" | "CONFIRMED" | "FAILED" | "UNKNOWN";
  externalReference: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  safeMetadata?: Record<string, string | number | boolean | null>;
};

export type RetailWebhookVerification = {
  verified: boolean;
  externalEventId: string | null;
  eventType: string | null;
  externalReference: string | null;
  providerOperationId?: string | null;
  paymentTransactionId?: string | null;
  paymentStatus?: "AUTHORIZED" | "CAPTURED" | "FAILED" | "VOIDED" | "REFUNDED" | null;
  providerOperationStatus?: "PENDING_PROVIDER" | "CONFIRMED" | "FAILED" | "UNKNOWN" | "RECONCILED" | null;
  safePayload?: Record<string, unknown> | null;
  errorCode?: string | null;
};

export interface RetailPaymentProviderAdapter {
  readonly code: string;
  initiate(context: RetailProviderContext, intent: RetailPaymentIntent): Promise<RetailProviderResult>;
  capture?(context: RetailProviderContext, intent: RetailPaymentIntent): Promise<RetailProviderResult>;
  refund?(context: RetailProviderContext, intent: RetailPaymentIntent): Promise<RetailProviderResult>;
  verifyWebhook?(context: RetailProviderContext, request: Request, rawBody: string): Promise<RetailWebhookVerification>;
}

const manualAdapter: RetailPaymentProviderAdapter = {
  code: "MANUAL",
  async initiate() {
    return { status: "UNKNOWN", externalReference: null, errorCode: "MANUAL_CONFIRMATION_REQUIRED", errorMessage: "Manual provider operations require explicit reconciliation." };
  },
};

const adapters = new Map<string, RetailPaymentProviderAdapter>([[manualAdapter.code, manualAdapter]]);

export function registerRetailPaymentProviderAdapter(adapter: RetailPaymentProviderAdapter) {
  const code = adapter.code.trim().toUpperCase();
  if (!code) throw new Error("RETAIL_PROVIDER_ADAPTER_CODE_REQUIRED");
  adapters.set(code, adapter);
}

export function getRetailPaymentProviderAdapter(adapterCode: string | null | undefined) {
  if (!adapterCode) return null;
  return adapters.get(adapterCode.trim().toUpperCase()) || null;
}

export function listRetailPaymentProviderAdapters() {
  return Array.from(adapters.keys()).sort();
}
