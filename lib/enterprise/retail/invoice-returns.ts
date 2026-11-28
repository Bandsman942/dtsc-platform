import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { readPhysicalReturnLots, planPhysicalInvoiceReturnLots } from "@/lib/enterprise/inventory/lot-allocation";
import { exactInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";

// @prisma/client Decimal does not expose the static Decimal.min/max helpers.
const decimalMin = (...values: Prisma.Decimal[]): Prisma.Decimal => values.reduce((a, b) => a.lessThan(b) ? a : b);

import { z } from "zod";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { resolveExchangeRateDetails } from "@/lib/enterprise/accounting/currency";
import { resolveEnterpriseModuleAccess, resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability, RETAIL_OWNER_ROLES, siteStaffCapabilities, hasRetailSelfApprovalGrant } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { settleUnpaidRetailInvoiceCreditTx } from "@/lib/enterprise/retail/invoice-return-unpaid-express";
import { assertRetailExpressReturnAuthorizationTx } from "@/lib/enterprise/retail/invoice-return-express-authorization";
import { prepareRetailInvoiceReturnFinanceTx, settleRetailInvoiceReturnFinanceTx } from "@/lib/enterprise/retail/invoice-return-finance";
import { readRetailInvoiceReturnPolicy, readRetailInvoiceReturnPolicySnapshot, canSelfInspectRetailReturn, type RetailInvoiceReturnPolicy } from "@/lib/enterprise/retail/invoice-return-policy";
import { prisma } from "@/lib/prisma";

// A request and its approval are NOT a refund. No Finance balance, credit
// note, stock quantity or payment changes in this module.
const quantity = z.string().trim().regex(/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?$/)
  .refine((value) => /[1-9]/.test(value));
export const retailInvoiceReturnRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  approverUserId: z.string().trim().min(1).max(191),
  reason: z.string().trim().min(4).max(1000),
  lines: z.array(z.object({
    checkoutLineId: z.string().trim().min(1).max(191),
    quantity,
    lotAllocations: z.array(z.object({ stockLotId: z.string().trim().min(1).max(191), quantity: z.string().trim().regex(/^\d{1,15}(\.\d{1,6})?$/) }).strict()).min(1).max(100).optional(),
    stockDisposition: z.enum(["RESTOCK", "QUARANTINE", "DISPOSE", "SERVICE_CREDIT", "UNDELIVERED_CREDIT"]),
  }).strict()).min(1).max(100),
}).strict();
export const retailInvoiceReturnDecisionSchema = z.object({
  revision: z.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(1000).optional(),
  refundChoice: z.enum(["NOW", "LATER"]).optional(),
  cashHandedOver: z.literal(true).optional(),
}).strict();
export const retailInvoiceReturnInspectionSchema = z.object({
  revision: z.number().int().positive(),
  receivedAndInspected: z.literal(true),
  confirmedBatchSelection: z.literal(true).optional(),
  notes: z.string().trim().min(5).max(1000),
}).strict();

type RequestInput = z.infer<typeof retailInvoiceReturnRequestSchema>;
type DecisionInput = z.infer<typeof retailInvoiceReturnDecisionSchema>;
type InspectionInput = z.infer<typeof retailInvoiceReturnInspectionSchema>;

async function readReturnStockUnits(
  db: Pick<Prisma.TransactionClient, "enterpriseInventoryItem">,
  organizationId: string,
  lines: ReadonlyArray<{ inventoryItemId: string | null }>,
) {
  const ids = [...new Set(lines.flatMap(line => line.inventoryItemId ? [line.inventoryItemId] : []))];
  if (!ids.length) return new Map<string, { decimalScale: number; symbol: string | null }>();
  const items = await db.enterpriseInventoryItem.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, catalogItem: { select: { unitOfMeasure: { select: { decimalScale: true, symbol: true } } } } },
  });
  return new Map(items.map(item => [item.id, item.catalogItem.unitOfMeasure]));
}

function monetary(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}
// Canonical Finance refund and credit-note services book at two decimal
// places. A request must never reserve an amount that those services would
// silently round at settlement time.
function financeMoney(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
function fingerprint(input: RequestInput) {
  const normalized = input.lines.map((line) => ({
    checkoutLineId: line.checkoutLineId,
    quantity: new Prisma.Decimal(line.quantity).toFixed(),
    stockDisposition: line.stockDisposition,
    ...(line.lotAllocations ? { lotAllocations: line.lotAllocations.map(row => ({ stockLotId: row.stockLotId, quantity: new Prisma.Decimal(row.quantity).toFixed() })).sort((a,b) => a.stockLotId.localeCompare(b.stockLotId)) } : {}),
  })).sort((a, b) => a.checkoutLineId.localeCompare(b.checkoutLineId));
  return createHash("sha256")
    .update(JSON.stringify({ approverUserId: input.approverUserId, reason: input.reason, lines: normalized }))
    .digest("hex");
}
function reference() {
  return "RIR-" + Date.now().toString(36).toUpperCase() + "-" + randomUUID().slice(0, 6).toUpperCase();
}
async function requireReturnFeatureTx(tx: Prisma.TransactionClient, organizationId: string) {
  const config = await tx.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const settings = config?.settingsJson;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
  }
}
async function canSelfDecideReturnTx(
  tx: Prisma.TransactionClient, organizationId: string, actorUserId: string,
  siteId: string, policy: RetailInvoiceReturnPolicy,
): Promise<boolean> {
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  if (!member) return false;
  if (policy.mode === "SIMPLIFIED" && policy.allowDelegatedSelfApproval &&
      RETAIL_OWNER_ROLES.has(member.role)) return true;
  return hasRetailSelfApprovalGrant(organizationId, actorUserId, siteId, "RETURN", tx);
}
async function requireReturnApproverTx(
  tx: Prisma.TransactionClient, organizationId: string,
  actorUserId: string, approverUserId: string, siteId: string,
  policy: RetailInvoiceReturnPolicy,
) {
  const selfAllowed = actorUserId === approverUserId &&
    await canSelfDecideReturnTx(tx, organizationId, actorUserId, siteId, policy);
  if (actorUserId === approverUserId && !selfAllowed) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SELF_APPROVAL_FORBIDDEN", 403);
  }
  await requireRetailSiteCapability(
    organizationId, approverUserId, siteId, "APPROVE_INVOICE_RETURN", tx, { requireAssignment: true },
  );
  // A delegated self-decision is strictly scoped. Inspection follows the
  // immutable policy snapshot; Finance approval and settlement remain guarded.
  if (selfAllowed) return;
  const [receivables, payments] = await Promise.all([
    resolveEnterpriseModuleAccess({
      organizationId, userId: approverUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve",
    }),
    resolveEnterpriseModuleAccess({
      organizationId, userId: approverUserId, moduleCode: "FINANCE_PAYMENTS", action: "approve",
    }),
  ]);
  if (!receivables.allowed || !payments.allowed) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
  }
}

export async function listRetailInvoiceReturnRequests(
  organizationId: string, invoiceId: string, actorUserId: string, page: number,
) {
  await requireReturnFeatureTx(prisma, organizationId);
  const liveConfig = await prisma.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const liveReturnPolicy = readRetailInvoiceReturnPolicy(liveConfig?.settingsJson);
  const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId: invoiceId },
    select: { id: true, siteId: true, warehouseId: true, stockPostedAt: true, lines: { select: { id: true, invoiceItemId: true, inventoryItemId: true, lotAllocations: true } }, invoice: { select: {
      status: true, grandTotal: true, amountPaid: true, amountCredited: true, outstandingAmount: true, currencyCode: true,
    } } },
  });
  if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
  await requireRetailSiteCapability(
    organizationId, actorUserId, checkout.siteId, "VIEW_SALES", prisma, { requireAssignment: true },
  );
  const where = { organizationId, checkoutId: checkout.id };
  const [items, total, member, siteAssignment, stockUnits] = await Promise.all([
    prisma.enterpriseRetailInvoiceReturnRequest.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25,
      select: {
        id: true, number: true, status: true, reason: true, refundAmount: true, refundPayoutAmount: true,
        requestedByUserId: true, approverUserId: true, inspectedByUserId: true,
        financeApproverUserId: true, settledByUserId: true, refundChoice: true,
        preparedByUserId: true, refundPayment: { select: { status: true, methodType: true } },
        refundLegs: { select: { refundPayment: { select: { status: true, methodType: true } } } },
        salesCreditNote: { select: { status: true } },
        inspectedAt: true, inspectionNotes: true, inspectionMode: true, returnPolicySnapshot: true, decidedAt: true, decisionReason: true,
        revision: true, createdAt: true,
        lines: { select: { id: true, checkoutLineId: true, quantity: true, refundAmount: true, stockDisposition: true, lotAllocations: true,
          checkoutLine: { select: { inventoryItemId: true } } } },
      },
    }),
    prisma.enterpriseRetailInvoiceReturnRequest.count({ where }),
    prisma.organizationMember.findFirst({
      where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null }, select: { role: true },
    }),
    prisma.enterpriseRetailSiteAssignment.findUnique({
      where: { organizationId_siteId_userId: { organizationId, siteId: checkout.siteId, userId: actorUserId } },
      select: { isActive: true, roleCode: true, permissionsJson: true },
    }),
    readReturnStockUnits(prisma, organizationId, checkout.lines),
  ]);
  const batchOptions: Record<string, Array<{ stockLotId: string; lotNumber: string; quantityIssued: string; quantityAvailable: string }>> = {};
  const splitLines = checkout.stockPostedAt ? (checkout.lines || []).filter(line => line.lotAllocations != null) : [];
  if (splitLines.length) {
    const [issues, committed] = await Promise.all([
      prisma.enterpriseStockMovement.findMany({ where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId, sourceLineId: { in: splitLines.map(line => line.invoiceItemId) }, direction: "OUT", movementType: "SALE_FULFILLMENT" }, select: { sourceLineId: true, stockLotId: true, inventoryItemId: true, warehouseId: true, quantity: true } }),
      prisma.enterpriseRetailInvoiceReturnLine.findMany({ where: { organizationId, checkoutId: checkout.id, checkoutLineId: { in: splitLines.map(line => line.id) }, request: { status: { in: ["SUBMITTED", "INSPECTED", "APPROVED", "FINANCE_PENDING", "REFUND_PENDING", "COMPLETED"] } } }, select: { checkoutLineId: true, quantity: true, stockDisposition: true, lotAllocations: true } }),
    ]);
    const lots = await prisma.enterpriseStockLot.findMany({ where: { organizationId, warehouseId: checkout.warehouseId, id: { in: [...new Set(issues.map(row => row.stockLotId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, inventoryItemId: true, lotNumber: true } });
    for (const line of splitLines) {
      const previous = committed.filter(row => row.checkoutLineId === line.id && row.stockDisposition !== "UNDELIVERED_CREDIT").flatMap(row => readPhysicalReturnLots(row.lotAllocations, row.quantity));
      const quantities = new Map<string, Prisma.Decimal>();
      for (const issue of issues.filter(row => row.sourceLineId === line.invoiceItemId && row.inventoryItemId === line.inventoryItemId && row.warehouseId === checkout.warehouseId && row.stockLotId)) {
        quantities.set(issue.stockLotId!, exactInventoryQuantity(quantities.get(issue.stockLotId!) ?? 0).plus(issue.quantity));
      }
      batchOptions[line.id] = [...quantities].flatMap(([stockLotId, issued]) => {
        const lot = lots.find(row => row.id === stockLotId && row.inventoryItemId === line.inventoryItemId);
        if (!lot) return [];
        const used = previous.filter(row => row.stockLotId === stockLotId).reduce((sum,row) => sum.plus(row.quantity), exactInventoryQuantity(0));
        return [{ stockLotId, lotNumber: lot.lotNumber, quantityIssued: issued.toFixed(), quantityAvailable: issued.gt(used) ? issued.minus(used).toFixed() : "0" }];
      });
    }
  }
  const capabilities = member && (RETAIL_OWNER_ROLES.has(member.role) || siteAssignment?.isActive)
    ? RETAIL_OWNER_ROLES.has(member.role)
      ? { canRequest: true, canInspect: true, canApprove: true }
      : {
        canRequest: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("REQUEST_INVOICE_RETURN"),
        canInspect: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("MANAGE_STOCK"),
        canApprove: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("APPROVE_INVOICE_RETURN"),
      }
    : { canRequest: false, canInspect: false, canApprove: false };
  const independentFinanceVerifier = await resolveEnterpriseModuleAccess({
    organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve",
  });
  const finance = capabilities.canApprove ? await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
    resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
  ]) : null;
  const [paymentCapabilities, receivableCapabilities] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  const selfCanDecide = await hasRetailSelfApprovalGrant(organizationId, actorUserId, checkout.siteId, "RETURN");
  const canPrepareFinance = paymentCapabilities.canCreate && paymentCapabilities.canSubmit &&
    receivableCapabilities.canCreate && receivableCapabilities.canSubmit;
  const canSettleFinance = paymentCapabilities.canWrite && receivableCapabilities.canManage;
  // Preview with the same per-currency, dated exchange-rate semantics as
  // the write path. An old V1 USD snapshot may coexist with a new owner V2
  // functional-currency limit; BOTH must permit the operation.
  const expressCandidates = items.filter(item => item.status === "INSPECTED" &&
    item.refundAmount.greaterThan(checkout.invoice.outstandingAmount));
  const expressRates = new Map<string, Prisma.Decimal>();
  let priorExpressRequests: Array<{ id: string; refundPayoutAmount: Prisma.Decimal | null; refundAmount: Prisma.Decimal }> = [];
  if (expressCandidates.length && liveReturnPolicy.mode === "SIMPLIFIED") {
    const financeConfig = liveReturnPolicy.version === 2
      ? await prisma.enterpriseFinanceConfiguration.findUnique({
          where: { organizationId }, select: { functionalCurrencyCode: true },
        }) : null;
    const liveCurrencyValid = liveReturnPolicy.version === 1 ||
      Boolean(financeConfig && financeConfig.functionalCurrencyCode === liveReturnPolicy.expressRefundLimitCurrency);
    if (liveCurrencyValid) {
      const targets = new Set([
        liveReturnPolicy.expressRefundLimitCurrency,
        ...expressCandidates.map(item =>
          readRetailInvoiceReturnPolicySnapshot(item.returnPolicySnapshot).expressRefundLimitCurrency),
      ]);
      for (const currency of targets) {
        try {
          const current = new Date();
          const resolved = await resolveExchangeRateDetails(prisma, {
            organizationId, sourceCurrencyCode: checkout.invoice.currencyCode,
            targetCurrencyCode: currency, rateDate: current,
          });
          if (resolved.direction === "IDENTITY" || current.getTime() - resolved.rateDate.getTime() <= 7 * 86400000) {
            expressRates.set(currency, resolved.rate);
          }
        } catch { /* Missing/stale FX: fail closed; standard Finance stays open. */ }
      }
    }
    priorExpressRequests = await prisma.enterpriseRetailInvoiceReturnRequest.findMany({
      where: { organizationId, checkoutId: checkout.id,
        status: { in: ["APPROVED", "FINANCE_PENDING", "REFUND_PENDING", "COMPLETED"] } },
      select: { id: true, refundPayoutAmount: true, refundAmount: true },
    });
  }
  return {
    items: items.map((item) => {
      const payoutStatuses = item.refundLegs.length
        ? item.refundLegs.map((leg) => leg.refundPayment.status)
        : item.refundPayment ? [item.refundPayment.status] : [];
      const payoutMethods = item.refundLegs.length
        ? item.refundLegs.map((leg) => leg.refundPayment.methodType)
        : item.refundPayment ? [item.refundPayment.methodType] : [];
      const approvedPayouts = payoutStatuses.filter((status) => status === "APPROVED").length;
      const policy = readRetailInvoiceReturnPolicySnapshot(item.returnPolicySnapshot);
      const eligibleSelfInspector = Boolean(member && (RETAIL_OWNER_ROLES.has(member.role) ||
        (siteAssignment?.isActive && siteAssignment.roleCode === "MANAGER")));
      const physicalStock = Boolean(checkout.stockPostedAt) &&
        item.lines.some((line) => Boolean(line.checkoutLine.inventoryItemId));
      const selfInspected = liveReturnPolicy.mode === "SIMPLIFIED" &&
        liveReturnPolicy.allowRequesterInspection &&
        canSelfInspectRetailReturn(policy, item.requestedByUserId, actorUserId,
          eligibleSelfInspector, true);
      const delegatedSelfDecision = selfCanDecide ||
        Boolean(member && RETAIL_OWNER_ROLES.has(member.role) &&
          policy.mode === "SIMPLIFIED" && policy.allowDelegatedSelfApproval &&
          liveReturnPolicy.mode === "SIMPLIFIED" && liveReturnPolicy.allowDelegatedSelfApproval);
      const sameActorDecision = item.inspectedByUserId === actorUserId &&
        item.requestedByUserId === actorUserId && selfInspected && delegatedSelfDecision;
      const previewPayout = item.refundAmount.greaterThan(checkout.invoice.outstandingAmount)
        ? item.refundAmount.minus(checkout.invoice.outstandingAmount)
        : new Prisma.Decimal(0);
      const priorPayout = priorExpressRequests.filter(row => row.id !== item.id).reduce((amount, row) =>
        amount.plus(row.refundPayoutAmount ?? row.refundAmount), new Prisma.Decimal(0));
      const limits = [policy, liveReturnPolicy];
      const hasRequiredRates = limits.every(limit => expressRates.has(limit.expressRefundLimitCurrency));
      const withinExpressCap = hasRequiredRates && limits.every(limit => {
        const rate = expressRates.get(limit.expressRefundLimitCurrency)!;
        return priorPayout.plus(previewPayout).times(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP)
          .lessThanOrEqualTo(new Prisma.Decimal(limit.expressRefundLimitAmount));
      });
      const expressEligible = withinExpressCap && policy.mode === "SIMPLIFIED" && liveReturnPolicy.mode === "SIMPLIFIED" &&
        policy.autoPostCreditNote && liveReturnPolicy.autoPostCreditNote &&
        policy.allowDelegatedSelfApproval && liveReturnPolicy.allowDelegatedSelfApproval &&
        policy.promptImmediateRefund && liveReturnPolicy.promptImmediateRefund &&
        capabilities.canApprove && delegatedSelfDecision && item.approverUserId === actorUserId &&
        item.status === "INSPECTED";
      return {
      id: item.id, number: item.number, status: item.status, reason: item.reason,
      refundAmount: item.refundAmount, refundPayoutAmount: item.refundPayoutAmount, inspectedAt: item.inspectedAt,
      inspectionNotes: item.inspectionNotes, inspectionMode: item.inspectionMode, decidedAt: item.decidedAt,
      payoutPreviewAmount: previewPayout.toFixed(2), canExpress: expressEligible, refundChoice: item.refundChoice,
      expressCapAmount: String(liveReturnPolicy.expressRefundLimitAmount),
      expressCapCurrency: liveReturnPolicy.expressRefundLimitCurrency,
      historicalCapEnforced: policy.version === 1 && liveReturnPolicy.version === 2,
      expressLimitFallback: !expressEligible && policy.mode === "SIMPLIFIED" && liveReturnPolicy.mode === "SIMPLIFIED" && item.status === "INSPECTED" && previewPayout.greaterThan(0)
        ? (!hasRequiredRates ? "FX_RATE_REQUIRED_OR_STALE" : !withinExpressCap ? "LIMIT_EXCEEDED" : "STANDARD_APPROVAL_REQUIRED") : null,
      deferredCashDisbursementRequired: item.status === "REFUND_PENDING" && payoutMethods.includes("CASH"),
      canFinalizeDeferred: item.status === "REFUND_PENDING" && item.refundChoice === "LATER" &&
        item.settledByUserId === actorUserId && item.financeApproverUserId === actorUserId &&
        liveReturnPolicy.mode === "SIMPLIFIED" && liveReturnPolicy.allowDelegatedSelfApproval &&
        Boolean(member && (RETAIL_OWNER_ROLES.has(member.role) || siteAssignment?.isActive && siteAssignment.roleCode === "MANAGER")) &&
        capabilities.canApprove && delegatedSelfDecision &&
        payoutStatuses.length > 0 && payoutStatuses.every((status, index) =>
          payoutMethods[index] === "CASH" ? status === "APPROVED" :
          ["CONFIRMED", "RECONCILED"].includes(status)) &&
        item.salesCreditNote?.status === "POSTED",
      decisionReason: item.decisionReason, revision: item.revision,
      createdAt: item.createdAt, lines: item.lines,
      paymentApprovalStatus: payoutStatuses.length && approvedPayouts === payoutStatuses.length
        ? "APPROVED" : item.refundPayment?.status || null,
      paymentApprovalCount: approvedPayouts,
      paymentApprovalTotal: payoutStatuses.length,
      creditApprovalStatus: item.salesCreditNote?.status || null,
      canPrepareFinance: canPrepareFinance && item.status === "APPROVED" &&
        item.requestedByUserId !== actorUserId && item.approverUserId !== actorUserId,
      canSettleFinance: canSettleFinance && item.status === "FINANCE_PENDING" &&
        (item.refundPayoutAmount?.isZero() || payoutStatuses.length > 0) &&
        approvedPayouts === payoutStatuses.length &&
        item.salesCreditNote?.status === "APPROVED" &&
        ![item.requestedByUserId, item.approverUserId, item.inspectedByUserId,
          item.preparedByUserId].includes(actorUserId),
      requiresPhysicalInspection: physicalStock,
      canSelfInspect: selfInspected,
      canInspect: (capabilities.canInspect || selfInspected ||
          ((!checkout.stockPostedAt || item.lines.every((line) => !line.checkoutLine.inventoryItemId)) && independentFinanceVerifier.allowed)) &&
        item.status === "SUBMITTED" &&
        ((item.requestedByUserId !== actorUserId && item.approverUserId !== actorUserId) || selfInspected),
      canDecide: capabilities.canApprove &&
        (finance?.every((entry) => entry.allowed) === true || (item.requestedByUserId === actorUserId && delegatedSelfDecision)) &&
        ["SUBMITTED", "INSPECTED"].includes(item.status) && item.approverUserId === actorUserId &&
        (item.requestedByUserId !== actorUserId || delegatedSelfDecision) &&
        (item.inspectedByUserId !== actorUserId || sameActorDecision),
    }; }),
    batchOptions,
    stockUnits: Object.fromEntries(checkout.lines.flatMap(line => {
      const unit = line.inventoryItemId && stockUnits.get(line.inventoryItemId);
      return unit ? [[line.id, unit] as const] : [];
    })),
    stockPostedAt: Boolean(checkout.stockPostedAt),
    canRequest: capabilities.canRequest && ["PAID", "CREDIT_NOTE", "PARTIALLY_PAID", "ISSUED", "OVERDUE"].includes(checkout.invoice.status) &&
      checkout.invoice.amountPaid.plus(checkout.invoice.amountCredited).plus(checkout.invoice.outstandingAmount).equals(checkout.invoice.grandTotal),
    pagination: { page, pageSize: 25, total, pageCount: Math.max(1, Math.ceil(total / 25)) },
  };
}

/** Only active enterprise members independently capable of approving Retail
 * returns in THIS store and in the canonical Finance receivables module. */
export async function listRetailInvoiceReturnApprovers(
  organizationId: string, actorUserId: string, siteId: string,
) {
  await requireReturnFeatureTx(prisma, organizationId);
  const site = await prisma.enterpriseSite.findFirst({
    where: { organizationId, id: siteId, status: "ACTIVE", archivedAt: null }, select: { id: true },
  });
  if (!site) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  await requireRetailSiteCapability(
    organizationId, actorUserId, siteId, "REQUEST_INVOICE_RETURN", prisma, { requireAssignment: true },
  );
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null },
    take: 250, orderBy: { user: { name: "asc" } },
    select: { userId: true, role: true, positionTitle: true, user: { select: { name: true } } },
  });
  const assignments = await prisma.enterpriseRetailSiteAssignment.findMany({
    where: { organizationId, siteId, isActive: true, userId: { in: members.map((member) => member.userId) } },
    select: { userId: true, roleCode: true, permissionsJson: true },
  });
  const siteAccess = new Map(assignments.map((assignment) => [assignment.userId, assignment]));
  const eligible = members.filter((member) => {
    if (RETAIL_OWNER_ROLES.has(member.role)) return true;
    const assignment = siteAccess.get(member.userId);
    return Boolean(assignment && siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("APPROVE_INVOICE_RETURN"));
  });
  const config = await prisma.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const policy = readRetailInvoiceReturnPolicy(config?.settingsJson);
  const requester = members.find((member) => member.userId === actorUserId);
  const selfReturnGrant = requester && RETAIL_OWNER_ROLES.has(requester.role) &&
    policy.mode === "SIMPLIFIED" && policy.allowDelegatedSelfApproval
    ? true : await hasRetailSelfApprovalGrant(organizationId, actorUserId, siteId, "RETURN");
  const candidates = await Promise.all(eligible.map(async (member) => {
    if (member.userId === actorUserId) {
      return selfReturnGrant ? {
        userId: member.userId, name: member.user.name, positionTitle: member.positionTitle,
        role: member.role, isRequester: true, selfApprovalOverride: true,
      } : null;
    }
    const access = await Promise.all([
      resolveEnterpriseModuleAccess({ organizationId, userId: member.userId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      resolveEnterpriseModuleAccess({ organizationId, userId: member.userId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
    ]);
    return access.every((entry) => entry.allowed) ? {
      userId: member.userId, name: member.user.name, positionTitle: member.positionTitle,
      role: member.role, isRequester: member.userId === actorUserId, selfApprovalOverride: member.userId === actorUserId,
    } : null;
  }));
  return { candidates: candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)) };
}

export async function createRetailInvoiceReturnRequest(
  organizationId: string, invoiceId: string, actorUserId: string, input: RequestInput,
) {
  const requestHash = fingerprint(input);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await requireReturnFeatureTx(tx, organizationId);
    const returnConfiguration = await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const returnPolicy = readRetailInvoiceReturnPolicy(returnConfiguration?.settingsJson);
    const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: { invoice: { select: { status: true, grandTotal: true, currencyCode: true,
        amountPaid: true, amountCredited: true, outstandingAmount: true } },
        lines: { include: { invoiceItem: { select: { quantity: true, totalAmount: true, netAmount: true, taxAmount: true } } } } },
    });
    if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
    await requireRetailSiteCapability(
      organizationId, actorUserId, checkout.siteId, "REQUEST_INVOICE_RETURN", tx, { requireAssignment: true },
    );
    // Actor and site are revalidated before returning an idempotent response.
    const existing = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { lines: true },
    });
    if (existing) {
      if (existing.checkoutId !== checkout.id || existing.requestedByUserId !== actorUserId ||
          existing.requestFingerprint !== requestHash) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_IDEMPOTENCY_CONFLICT", 409);
      }
      return { request: existing, idempotent: true };
    }
    if (!["PAID", "CREDIT_NOTE", "PARTIALLY_PAID", "ISSUED", "OVERDUE"].includes(checkout.invoice.status) ||
        checkout.invoice.outstandingAmount.isNegative() ||
        !checkout.invoice.amountPaid.plus(checkout.invoice.amountCredited).plus(checkout.invoice.outstandingAmount).equals(checkout.invoice.grandTotal)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_PAID_REQUIRED", 409);
    }
    if (!checkout.invoice.grandTotal.equals(financeMoney(checkout.invoice.grandTotal))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
    }
    await requireReturnApproverTx(tx, organizationId, actorUserId, input.approverUserId, checkout.siteId, returnPolicy);
    const lineIds = input.lines.map((row) => row.checkoutLineId);
    if (new Set(lineIds).size !== lineIds.length) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_DUPLICATE_LINE", 409);
    const source = new Map(checkout.lines.map((line) => [line.id, line]));
    if (lineIds.some((id) => !source.has(id))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_LINE_INVALID", 409);
    }
    const stockUnits = await readReturnStockUnits(tx, organizationId, lineIds.map(id => source.get(id)!));
    const committed = await tx.enterpriseRetailInvoiceReturnLine.findMany({
      where: {
        organizationId, checkoutId: checkout.id, checkoutLineId: { in: lineIds },
        request: { status: { in: ["SUBMITTED", "INSPECTED", "APPROVED", "FINANCE_PENDING", "REFUND_PENDING", "COMPLETED"] } },
      },
      select: { checkoutLineId: true, quantity: true, refundAmount: true, refundNetAmount: true, refundTaxAmount: true, stockDisposition: true, lotAllocations: true, request: { select: { status: true } } },
    });
    const previousQuantity = new Map<string, Prisma.Decimal>();
    const previousAmount = new Map<string, Prisma.Decimal>();
    const previousNet = new Map<string, Prisma.Decimal>();
    const previousTax = new Map<string, Prisma.Decimal>();
    for (const row of committed) {
      if (row.refundNetAmount === null || row.refundTaxAmount === null ||
          !row.refundNetAmount.plus(row.refundTaxAmount).equals(row.refundAmount)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
      }
      previousQuantity.set(row.checkoutLineId,
        exactInventoryQuantity(previousQuantity.get(row.checkoutLineId) ?? 0).plus(row.quantity));
      previousAmount.set(row.checkoutLineId,
        (previousAmount.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundAmount));
      previousNet.set(row.checkoutLineId,
        (previousNet.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundNetAmount));
      previousTax.set(row.checkoutLineId,
        (previousTax.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundTaxAmount));
    }
    const prepared = await Promise.all(input.lines.map(async (entry) => {
      const line = source.get(entry.checkoutLineId)!;
      const value = exactInventoryQuantity(entry.quantity);
      // Historic checkouts may have no surviving catalog proof. Keep the
      // six-place ledger limit for those requests and preserve their history.
      const stockUnit = line.inventoryItemId && stockUnits.get(line.inventoryItemId);
      if (line.inventoryItemId) {
        const scale = stockUnit ? stockUnit.decimalScale : 6;
        if (value.decimalPlaces() > scale || entry.lotAllocations?.some(batch => new Prisma.Decimal(batch.quantity).decimalPlaces() > scale)) {
          throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION", 409);
        }
      }
      let batchSelection: ReturnType<typeof readPhysicalReturnLots> | null = null;
      if (checkout.stockPostedAt && line.lotAllocations != null) {
        const related = await tx.enterpriseStockMovement.findMany({ where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId, sourceLineId: line.invoiceItemId, direction: "OUT", movementType: "SALE_FULFILLMENT" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (related.some(row => row.warehouseId !== checkout.warehouseId || row.inventoryItemId !== line.inventoryItemId)) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID", 409);
        const previous = committed.filter(row => row.checkoutLineId === line.id);
        if (previous.some(row => row.stockDisposition === "UNDELIVERED_CREDIT" && row.request.status !== "COMPLETED")) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID", 409);
        try {
          batchSelection = readPhysicalReturnLots(entry.lotAllocations, value);
          planPhysicalInvoiceReturnLots({ source: line, movements: related, previous, quantity: value, selected: batchSelection });
        } catch (error) { throw new EnterpriseRetailError(error instanceof Error ? error.message : "RETAIL_INVOICE_RETURN_BATCH_SELECTION_REQUIRED", 409); }
      } else if (entry.lotAllocations) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_BATCH_SELECTION_REQUIRED", 409);
      const priorQty = previousQuantity.get(line.id) || new Prisma.Decimal(0);
      const priorAmount = previousAmount.get(line.id) || new Prisma.Decimal(0);
      const priorNet = previousNet.get(line.id) || new Prisma.Decimal(0);
      const priorTax = previousTax.get(line.id) || new Prisma.Decimal(0);
      const left = exactInventoryQuantity(line.invoiceItem.quantity).minus(priorQty);
      if (!value.greaterThan(0) || value.greaterThan(left)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED", 409);
      }
      // Never report a phantom physical return or put goods back in stock
      // if their original invoice has not yet posted a sale-fulfilment exit.
      const expectedUnfulfilled = Boolean(line.inventoryItemId) && !checkout.stockPostedAt;
      if ((!line.inventoryItemId && entry.stockDisposition !== "SERVICE_CREDIT") ||
          (expectedUnfulfilled && entry.stockDisposition !== "UNDELIVERED_CREDIT") ||
          (line.inventoryItemId && checkout.stockPostedAt && !["RESTOCK", "QUARANTINE", "DISPOSE"].includes(entry.stockDisposition))) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_STOCK_DISPOSITION_INVALID", 409);
      }
      const invoiceItem = line.invoiceItem;
      if (!invoiceItem.totalAmount.equals(financeMoney(invoiceItem.totalAmount)) ||
          !invoiceItem.netAmount.equals(financeMoney(invoiceItem.netAmount)) ||
          !invoiceItem.taxAmount.equals(financeMoney(invoiceItem.taxAmount)) ||
          !invoiceItem.netAmount.plus(invoiceItem.taxAmount).equals(invoiceItem.totalAmount) ||
          !priorAmount.equals(financeMoney(priorAmount)) ||
          !priorNet.equals(financeMoney(priorNet)) || !priorTax.equals(financeMoney(priorTax))) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
      }
      const remainingAmount = invoiceItem.totalAmount.minus(priorAmount);
      const remainingNet = invoiceItem.netAmount.minus(priorNet);
      const remainingTax = invoiceItem.taxAmount.minus(priorTax);
      if (remainingAmount.lessThanOrEqualTo(0) || remainingNet.lessThan(0) || remainingTax.lessThan(0) ||
          !remainingNet.plus(remainingTax).equals(remainingAmount)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
      }
      const proportional = monetary(invoiceItem.totalAmount.times(value).div(invoiceItem.quantity));
      // Preserve the last-cent remainder on the final quantity return. Three
      // successive 1/3 returns of 100.00 therefore yield 33.33, 33.33, 33.34.
      const amount = value.equals(left) ? remainingAmount : decimalMin(financeMoney(proportional), remainingAmount);
      if (!amount.greaterThan(0)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_AMOUNT_BELOW_MINOR_UNIT", 409);
      }
      const taxProportional = financeMoney(invoiceItem.taxAmount.times(value).div(invoiceItem.quantity));
      const refundTaxAmount = value.equals(left) ? remainingTax :
        decimalMin(taxProportional, remainingTax, amount);
      const refundNetAmount = amount.minus(refundTaxAmount);
      if (refundNetAmount.lessThan(0) || refundNetAmount.greaterThan(remainingNet) ||
          !refundNetAmount.plus(refundTaxAmount).equals(amount)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
      }
      return {
        organizationId, checkoutId: checkout.id, checkoutLineId: line.id,
        quantity: value, refundAmount: amount, refundNetAmount, refundTaxAmount,
        stockDisposition: entry.stockDisposition,
        ...(batchSelection ? { lotAllocations: batchSelection } : {}),
      };
    }));
    const refundAmount = financeMoney(prepared.reduce(
      (sum, line) => sum.plus(line.refundAmount), new Prisma.Decimal(0),
    ));
    if (!refundAmount.greaterThan(0) || refundAmount.greaterThan(checkout.invoice.grandTotal)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_AMOUNT_INVALID", 409);
    }
    const created = await tx.enterpriseRetailInvoiceReturnRequest.create({
      data: {
        organizationId, checkoutId: checkout.id, number: reference(), status: "SUBMITTED",
        reason: input.reason, refundAmount, idempotencyKey: input.idempotencyKey,
        requestFingerprint: requestHash, requestedByUserId: actorUserId,
        approverUserId: input.approverUserId, returnPolicySnapshot: returnPolicy,
      },
    });
    await tx.enterpriseRetailInvoiceReturnLine.createMany({
      data: prepared.map((line) => ({ ...line, returnRequestId: created.id })),
    });
    const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { organizationId, id: created.id }, include: { lines: true },
    });
    if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 409);
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_REQUESTED", summary: "Retail invoice return submitted for independent review",
      actorUserId, toStatus: "SUBMITTED",
      metadataJson: { invoiceId, checkoutId: checkout.id, siteId: checkout.siteId,
        approverUserId: input.approverUserId, amount: refundAmount.toFixed(),
        currencyCode: checkout.invoice.currencyCode },
    });
    return { request, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
}

export async function decideRetailInvoiceReturnRequest(
  organizationId: string, invoiceId: string, requestId: string, actorUserId: string, input: DecisionInput,
) {
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await requireReturnFeatureTx(tx, organizationId);
    const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { id: requestId, organizationId, checkout: { salesInvoiceId: invoiceId } },
      include: { checkout: { select: { siteId: true } } },
    });
    if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
    await requireRetailSiteCapability(
      organizationId, actorUserId, request.checkout.siteId, "APPROVE_INVOICE_RETURN", tx, { requireAssignment: true },
    );
    const policy = readRetailInvoiceReturnPolicySnapshot(request.returnPolicySnapshot);
    const config = await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const livePolicy = readRetailInvoiceReturnPolicy(config?.settingsJson);
    const effectivePolicy = policy.mode === "SIMPLIFIED" && policy.allowDelegatedSelfApproval &&
      livePolicy.mode === "SIMPLIFIED" && livePolicy.allowDelegatedSelfApproval
      ? policy : { ...policy, mode: "STANDARD" as const };
    const selfReturnDecision = request.requestedByUserId === actorUserId &&
      await canSelfDecideReturnTx(tx, organizationId, actorUserId, request.checkout.siteId, effectivePolicy);
    if (request.approverUserId !== actorUserId ||
        (request.requestedByUserId === actorUserId && !selfReturnDecision)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
    const finance = await Promise.all([
      resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
    ]);
    if (!selfReturnDecision && !finance.every((entry) => entry.allowed)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
    if (request.revision !== input.revision ||
      (input.decision === "APPROVE" ? request.status !== "INSPECTED" :
        !["SUBMITTED", "INSPECTED"].includes(request.status))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REVISION_CONFLICT", 409);
    }
    const selfInspectionAllowed = policy.mode === "SIMPLIFIED" && policy.allowRequesterInspection &&
      livePolicy.mode === "SIMPLIFIED" && livePolicy.allowRequesterInspection &&
      request.inspectedByUserId === request.requestedByUserId && request.inspectionMode === "SELF_ATTESTED";
    const sameActorInspectionApproved = selfInspectionAllowed &&
      request.inspectedByUserId === actorUserId && selfReturnDecision;
    if (input.decision === "APPROVE" &&
      (!request.inspectedAt || !request.inspectedByUserId || !request.inspectionNotes ||
        request.inspectionNotes.trim().length < 5 ||
        (request.inspectedByUserId === request.requestedByUserId && !selfInspectionAllowed) ||
        (request.inspectedByUserId === actorUserId && !sameActorInspectionApproved))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_INSPECTION_REQUIRED", 409);
    }
    if (input.decision === "REJECT" && (!input.reason || input.reason.length < 4)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REJECTION_REASON_REQUIRED", 400);
    }
    const nextStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseRetailInvoiceReturnRequest.update({
      where: { id: request.id }, data: {
        status: nextStatus, decidedByUserId: actorUserId, decidedAt: new Date(),
        decisionReason: input.reason || null, revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_" + nextStatus,
      summary: "Retail invoice return reviewed: " + nextStatus,
      actorUserId, fromStatus: request.status, toStatus: nextStatus,
      metadataJson: { invoiceId, siteId: request.checkout.siteId,
        ownerGrantedSelfApproval: request.requestedByUserId === actorUserId,
        ...(input.reason ? { reason: input.reason } : {}) },
    });
    // Zero-payout credits are posted automatically if the invoice is not
    // physically fulfilled, regardless of whether it was totally unpaid or
    // partly collected. No refund payment is ever fabricated.
    if (input.decision === "APPROVE") {
      const zeroPayout = await settleUnpaidRetailInvoiceCreditTx(
        tx, organizationId, invoiceId, requestId, actorUserId,
      );
      if (zeroPayout) return zeroPayout;
      // Any real customer payout must be chosen BEFORE committing the
      // decision. Zero-payout physical returns do not prompt for cash and
      // can post their credit plus inventory valuation in the same transaction.
      let expressChoice = input.refundChoice || null;
      const eligibleZeroCredit = !expressChoice && policy.mode === "SIMPLIFIED" &&
        livePolicy.mode === "SIMPLIFIED" && policy.autoPostCreditNote &&
        livePolicy.autoPostCreditNote && policy.allowDelegatedSelfApproval &&
        livePolicy.allowDelegatedSelfApproval;
      if (eligibleZeroCredit) {
        const invoice = await tx.enterpriseSalesInvoice.findFirst({
          where: { organizationId, id: invoiceId },
          select: { outstandingAmount: true },
        });
        if (invoice && request.refundAmount.lessThanOrEqualTo(invoice.outstandingAmount)) {
          expressChoice = "LATER";
        }
      }
      if (expressChoice) {
        if (expressChoice === "NOW" && input.cashHandedOver !== true) {
          throw new EnterpriseRetailError("RETAIL_RETURN_EXPRESS_CASH_HANDOVER_REQUIRED", 400);
        }
        await assertRetailExpressReturnAuthorizationTx(
          tx, organizationId, invoiceId, requestId, actorUserId, expressChoice,
          eligibleZeroCredit && !input.refundChoice,
        );
        const prepared = await prepareRetailInvoiceReturnFinanceTx(
          tx, organizationId, invoiceId, requestId, actorUserId,
          { revision: updated.revision, financeApproverUserId: actorUserId },
          expressChoice,
        );
        const settled = await settleRetailInvoiceReturnFinanceTx(
          tx, organizationId, invoiceId, requestId, actorUserId,
          { revision: prepared.request.revision,
            reason: input.reason?.trim() || "Retour client express approuvé et contrôlé" },
          expressChoice,
        );
        return settled.request;
      }
    }
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }));
}

/** Independent stock operator records physical receipt/inspection. This is
 * evidence only: even inspected returns never change stock or cash before the
 * canonical Finance/Inventory settlement is built and certified. */
export async function inspectRetailInvoiceReturnRequest(
  organizationId: string, invoiceId: string, requestId: string,
  actorUserId: string, input: InspectionInput,
) {
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await requireReturnFeatureTx(tx, organizationId);
    const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { id: requestId, organizationId, checkout: { salesInvoiceId: invoiceId } },
      include: { checkout: { select: { siteId: true, stockPostedAt: true,
        invoice: { select: { status: true } } } },
        lines: { select: { quantity: true, lotAllocations: true, checkoutLine: { select: { inventoryItemId: true, lotAllocations: true } } } } },
    });
    if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
    const physicallyDeliveredGoods = Boolean(request.checkout.stockPostedAt) &&
      request.lines.some((line) => Boolean(line.checkoutLine.inventoryItemId));
    // Always bind the verifier to this store first. Independent Finance users
    // may verify a service or undelivered cancellation without inventing a
    // physical-stock inspection, but never inspect a posted goods return.
    await requireRetailSiteCapability(
      organizationId, actorUserId, request.checkout.siteId, "VIEW_SALES", tx, { requireAssignment: true },
    );
    // An authorized manager's SELF_ATTESTED receipt is evidence only.
    // It must not grant MANAGE_STOCK or allow physical stock mutations.
    const [verifier, membership] = await Promise.all([
      tx.enterpriseRetailSiteAssignment.findUnique({ where: { organizationId_siteId_userId: { organizationId, siteId: request.checkout.siteId, userId: actorUserId } }, select: { isActive: true, roleCode: true, permissionsJson: true } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null }, select: { role: true } }),
    ]);
    const canInspectGoods = Boolean(membership && (RETAIL_OWNER_ROLES.has(membership.role) ||
      (verifier?.isActive && siteStaffCapabilities(verifier.roleCode, verifier.permissionsJson).includes("MANAGE_STOCK"))));
    const policy = readRetailInvoiceReturnPolicySnapshot(request.returnPolicySnapshot);
    const liveConfig = await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const livePolicy = readRetailInvoiceReturnPolicy(liveConfig?.settingsJson);
    const eligibleSelfInspector = Boolean(membership && (RETAIL_OWNER_ROLES.has(membership.role) ||
      (verifier?.isActive && verifier.roleCode === "MANAGER")));
    const selfInspector = livePolicy.mode === "SIMPLIFIED" && livePolicy.allowRequesterInspection &&
      canSelfInspectRetailReturn(policy, request.requestedByUserId, actorUserId,
        eligibleSelfInspector, true);
    if (physicallyDeliveredGoods && !selfInspector) {
      await requireRetailSiteCapability(
        organizationId, actorUserId, request.checkout.siteId, "MANAGE_STOCK", tx, { requireAssignment: true },
      );
    }
    if (physicallyDeliveredGoods && !canInspectGoods && !selfInspector) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE", 403);
    }
    if (!physicallyDeliveredGoods && !canInspectGoods && !selfInspector) {
      const finance = await resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" });
      if (!finance.allowed) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE", 403);
    }
    if ((actorUserId === request.requestedByUserId || actorUserId === request.approverUserId) && !selfInspector) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE", 403);
    }
    if (request.status !== "SUBMITTED" || request.revision !== input.revision ||
      !["PAID", "CREDIT_NOTE", "PARTIALLY_PAID", "ISSUED", "OVERDUE"].includes(request.checkout.invoice.status)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REVISION_CONFLICT", 409);
    }
    for (const line of request.lines) {
      if (request.checkout.stockPostedAt && line.checkoutLine.lotAllocations != null) {
        if (!input.confirmedBatchSelection) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_BATCH_SELECTION_REQUIRED", 409);
        try { readPhysicalReturnLots(line.lotAllocations, line.quantity); } catch { throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_BATCH_SELECTION_REQUIRED", 409); }
      }
    }
    const inspected = await tx.enterpriseRetailInvoiceReturnRequest.update({
      where: { id: request.id }, data: {
        status: "INSPECTED", inspectedByUserId: actorUserId, inspectedAt: new Date(),
        inspectionNotes: input.notes, inspectionMode: selfInspector ? "SELF_ATTESTED" : "INDEPENDENT",
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_INSPECTED",
      summary: selfInspector ? "Retail return received and inspected by authorized requester" :
        physicallyDeliveredGoods ? "Retail physical return independently inspected" : "Retail service/undelivered credit independently verified",
      actorUserId, fromStatus: "SUBMITTED", toStatus: "INSPECTED",
      metadataJson: { invoiceId, siteId: request.checkout.siteId,
        inspectionMode: selfInspector ? "SELF_ATTESTED" : "INDEPENDENT", policyVersion: policy.version },
    });
    return inspected;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
}
