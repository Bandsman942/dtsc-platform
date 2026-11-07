import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { prisma } from "@/lib/prisma";

// A request and its approval are NOT a refund. No Finance balance, credit
// note, stock quantity or payment changes in this module.
const quantity = z.string().trim().regex(/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?$/);
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

type RequestInput = z.infer<typeof retailInvoiceReturnRequestSchema>;
type DecisionInput = z.infer<typeof retailInvoiceReturnDecisionSchema>;

function monetary(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
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
  const finance = await resolveEnterpriseModuleAccess({
    organizationId, userId: approverUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve",
  });
  if (!finance.allowed) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
}

export async function listRetailInvoiceReturnRequests(
  organizationId: string, invoiceId: string, actorUserId: string, page: number,
) {
  await requireReturnFeatureTx(prisma, organizationId);
  const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId: invoiceId }, select: { id: true, siteId: true },
  });
  if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
  await requireRetailSiteCapability(
    organizationId, actorUserId, checkout.siteId, "VIEW_SALES", prisma, { requireAssignment: true },
  );
  const where = { organizationId, checkoutId: checkout.id };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailInvoiceReturnRequest.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25,
      include: { lines: true },
    }),
    prisma.enterpriseRetailInvoiceReturnRequest.count({ where }),
  ]);
  return { items, pagination: { page, pageSize: 25, total, pageCount: Math.max(1, Math.ceil(total / 25)) } };
}

export async function createRetailInvoiceReturnRequest(
  organizationId: string, invoiceId: string, actorUserId: string, input: RequestInput,
) {
  const requestHash = fingerprint(input);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await requireReturnFeatureTx(tx, organizationId);
    const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: { invoice: { select: { status: true, grandTotal: true, currencyCode: true } },
        lines: { include: { invoiceItem: { select: { quantity: true, totalAmount: true } } } } },
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
    if (checkout.invoice.status !== "PAID" || !checkout.stockPostedAt) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_PAID_REQUIRED", 409);
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
        request: { status: { in: ["SUBMITTED", "APPROVED", "COMPLETED"] } },
      },
      select: { checkoutLineId: true, quantity: true, refundAmount: true },
    });
    const previousQuantity = new Map<string, Prisma.Decimal>();
    const previousAmount = new Map<string, Prisma.Decimal>();
    for (const row of committed) {
      previousQuantity.set(row.checkoutLineId,
        (previousQuantity.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.quantity));
      previousAmount.set(row.checkoutLineId,
        (previousAmount.get(row.checkoutLineId) || new Prisma.Decimal(0)).plus(row.refundAmount));
    }
    const prepared = input.lines.map((entry) => {
      const line = source.get(entry.checkoutLineId)!;
      const value = new Prisma.Decimal(entry.quantity);
      const priorQty = previousQuantity.get(line.id) || new Prisma.Decimal(0);
      const priorAmount = previousAmount.get(line.id) || new Prisma.Decimal(0);
      const left = line.invoiceItem.quantity.minus(priorQty);
      if (!value.isPositive() || value.greaterThan(left)) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED", 409);
      }
      if (entry.stockDisposition === "RESTOCK" && !line.inventoryItemId) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_STOCK_DISPOSITION_INVALID", 409);
      }
      const remainingAmount = line.invoiceItem.totalAmount.minus(priorAmount);
      const proportional = monetary(line.invoiceItem.totalAmount.times(value).div(line.invoiceItem.quantity));
      const amount = value.equals(left) ? remainingAmount : Prisma.Decimal.min(proportional, remainingAmount);
      if (amount.isNegative()) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_AMOUNT_INVALID", 409);
      return {
        organizationId, checkoutId: checkout.id, checkoutLineId: line.id,
        quantity: value, refundAmount: amount, stockDisposition: entry.stockDisposition,
      };
    });
    const refundAmount = monetary(prepared.reduce(
      (sum, line) => sum.plus(line.refundAmount), new Prisma.Decimal(0),
    ));
    if (!refundAmount.isPositive() || refundAmount.greaterThan(checkout.invoice.grandTotal)) {
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
    const finance = await resolveEnterpriseModuleAccess({
      organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES", action: "approve",
    });
    if (!finance.allowed) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    if (request.status !== "SUBMITTED" || request.revision !== input.revision) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_REVISION_CONFLICT", 409);
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
      actorUserId, fromStatus: "SUBMITTED", toStatus: nextStatus,
      metadataJson: { invoiceId, siteId: request.checkout.siteId, ...(input.reason ? { reason: input.reason } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
}
