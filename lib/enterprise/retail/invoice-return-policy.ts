import { Prisma } from "@prisma/client";
import { z } from "zod";

/** The company controls the policy. ALL_SITES does not grant an actor access
 * to another store. Authorization always comes from Retail site capabilities.
 * A missing/invalid policy is STANDARD (fail closed, legacy-safe). */
export const retailInvoiceReturnPolicySchema = z.object({
  version: z.literal(1),
  mode: z.enum(["STANDARD", "SIMPLIFIED"]),
  allowRequesterInspection: z.boolean(),
  allowDelegatedSelfApproval: z.boolean(),
  autoPostCreditNote: z.boolean(),
  promptImmediateRefund: z.boolean(),
  scope: z.literal("ALL_SITES"),
  expressRefundLimitAmount: z.number().finite().min(0).max(10000),
  expressRefundLimitCurrency: z.literal("USD"),
}).strict();

export type RetailInvoiceReturnPolicy = z.infer<typeof retailInvoiceReturnPolicySchema>;

export const DEFAULT_RETAIL_INVOICE_RETURN_POLICY: RetailInvoiceReturnPolicy = {
  version: 1,
  mode: "STANDARD",
  allowRequesterInspection: false,
  allowDelegatedSelfApproval: false,
  autoPostCreditNote: false,
  promptImmediateRefund: false,
  scope: "ALL_SITES",
  expressRefundLimitAmount: 100,
  expressRefundLimitCurrency: "USD",
};

export function readRetailInvoiceReturnPolicy(settings: Prisma.JsonValue | null | undefined): RetailInvoiceReturnPolicy {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { ...DEFAULT_RETAIL_INVOICE_RETURN_POLICY };
  const parsed = retailInvoiceReturnPolicySchema.safeParse(settings.retailInvoiceReturnPolicy);
  return parsed.success ? parsed.data : { ...DEFAULT_RETAIL_INVOICE_RETURN_POLICY };
}

/** Stored per-request snapshot; absent on historical records and never
 * interpreted as enabling simplified decisions. */
export function readRetailInvoiceReturnPolicySnapshot(snapshot: Prisma.JsonValue | null | undefined): RetailInvoiceReturnPolicy {
  const parsed = retailInvoiceReturnPolicySchema.safeParse(snapshot);
  return parsed.success ? parsed.data : { ...DEFAULT_RETAIL_INVOICE_RETURN_POLICY };
}

export function mergeRetailInvoiceReturnPolicy(
  settings: Prisma.JsonValue | null | undefined,
  policy: RetailInvoiceReturnPolicy,
): Prisma.InputJsonObject {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return { ...base, retailInvoiceReturnPolicy: policy };
}

/** A self-inspection permission is narrowly limited to the person requesting
 * the return, while the designated decision maker remains an independent
 * capability. Other approved return actors are unchanged. */
export function canSelfInspectRetailReturn(
  policy: RetailInvoiceReturnPolicy,
  requesterId: string,
  inspectorId: string,
  eligibleRole: boolean,
  hasStockCapability: boolean,
): boolean {
  return policy.mode === "SIMPLIFIED" &&
    policy.allowRequesterInspection &&
    requesterId === inspectorId && eligibleRole && hasStockCapability;
}

/** Distinguish a real zero-payout credit from a refund. Never fabricate a
 * financial account/payment for invoices that have not been collected. */
export function retailRefundDecision(
  creditAmount: Prisma.Decimal,
  openReceivable: Prisma.Decimal,
): { creditAgainstReceivable: Prisma.Decimal; payoutAmount: Prisma.Decimal } {
  const creditAgainstReceivable = creditAmount.lessThan(openReceivable) ? creditAmount : openReceivable;
  const difference = creditAmount.minus(creditAgainstReceivable);
  return { creditAgainstReceivable, payoutAmount: difference.greaterThan(0) ? difference : new Prisma.Decimal(0) };
}
