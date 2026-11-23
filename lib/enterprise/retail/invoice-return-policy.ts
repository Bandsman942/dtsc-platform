import { Prisma } from "@prisma/client";
import { z } from "zod";

/** The company controls the policy. ALL_SITES does not grant an actor access
 * to another store. Authorization always comes from Retail site capabilities.
 * A missing/invalid policy is STANDARD (fail closed, legacy-safe). */
// Version 1 is an immutable historical contract: exactly USD 100 was the
// maximum permitted by that version. Keep it readable for already submitted
// returns; never silently reinterpret their USD snapshots as CDF.
export const legacyRetailInvoiceReturnPolicySchema = z.object({
  version: z.literal(1),
  mode: z.enum(["STANDARD", "SIMPLIFIED"]),
  allowRequesterInspection: z.boolean(),
  allowDelegatedSelfApproval: z.boolean(),
  autoPostCreditNote: z.boolean(),
  promptImmediateRefund: z.boolean(),
  scope: z.literal("ALL_SITES"),
  expressRefundLimitAmount: z.number().finite().min(0).max(100),
  expressRefundLimitCurrency: z.literal("USD"),
}).strict();

// Version 2: owner-defined threshold, in the company's Finance functional
// currency. The number of decimal places and storage size are technical
// constraints, NOT a commercial limit. The API checks the currency against
// Finance before saving it; the engine checks it again at settlement.
const limitAmount = z.string().regex(/^(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,2})?$/)
  .refine(value => new Prisma.Decimal(value).greaterThan(0));
export const retailInvoiceReturnPolicySchema = z.object({
  version: z.literal(2),
  mode: z.enum(["STANDARD", "SIMPLIFIED"]),
  allowRequesterInspection: z.boolean(),
  allowDelegatedSelfApproval: z.boolean(),
  autoPostCreditNote: z.boolean(),
  promptImmediateRefund: z.boolean(),
  scope: z.literal("ALL_SITES"),
  expressRefundLimitAmount: limitAmount,
  expressRefundLimitCurrency: z.string().regex(/^[A-Z]{3}$/),
}).strict();

export const storedRetailInvoiceReturnPolicySchema = z.discriminatedUnion("version",
  [legacyRetailInvoiceReturnPolicySchema, retailInvoiceReturnPolicySchema]);
export type RetailInvoiceReturnPolicy = z.infer<typeof storedRetailInvoiceReturnPolicySchema>;
export type ConfigurableRetailInvoiceReturnPolicy = z.infer<typeof retailInvoiceReturnPolicySchema>;

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
  const parsed = storedRetailInvoiceReturnPolicySchema.safeParse(settings.retailInvoiceReturnPolicy);
  return parsed.success ? parsed.data : { ...DEFAULT_RETAIL_INVOICE_RETURN_POLICY };
}

/** Existing return policies are frozen: a V1 USD cap still binds an old
 * request after its enterprise owner activates a new V2 currency policy. */
export function readRetailInvoiceReturnPolicySnapshot(snapshot: Prisma.JsonValue | null | undefined): RetailInvoiceReturnPolicy {
  const parsed = storedRetailInvoiceReturnPolicySchema.safeParse(snapshot);
  return parsed.success ? parsed.data : { ...DEFAULT_RETAIL_INVOICE_RETURN_POLICY };
}

export function mergeRetailInvoiceReturnPolicy(
  settings: Prisma.JsonValue | null | undefined,
  policy: ConfigurableRetailInvoiceReturnPolicy,
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
