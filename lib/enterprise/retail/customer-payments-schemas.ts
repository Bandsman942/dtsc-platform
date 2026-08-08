import { z } from "zod";
import {
  RETAIL_DEVICE_CONNECTION_MODES,
  RETAIL_DEVICE_TYPES,
  RETAIL_LOYALTY_PROGRAM_STATUSES,
  RETAIL_PAYMENT_STATUSES,
  RETAIL_PROVIDER_CONNECTION_STATUSES,
  RETAIL_PROVIDER_INTEGRATION_MODES,
  RETAIL_PROVIDER_OPERATION_STATUSES,
  RETAIL_STORED_VALUE_ACCOUNT_TYPES,
} from "@/lib/enterprise/retail/constants";

const id = z.string().trim().min(1).max(240);
const code = z.string().trim().min(2).max(80).transform((value) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_"));
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const money = z.coerce.number().finite().nonnegative().max(1_000_000_000_000);
const positiveMoney = z.coerce.number().finite().positive().max(1_000_000_000_000);
const points = z.coerce.number().finite().positive().max(1_000_000_000_000);
const idempotencyKey = z.string().trim().min(8).max(180);

export const retailCustomerProfileUpsertSchema = z.object({
  businessPartyId: id,
  customerNumber: code.optional(),
  segmentCode: code.optional().nullable(),
  priceListCode: code.optional().nullable(),
  preferredLocale: z.enum(["fr", "en"]).optional().nullable(),
  preferredCurrencyCode: currency.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).default("ACTIVE"),
});

export const retailLoyaltyProgramUpsertSchema = z.object({
  id: id.optional(),
  code,
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  currencyCode: currency,
  earnPointsPerCurrencyUnit: money,
  redeemValuePerPoint: money,
  minimumRedeemPoints: money.default(0),
  status: z.enum(RETAIL_LOYALTY_PROGRAM_STATUSES).default("DRAFT"),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  settingsJson: z.record(z.string(), z.unknown()).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.endsAt && value.startsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de fin doit être postérieure au début.", path: ["endsAt"] });
  }
  if (value.status === "ACTIVE" && value.earnPointsPerCurrencyUnit <= 0 && value.redeemValuePerPoint <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un programme actif doit définir une règle de gain ou d’utilisation.", path: ["earnPointsPerCurrencyUnit"] });
  }
});

export const retailLoyaltyEarnSchema = z.object({
  programId: id,
  customerBusinessPartyId: id,
  points,
  monetaryAmount: money.optional().nullable(),
  currencyCode: currency.optional().nullable(),
  saleId: id.optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  idempotencyKey,
});

export const retailLoyaltyRedeemSchema = z.object({
  programId: id,
  customerBusinessPartyId: id,
  points,
  monetaryAmount: money.optional().nullable(),
  currencyCode: currency.optional().nullable(),
  saleId: id.optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey,
});

export const retailStoredValueIssueSchema = z.object({
  accountType: z.enum(RETAIL_STORED_VALUE_ACCOUNT_TYPES),
  customerBusinessPartyId: id.optional().nullable(),
  currencyCode: currency,
  initialValue: positiveMoney,
  expiresAt: z.coerce.date().optional().nullable(),
  idempotencyKey,
});

export const retailStoredValueRedeemSchema = z.object({
  code: z.string().trim().min(8).max(180),
  amount: positiveMoney,
  currencyCode: currency,
  saleId: id.optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey,
});

export const retailStoredValueRefundSchema = z.object({
  accountId: id,
  amount: positiveMoney,
  currencyCode: currency,
  returnId: id.optional().nullable(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

export const retailProviderIntegrationUpsertSchema = z.object({
  providerId: id,
  integrationMode: z.enum(RETAIL_PROVIDER_INTEGRATION_MODES),
  adapterCode: code.optional().nullable(),
  credentialReference: z.string().trim().min(3).max(240).optional().nullable(),
  webhookSecretReference: z.string().trim().min(3).max(240).optional().nullable(),
  connectionStatus: z.enum(RETAIL_PROVIDER_CONNECTION_STATUSES).default("NOT_CONFIGURED"),
  settingsJson: z.record(z.string(), z.unknown()).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.integrationMode === "CONNECTED" && !value.adapterCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un adaptateur est requis pour un provider connecté.", path: ["adapterCode"] });
  }
});

export const retailProviderOperationCreateSchema = z.object({
  providerId: id,
  operationType: code,
  sourceEntityType: z.enum(["EnterpriseMobileMoneyTransaction", "EnterpriseTelcoTopup", "EnterpriseRetailPaymentTransaction"]),
  sourceEntityId: id,
  currencyCode: currency.optional().nullable(),
  amount: money.optional().nullable(),
  externalReference: z.string().trim().max(180).optional().nullable(),
  timeoutAt: z.coerce.date().optional().nullable(),
  idempotencyKey,
});

export const retailProviderOperationTransitionSchema = z.object({
  revision: z.coerce.number().int().positive(),
  status: z.enum(RETAIL_PROVIDER_OPERATION_STATUSES),
  externalReference: z.string().trim().max(180).optional().nullable(),
  errorCode: z.string().trim().max(120).optional().nullable(),
  errorMessage: z.string().trim().max(1000).optional().nullable(),
  reconciled: z.boolean().optional().default(false),
});

export const retailPaymentCreateSchema = z.object({
  providerId: id.optional().nullable(),
  saleId: id.optional().nullable(),
  returnId: id.optional().nullable(),
  methodType: z.enum(["CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"]),
  currencyCode: currency,
  amount: positiveMoney,
  clientReference: z.string().trim().min(3).max(180),
  idempotencyKey,
}).superRefine((value, ctx) => {
  if (value.saleId && value.returnId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un paiement ne peut pas cibler simultanément une vente et un retour.", path: ["returnId"] });
});

export const retailPaymentTransitionSchema = z.object({
  revision: z.coerce.number().int().positive(),
  status: z.enum(RETAIL_PAYMENT_STATUSES),
  providerReference: z.string().trim().max(180).optional().nullable(),
  failureCode: z.string().trim().max(120).optional().nullable(),
  failureMessage: z.string().trim().max(1000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.status === "FAILED" && !value.failureCode && !value.failureMessage) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un paiement échoué doit conserver une raison.", path: ["failureCode"] });
  }
});

export const retailWebhookEventSchema = z.object({
  providerId: id,
  externalEventId: z.string().trim().min(3).max(240),
  eventType: code,
  signatureVerified: z.boolean(),
  payloadHash: z.string().trim().min(32).max(128),
  safePayloadJson: z.record(z.string(), z.unknown()).optional().nullable(),
  providerOperationId: id.optional().nullable(),
  paymentTransactionId: id.optional().nullable(),
  providerOperationStatus: z.enum(RETAIL_PROVIDER_OPERATION_STATUSES).optional().nullable(),
  paymentStatus: z.enum(RETAIL_PAYMENT_STATUSES).optional().nullable(),
  providerReference: z.string().trim().max(180).optional().nullable(),
});

export const retailDeviceProfileUpsertSchema = z.object({
  id: id.optional(),
  siteId: id.optional().nullable(),
  code,
  name: z.string().trim().min(2).max(160),
  deviceType: z.enum(RETAIL_DEVICE_TYPES),
  connectionMode: z.enum(RETAIL_DEVICE_CONNECTION_MODES),
  capabilitiesJson: z.record(z.string(), z.unknown()).optional().nullable(),
  settingsJson: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});
