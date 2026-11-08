import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { resolveEnterpriseModuleAccess, resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability, RETAIL_OWNER_ROLES, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
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
    stockDisposition: z.enum(["RESTOCK", "QUARANTINE", "DISPOSE"]),
  }).strict()).min(1).max(100),
}).strict();
export const retailInvoiceReturnDecisionSchema = z.object({
  revision: z.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(1000).optional(),
}).strict();
export const retailInvoiceReturnInspectionSchema = z.object({
  revision: z.number().int().positive(),
  receivedAndInspected: z.literal(true),
  notes: z.string().trim().min(5).max(1000),
}).strict();

type RequestInput = z.infer<typeof retailInvoiceReturnRequestSchema>;
type DecisionInput = z.infer<typeof retailInvoiceReturnDecisionSchema>;
type InspectionInput = z.infer<typeof retailInvoiceReturnInspectionSchema>;

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
async function requireReturnApproverTx(
  tx: Prisma.TransactionClient, organizationId: string,
  actorUserId: string, approverUserId: string, siteId: string,
) {
  if (actorUserId === approverUserId) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SELF_APPROVAL_FORBIDDEN", 403);
  }
  await requireRetailSiteCapability(
    organizationId, approverUserId, siteId, "APPROVE_INVOICE_RETURN", tx, { requireAssignment: true },
  );
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
  const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId: invoiceId },
    select: { id: true, siteId: true, stockPostedAt: true, invoice: { select: {
      status: true, grandTotal: true, amountPaid: true, amountCredited: true, outstandingAmount: true,
    } } },
  });
  if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
  await requireRetailSiteCapability(
    organizationId, actorUserId, checkout.siteId, "VIEW_SALES", prisma, { requireAssignment: true },
  );
  const where = { organizationId, checkoutId: checkout.id };
  const [items, total, member, siteAssignment] = await Promise.all([
    prisma.enterpriseRetailInvoiceReturnRequest.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25,
      select: {
        id: true, number: true, status: true, reason: true, refundAmount: true,
        requestedByUserId: true, approverUserId: true, inspectedByUserId: true,
        preparedByUserId: true, refundPayment: { select: { status: true } },
        refundLegs: { select: { refundPayment: { select: { status: true } } } },
        salesCreditNote: { select: { status: true } },
        inspectedAt: true, inspectionNotes: true, decidedAt: true, decisionReason: true,
        revision: true, createdAt: true,
        lines: { select: { id: true, checkoutLineId: true, quantity: true, refundAmount: true, stockDisposition: true } },
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
  ]);
  const capabilities = member && (RETAIL_OWNER_ROLES.has(member.role) || siteAssignment?.isActive)
    ? RETAIL_OWNER_ROLES.has(member.role)
      ? { canRequest: true, canInspect: true, canApprove: true }
      : {
        canRequest: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("REQUEST_INVOICE_RETURN"),
        canInspect: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("MANAGE_STOCK"),
        canApprove: siteStaffCapabilities(siteAssignment!.roleCode, siteAssignment!.permissionsJson).includes("APPROVE_INVOICE_RETURN"),
      }
    : { canRequest: false, canInspect: false, canApprove: false };
  const finance = capabilities.canApprove ? await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
    resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
  ]) : null;
  const [paymentCapabilities, receivableCapabilities] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  const canPrepareFinance = paymentCapabilities.canCreate && paymentCapabilities.canSubmit &&
    receivableCapabilities.canCreate && receivableCapabilities.canSubmit;
  const canSettleFinance = paymentCapabilities.canWrite && receivableCapabilities.canManage;
  return {
    items: items.map((item) => {
      const payoutStatuses = item.refundLegs.length
        ? item.refundLegs.map((leg) => leg.refundPayment.status)
        : item.refundPayment ? [item.refundPayment.status] : [];
      const approvedPayouts = payoutStatuses.filter((status) => status === "APPROVED").length;
      return {
      id: item.id, number: item.number, status: item.status, reason: item.reason,
      refundAmount: item.refundAmount, inspectedAt: item.inspectedAt,
      inspectionNotes: item.inspectionNotes, decidedAt: item.decidedAt,
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
        payoutStatuses.length > 0 && approvedPayouts === payoutStatuses.length &&
        item.salesCreditNote?.status === "APPROVED" &&
        ![item.requestedByUserId, item.approverUserId, item.inspectedByUserId,
          item.preparedByUserId].includes(actorUserId),
      canInspect: capabilities.canInspect && item.status === "SUBMITTED" &&
        item.requestedByUserId !== actorUserId && item.approverUserId !== actorUserId,
      canDecide: capabilities.canApprove && finance?.every((entry) => entry.allowed) === true &&
        ["SUBMITTED", "INSPECTED"].includes(item.status) && item.approverUserId === actorUserId &&
        item.requestedByUserId !== actorUserId && item.inspectedByUserId !== actorUserId,
    }; }),
    canRequest: capabilities.canRequest && ["PAID", "CREDIT_NOTE"].includes(checkout.invoice.status) &&
      checkout.invoice.amountPaid.plus(checkout.invoice.amountCredited).equals(checkout.invoice.grandTotal) &&
      checkout.invoice.outstandingAmount.isZero() && Boolean(checkout.stockPostedAt),
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
    where: { organizationId, status: "ACTIVE", removedAt: null, userId: { not: actorUserId } },
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
  const candidates = await Promise.all(eligible.map(async (member) => {
    const access = await Promise.all([
      resolveEnterpriseModuleAccess({ organizationId, userId: member.userId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      resolveEnterpriseModuleAccess({ organizationId, userId: member.userId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
    ]);
    return access.every((entry) => entry.allowed) ? {
      userId: member.userId, name: member.user.name, positionTitle: member.positionTitle,
      role: member.role, isRequester: false, selfApprovalOverride: false,
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
    if (!["PAID", "CREDIT_NOTE"].includes(checkout.invoice.status) || !checkout.stockPostedAt ||
        !checkout.invoice.amountPaid.plus(checkout.invoice.amountCredited).equals(checkout.invoice.grandTotal) ||
        !checkout.invoice.outstandingAmount.isZero()) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_PAID_REQUIRED", 409);
    }
    if (!checkout.invoice.grandTotal.equals(financeMoney(checkout.invoice.grandTotal))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
    }
    await requireReturnApproverTx(tx, organizationId, actorUserId, input.approverUserId, checkout.siteId);
    const lineIds = input.lines.map((row) => row.checkoutLineId);
    if (new Set(lineIds).size !== lineIds.length) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_DUPLICATE_LINE", 409);
    const source = new Map(checkout.lines.map((line) => [line.id, line]));
    if (lineIds.some((id) => !source.has(id))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_LINE_INVALID", 409);
    }
    const committed = await tx.enterpriseRetailInvoiceReturnLine.findMany({
      where: {
        organizationId, checkoutId: checkout.id, checkoutLineId: { in: lineIds },
        request: { status: { in: ["SUBMITTED", "INSPECTED", "APPROVED", "FINANCE_PENDING", "COMPLETED"] } },
      },
      select: { checkoutLineId: true, quantity: true, refundAmount: true, refundNetAmount: true, refundTaxAmount: true },
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
        (previousQuantity.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.quantity));
      previousAmount.set(row.checkoutLineId,
        (previousAmount.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundAmount));
      previousNet.set(row.checkoutLineId,
        (previousNet.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundNetAmount));
      previousTax.set(row.checkoutLineId,
        (previousTax.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundTaxAmount));
    }
    const prepared = input.lines.map((entry) => {
      const line = source.get(entry.checkoutLineId)!;
      const value = new Prisma.Decimal(entry.quantity);
      const priorQty = previousQuantity.get(line.id) || new Prisma.Decimal(0);
      const priorAmount = previousAmount.get(line.id) || new Prisma.Decimal(0);
      const priorNet = previousNet.get(line.id) || new Prisma.Decimal(0);
      const priorTax = previousTax.get(line.id) || new Prisma.Decimal(0);
      const left = line.invoiceItem.quantity.minus(priorQty);
      if (!value.greaterThan(0) || value.greaterThan(left)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED", 409);
      }
      // Inventory balances/movements store three decimal places. An invoice
      // item may have six, but a physical return cannot silently round its
      // quantity when it is later applied to the canonical stock ledger.
      if (line.inventoryItemId && value.decimalPlaces() > 3) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION", 409);
      }
      if (entry.stockDisposition === "RESTOCK" && !line.inventoryItemId) {
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
      const amount = value.equals(left) ? remainingAmount : Prisma.Decimal.min(financeMoney(proportional), remainingAmount);
      if (!amount.greaterThan(0)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_AMOUNT_BELOW_MINOR_UNIT", 409);
      }
      const taxProportional = financeMoney(invoiceItem.taxAmount.times(value).div(invoiceItem.quantity));
      const refundTaxAmount = value.equals(left) ? remainingTax :
        Prisma.Decimal.min(taxProportional, remainingTax, amount);
      const refundNetAmount = amount.minus(refundTaxAmount);
      if (refundNetAmount.lessThan(0) || refundNetAmount.greaterThan(remainingNet) ||
          !refundNetAmount.plus(refundTaxAmount).equals(amount)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED", 409);
      }
      return {
        organizationId, checkoutId: checkout.id, checkoutLineId: line.id,
        quantity: value, refundAmount: amount, refundNetAmount, refundTaxAmount,
        stockDisposition: entry.stockDisposition,
      };
    });
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
        approverUserId: input.approverUserId,
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
    if (request.approverUserId !== actorUserId || request.requestedByUserId === actorUserId) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
    const finance = await Promise.all([
      resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      resolveEnterpriseModuleAccess({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS", action: "approve" }),
    ]);
    if (!finance.every((entry) => entry.allowed)) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
    if (request.revision !== input.revision ||
      (input.decision === "APPROVE" ? request.status !== "INSPECTED" :
        !["SUBMITTED", "INSPECTED"].includes(request.status))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REVISION_CONFLICT", 409);
    }
    if (input.decision === "APPROVE" &&
      (!request.inspectedAt || !request.inspectedByUserId || !request.inspectionNotes ||
        request.inspectionNotes.trim().length < 5 || request.inspectedByUserId === request.requestedByUserId ||
        request.inspectedByUserId === actorUserId)) {
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
      metadataJson: { invoiceId, siteId: request.checkout.siteId, ...(input.reason ? { reason: input.reason } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
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
        invoice: { select: { status: true } } } } },
    });
    if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
    await requireRetailSiteCapability(
      organizationId, actorUserId, request.checkout.siteId, "MANAGE_STOCK", tx, { requireAssignment: true },
    );
    if (actorUserId === request.requestedByUserId || actorUserId === request.approverUserId) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE", 403);
    }
    if (request.status !== "SUBMITTED" || request.revision !== input.revision ||
      request.checkout.invoice.status !== "PAID" || !request.checkout.stockPostedAt) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REVISION_CONFLICT", 409);
    }
    const inspected = await tx.enterpriseRetailInvoiceReturnRequest.update({
      where: { id: request.id }, data: {
        status: "INSPECTED", inspectedByUserId: actorUserId, inspectedAt: new Date(),
        inspectionNotes: input.notes, revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_INSPECTED",
      summary: "Retail invoice return physically received and inspected",
      actorUserId, fromStatus: "SUBMITTED", toStatus: "INSPECTED",
      metadataJson: { invoiceId, siteId: request.checkout.siteId },
    });
    return inspected;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
}
