import { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

const conflict = (code: string) => new EnterpriseRetailError(code, 409);
const cents = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));

/** A read-only, transaction-scoped prerequisite for the future canonical
 * Finance/Inventory return settlement. No mutation is allowed here.
 *
 * Settlement must repeat this preflight AFTER locking the invoice, request,
 * receivable and original movements, in the same SERIALIZABLE transaction
 * as its stock/credit/refund writes. A successful preview is not permission
 * to refund, does not lock funds, and must never bypass the common Finance
 * approval and posting services.
 */
export async function assertRetailInvoiceReturnSettlementReadinessTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  invoiceId: string,
  requestId: string,
) {
  const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
    where: { organizationId, id: requestId, checkout: { salesInvoiceId: invoiceId } },
    select: {
      id: true, checkoutId: true, status: true, refundAmount: true,
      requestedByUserId: true, approverUserId: true, decidedByUserId: true,
      inspectedByUserId: true, inspectedAt: true, inspectionNotes: true,
      lines: { select: { id: true, checkoutLineId: true, quantity: true, refundAmount: true, stockDisposition: true } },
      checkout: {
        select: {
          id: true, siteId: true, warehouseId: true, stockPostedAt: true,
          invoice: { select: {
            id: true, status: true, grandTotal: true, currencyCode: true, businessPartyId: true,
            receivable: { select: { id: true } },
          } },
          lines: { select: {
            id: true, invoiceItemId: true, inventoryItemId: true, stockLotId: true,
            invoiceItem: { select: { quantity: true, totalAmount: true } },
          } },
        },
      },
    },
  });
  if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
  const { checkout } = request;
  if (request.status !== "APPROVED" || !request.inspectedAt ||
      !request.inspectedByUserId || !request.inspectionNotes || request.inspectionNotes.trim().length < 5 ||
      !request.decidedByUserId || request.decidedByUserId !== request.approverUserId ||
      new Set([request.requestedByUserId, request.approverUserId, request.inspectedByUserId]).size !== 3) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_APPROVAL_REQUIRED");
  }
  if (!checkout.stockPostedAt ||
      !["PAID", "CREDIT_NOTE", "PARTIALLY_PAID"].includes(checkout.invoice.status) ||
      !checkout.invoice.receivable) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_SOURCE_INVALID");
  }
  const refundAmount = request.refundAmount;
  if (!refundAmount.greaterThan(0) || !refundAmount.equals(cents(refundAmount)) ||
      !checkout.invoice.grandTotal.equals(cents(checkout.invoice.grandTotal)) ||
      refundAmount.greaterThan(checkout.invoice.grandTotal) ||
      !sum(request.lines.map((line) => line.refundAmount)).equals(refundAmount)) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_AMOUNT_INVALID");
  }
  if (!request.lines.length) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");

  const invoiceLines = new Map(checkout.lines.map((line) => [line.id, line]));
  const stockLines = [] as Array<{
    returnLineId: string; checkoutLineId: string; invoiceItemId: string;
    quantity: Prisma.Decimal; stockDisposition: string;
  }>;
  const ids = new Set<string>();
  for (const line of request.lines) {
    const source = invoiceLines.get(line.checkoutLineId);
    if (!source || ids.has(source.id) || !line.quantity.greaterThan(0) ||
        line.quantity.greaterThan(source.invoiceItem.quantity) ||
        !line.refundAmount.greaterThan(0) || !line.refundAmount.equals(cents(line.refundAmount)) ||
        !["RESTOCK", "QUARANTINE", "DISPOSE"].includes(line.stockDisposition)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");
    }
    if (line.stockDisposition === "RESTOCK" && !source.inventoryItemId) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
    }
    if (source.inventoryItemId && line.quantity.decimalPlaces() > 3) {
      throw conflict("RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION");
    }
    ids.add(source.id);
    if (source.inventoryItemId) stockLines.push({
      returnLineId: line.id, checkoutLineId: source.id, invoiceItemId: source.invoiceItemId,
      quantity: line.quantity, stockDisposition: line.stockDisposition,
    });
  }
  const [confirmedAllocations, originalMovements, previouslyCompleted] = await Promise.all([
    tx.enterprisePaymentAllocation.findMany({
      where: { organizationId, receivableId: checkout.invoice.receivable.id, status: "CONFIRMED" },
      orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
      select: { id: true, paymentId: true, amount: true, payment: { select: {
        status: true, direction: true, paymentType: true, businessPartyId: true,
        currencyCode: true, financialAccountId: true,
      } } },
    }),
    tx.enterpriseStockMovement.findMany({
      where: {
        organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId,
        direction: "OUT", movementType: "SALE_FULFILLMENT",
        sourceLineId: { in: stockLines.map((line) => line.invoiceItemId) },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, sourceLineId: true, warehouseId: true, storageLocationId: true,
        inventoryItemId: true, stockLotId: true, quantity: true },
    }),
    tx.enterpriseRetailInvoiceReturnLine.findMany({
      where: { organizationId, checkoutId: checkout.id, checkoutLineId: { in: [...ids] }, request: { status: "COMPLETED" } },
      select: { checkoutLineId: true, quantity: true },
    }),
  ]);
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, id: { in: confirmedAllocations.map((allocation) => allocation.payment.financialAccountId)
      .filter((id): id is string => Boolean(id)) } },
    select: { id: true, siteId: true, currencyCode: true },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const eligibleAllocations = confirmedAllocations.filter((allocation) => {
    const payment = allocation.payment;
    const account = payment.financialAccountId ? accountById.get(payment.financialAccountId) : null;
    return payment.direction === "INBOUND" && payment.paymentType === "CUSTOMER_PAYMENT" &&
      ["CONFIRMED", "RECONCILED"].includes(payment.status) &&
      payment.businessPartyId === checkout.invoice.businessPartyId &&
      payment.currencyCode === checkout.invoice.currencyCode &&
      account?.siteId === checkout.siteId && account.currencyCode === payment.currencyCode;
  });
  const refundable = sum(eligibleAllocations.map((allocation) => allocation.amount));
  if (refundable.lessThan(refundAmount)) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT");
  // Finance must never silently round a source allocation while reversing
  // only part of it. Stable order also prevents an actor choosing a different
  // payment/account from the verified source when the final transaction runs.
  const financeSourcePlan: Array<{
    allocationId: string; paymentId: string; financialAccountId: string;
    amount: Prisma.Decimal;
  }> = [];
  let financeRemaining = refundAmount;
  for (const allocation of eligibleAllocations) {
    if (!allocation.amount.greaterThan(0) || !allocation.amount.equals(cents(allocation.amount))) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_ALLOCATION_PRECISION_INVALID");
    }
    if (financeRemaining.isZero()) continue;
    const portion = Prisma.Decimal.min(allocation.amount, financeRemaining);
    financeSourcePlan.push({
      allocationId: allocation.id, paymentId: allocation.paymentId,
      financialAccountId: allocation.payment.financialAccountId!, amount: portion,
    });
    financeRemaining = financeRemaining.minus(portion);
  }
  if (!financeRemaining.isZero()) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT");

  for (const line of request.lines) {
    const source = invoiceLines.get(line.checkoutLineId)!;
    const completed = sum(previouslyCompleted.filter((previous) =>
      previous.checkoutLineId === line.checkoutLineId,
    ).map((previous) => previous.quantity));
    if (completed.plus(line.quantity).greaterThan(source.invoiceItem.quantity)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");
    }
  }

  // Deterministic source trace for the future atomic stock settlement. Every
  // disposition retains its original cost/lot provenance; RESTOCK alone is
  // eligible to increase saleable inventory. This plan creates NO movements.
  const stockSourcePlan: Array<{
    returnLineId: string; originalMovementId: string; inventoryItemId: string;
    warehouseId: string; storageLocationId: string | null; stockLotId: string | null;
    quantity: Prisma.Decimal; stockDisposition: string;
  }> = [];
  for (const line of stockLines) {
    const source = invoiceLines.get(line.checkoutLineId)!;
    const related = originalMovements.filter((movement) => movement.sourceLineId === line.invoiceItemId);
    const movements = related.filter((movement) =>
      movement.sourceLineId === line.invoiceItemId && movement.warehouseId === checkout.warehouseId &&
      movement.inventoryItemId === source.inventoryItemId && movement.stockLotId === source.stockLotId,
    );
    // It is insufficient for the matching warehouse to be balanced: an
    // additional sale-fulfillment in a DIFFERENT depot/lot for the same
    // invoice line would still represent an unreconciled double stock debit.
    if (related.length !== movements.length) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
    }
    const original = sum(movements.map((movement) => movement.quantity));
    const completed = sum(previouslyCompleted.filter((previous) =>
      previous.checkoutLineId === line.checkoutLineId,
    ).map((previous) => previous.quantity));
    if (!original.equals(source.invoiceItem.quantity) ||
        completed.plus(line.quantity).greaterThan(original)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
    }
    let skip = completed;
    let remaining = line.quantity;
    for (const movement of movements) {
      if (remaining.isZero()) break;
      if (skip.greaterThanOrEqualTo(movement.quantity)) {
        skip = skip.minus(movement.quantity);
        continue;
      }
      const available = movement.quantity.minus(skip);
      skip = new Prisma.Decimal(0);
      const portion = Prisma.Decimal.min(remaining, available);
      if (!portion.greaterThan(0)) continue;
      stockSourcePlan.push({
        returnLineId: line.returnLineId, originalMovementId: movement.id,
        inventoryItemId: movement.inventoryItemId, warehouseId: movement.warehouseId,
        storageLocationId: movement.storageLocationId, stockLotId: movement.stockLotId,
        quantity: portion, stockDisposition: line.stockDisposition,
      });
      remaining = remaining.minus(portion);
    }
    if (!remaining.isZero()) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
  }
  return {
    requestId: request.id, checkoutId: checkout.id, siteId: checkout.siteId,
    receivableId: checkout.invoice.receivable.id, refundAmount,
    currencyCode: checkout.invoice.currencyCode, stockLineCount: stockLines.length,
    financeSourcePlan, stockSourcePlan,
  };
}
