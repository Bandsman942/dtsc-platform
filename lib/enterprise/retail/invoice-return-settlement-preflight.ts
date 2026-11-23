import { Prisma } from "@prisma/client";
import { lotExpiryDateKey, planPhysicalInvoiceReturnLots } from "@/lib/enterprise/inventory/lot-allocation";

// @prisma/client Decimal does not expose the static Decimal.min/max helpers.
const decimalMin = (...values: Prisma.Decimal[]): Prisma.Decimal => values.reduce((a, b) => a.lessThan(b) ? a : b);

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
  expectedStatus: "APPROVED" | "FINANCE_PENDING" = "APPROVED",
) {
  const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
    where: { organizationId, id: requestId, checkout: { salesInvoiceId: invoiceId } },
    select: {
      id: true, checkoutId: true, status: true, refundAmount: true, refundPayoutAmount: true,
      requestedByUserId: true, approverUserId: true, decidedByUserId: true,
      inspectedByUserId: true, inspectedAt: true, inspectionNotes: true,
      inspectionMode: true, returnPolicySnapshot: true,
      lines: { select: { id: true, checkoutLineId: true, quantity: true, refundAmount: true,
        refundNetAmount: true, refundTaxAmount: true, stockDisposition: true, lotAllocations: true } },
      checkout: {
        select: {
          id: true, siteId: true, warehouseId: true, stockPostedAt: true,
          invoice: { select: {
            id: true, status: true, grandTotal: true, amountPaid: true, amountCredited: true,
            outstandingAmount: true, currencyCode: true, businessPartyId: true,
            receivable: { select: { id: true } },
          } },
          lines: { select: {
            id: true, invoiceItemId: true, inventoryItemId: true, stockLotId: true, lotAllocations: true,
            invoiceItem: { select: { quantity: true, totalAmount: true, netAmount: true, taxAmount: true } },
          } },
        },
      },
    },
  });
  if (!request) throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
  const { checkout } = request;
  const independentlyVerified = new Set([request.requestedByUserId, request.approverUserId, request.inspectedByUserId]).size === 3 ||
    (request.requestedByUserId === request.approverUserId && request.inspectedByUserId !== request.approverUserId);
  // Only an immutable, v1, explicit SIMPLIFIED snapshot can permit a requester
  // to have inspected the goods. Legacy returns and malformed snapshots retain
  // the existing four-eyes invariant. The decision service already checked
  // the designated approver and each per-site delegation at decision time.
  const rawSnapshot = request.returnPolicySnapshot;
  const policy = rawSnapshot && typeof rawSnapshot === "object" && !Array.isArray(rawSnapshot) ? rawSnapshot : null;
  const simplified = (policy?.version === 1 || policy?.version === 2) && policy.mode === "SIMPLIFIED";
  const currentPolicyConfig = request.inspectionMode === "SELF_ATTESTED"
    ? await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    }) : null;
  const liveSettings = currentPolicyConfig?.settingsJson;
  const liveStoredPolicy = liveSettings && typeof liveSettings === "object" && !Array.isArray(liveSettings)
    ? liveSettings.retailInvoiceReturnPolicy : null;
  const livePolicy = liveStoredPolicy && typeof liveStoredPolicy === "object" && !Array.isArray(liveStoredPolicy)
    ? liveStoredPolicy : null;
  const requesterInspection = simplified && policy?.allowRequesterInspection === true &&
    livePolicy?.mode === "SIMPLIFIED" && livePolicy.allowRequesterInspection === true &&
    request.inspectionMode === "SELF_ATTESTED" && request.inspectedByUserId === request.requestedByUserId;
  const delegatedSameActor = request.requestedByUserId === request.approverUserId;
  const verifiedDecisionChain = independentlyVerified ||
    Boolean(requesterInspection && (!delegatedSameActor || policy?.allowDelegatedSelfApproval === true));
  if (request.status !== expectedStatus || !request.inspectedAt ||
      !request.inspectedByUserId || !request.inspectionNotes || request.inspectionNotes.trim().length < 5 ||
      !request.decidedByUserId || request.decidedByUserId !== request.approverUserId ||
      !verifiedDecisionChain) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_APPROVAL_REQUIRED");
  }
  const invoice = checkout.invoice;
  // Capture the relation key before Promise.all closures to preserve Prisma's
  // nullable-relation guard under strict TypeScript narrowing.
  const receivableId = invoice.receivable?.id;
  if (!["PAID", "CREDIT_NOTE", "PARTIALLY_PAID", "ISSUED", "OVERDUE"].includes(invoice.status) ||
      !receivableId || invoice.outstandingAmount.isNegative() ||
      !invoice.amountPaid.plus(invoice.amountCredited).plus(invoice.outstandingAmount).equals(invoice.grandTotal)) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_SOURCE_INVALID");
  }
  const refundAmount = request.refundAmount; // Credit-note face value, not necessarily cash paid out.
  // Validate the documentary credit first. An invalid credit value must
  // never be reported as a stale payout snapshot.
  if (!refundAmount.greaterThan(0) || !refundAmount.equals(cents(refundAmount)) ||
      !checkout.invoice.grandTotal.equals(cents(checkout.invoice.grandTotal)) ||
      refundAmount.greaterThan(checkout.invoice.grandTotal) ||
      !sum(request.lines.map((line) => line.refundAmount)).equals(refundAmount)) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_AMOUNT_INVALID");
  }
  const availableToRefund = refundAmount.minus(invoice.outstandingAmount);
  const payoutAmount = availableToRefund.greaterThan(0) ? availableToRefund : new Prisma.Decimal(0);
  if ((request.refundPayoutAmount !== null && request.refundPayoutAmount !== undefined &&
      !request.refundPayoutAmount.equals(payoutAmount)) || !payoutAmount.equals(cents(payoutAmount))) {
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_PAYOUT_CONFLICT");
  }
  if (!request.lines.length) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");

  const invoiceLines = new Map(checkout.lines.map((line) => [line.id, line]));
  const stockLines = [] as Array<{
    returnLineId: string; checkoutLineId: string; invoiceItemId: string;
    quantity: Prisma.Decimal; stockDisposition: string; lotAllocations?: Prisma.JsonValue | null;
  }>;
  const ids = new Set<string>();
  for (const line of request.lines) {
    const source = invoiceLines.get(line.checkoutLineId);
    if (!source || ids.has(source.id) || !line.quantity.greaterThan(0) ||
        line.quantity.greaterThan(source.invoiceItem.quantity) ||
        !line.refundAmount.greaterThan(0) || !line.refundAmount.equals(cents(line.refundAmount)) ||
        !["RESTOCK", "QUARANTINE", "DISPOSE", "SERVICE_CREDIT", "UNDELIVERED_CREDIT"].includes(line.stockDisposition) ||
        (!source.inventoryItemId && line.stockDisposition !== "SERVICE_CREDIT") ||
        (source.inventoryItemId && !checkout.stockPostedAt && line.stockDisposition !== "UNDELIVERED_CREDIT") ||
        (source.inventoryItemId && checkout.stockPostedAt && !["RESTOCK", "QUARANTINE", "DISPOSE"].includes(line.stockDisposition))) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");
    }
    if (line.refundNetAmount === null || line.refundTaxAmount === null ||
        !line.refundNetAmount.equals(cents(line.refundNetAmount)) ||
        !line.refundTaxAmount.equals(cents(line.refundTaxAmount)) ||
        line.refundNetAmount.lessThan(0) || line.refundTaxAmount.lessThan(0) ||
        !line.refundNetAmount.plus(line.refundTaxAmount).equals(line.refundAmount) ||
        !source.invoiceItem.netAmount.equals(cents(source.invoiceItem.netAmount)) ||
        !source.invoiceItem.taxAmount.equals(cents(source.invoiceItem.taxAmount)) ||
        !source.invoiceItem.netAmount.plus(source.invoiceItem.taxAmount).equals(source.invoiceItem.totalAmount)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID");
    }
    if (line.stockDisposition === "RESTOCK" && !source.inventoryItemId) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
    }
    if (source.inventoryItemId && line.quantity.decimalPlaces() > 3) {
      throw conflict("RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION");
    }
    ids.add(source.id);
    if (source.inventoryItemId && checkout.stockPostedAt) stockLines.push({
      returnLineId: line.id, checkoutLineId: source.id, invoiceItemId: source.invoiceItemId,
      quantity: line.quantity, stockDisposition: line.stockDisposition, lotAllocations: line.lotAllocations,
    });
  }
  const [confirmedAllocations, originalMovements, previouslyCompleted] = await Promise.all([
    tx.enterprisePaymentAllocation.findMany({
      where: { organizationId, receivableId: receivableId, status: "CONFIRMED" },
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
      where: { organizationId, checkoutId: checkout.id, checkoutLineId: { in: [...ids] }, request: { status: { in: ["COMPLETED", "REFUND_PENDING"] } } },
      select: { checkoutLineId: true, quantity: true, refundAmount: true,
        refundNetAmount: true, refundTaxAmount: true, stockDisposition: true, lotAllocations: true },
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
  if (refundable.lessThan(payoutAmount)) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT");
  // Finance must never silently round a source allocation while reversing
  // only part of it. Stable order also prevents an actor choosing a different
  // payment/account from the verified source when the final transaction runs.
  const financeSourcePlan: Array<{
    allocationId: string; paymentId: string; financialAccountId: string;
    amount: Prisma.Decimal;
  }> = [];
  let financeRemaining = payoutAmount;
  for (const allocation of eligibleAllocations) {
    if (!allocation.amount.greaterThan(0) || !allocation.amount.equals(cents(allocation.amount))) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_ALLOCATION_PRECISION_INVALID");
    }
    if (financeRemaining.isZero()) continue;
    const portion = decimalMin(allocation.amount, financeRemaining);
    financeSourcePlan.push({
      allocationId: allocation.id, paymentId: allocation.paymentId,
      financialAccountId: allocation.payment.financialAccountId!, amount: portion,
    });
    financeRemaining = financeRemaining.minus(portion);
  }
  if (!financeRemaining.isZero()) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT");

  for (const line of request.lines) {
    const source = invoiceLines.get(line.checkoutLineId)!;
    const previous = previouslyCompleted.filter((entry) => entry.checkoutLineId === line.checkoutLineId);
    if (previous.some((entry) => entry.refundNetAmount === null || entry.refundTaxAmount === null ||
      !entry.refundNetAmount.plus(entry.refundTaxAmount).equals(entry.refundAmount))) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID");
    }
    const completed = sum(previous.filter((previous) =>
      previous.checkoutLineId === line.checkoutLineId,
    ).map((previous) => previous.quantity));
    if (completed.plus(line.quantity).greaterThan(source.invoiceItem.quantity)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID");
    }
    const priorNet = sum(previous.map((entry) => entry.refundNetAmount!));
    const priorTax = sum(previous.map((entry) => entry.refundTaxAmount!));
    if (priorNet.plus(line.refundNetAmount!).greaterThan(source.invoiceItem.netAmount) ||
        priorTax.plus(line.refundTaxAmount!).greaterThan(source.invoiceItem.taxAmount)) {
      throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID");
    }
  }

  if (!checkout.stockPostedAt && originalMovements.length) {
    // A partially paid and unfulfilled invoice must never have stray physical
    // fulfillment movements; these require manual reconciliation first.
    throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
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
    if (!checkout.stockPostedAt) continue; // Undelivered goods release stock promises; never add stock.
    const source = invoiceLines.get(line.checkoutLineId)!;
    const related = originalMovements.filter((movement) => movement.sourceLineId === line.invoiceItemId);
    const previous = previouslyCompleted.filter(row => row.checkoutLineId === line.checkoutLineId);
    if (source.lotAllocations != null) {
      if (related.some(row => row.warehouseId !== checkout.warehouseId || row.inventoryItemId !== source.inventoryItemId)) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
      try {
        const splits = planPhysicalInvoiceReturnLots({ source, movements: related, previous, quantity: line.quantity, selected: line.lotAllocations });
        if (line.stockDisposition === "RESTOCK") {
          const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
          const parts = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
          const today = ["year","month","day"].map(type => parts.find(part => part.type === type)?.value).join("-");
          const lots = await tx.enterpriseStockLot.findMany({ where: { organizationId, warehouseId: checkout.warehouseId, inventoryItemId: source.inventoryItemId!, id: { in: splits.map(({movement}) => movement.stockLotId!).filter(Boolean) }, status: "AVAILABLE", archivedAt: null }, select: { id: true, expiryDate: true } });
          if (splits.some(({movement}) => !lots.some(lot => lot.id === movement.stockLotId && (!lot.expiryDate || lotExpiryDateKey(lot.expiryDate) >= today)))) throw conflict("RETAIL_INVOICE_RETURN_BATCH_UNSAFE");
        }
        for (const { movement, quantity } of splits) stockSourcePlan.push({ returnLineId: line.returnLineId, originalMovementId: movement.id, inventoryItemId: movement.inventoryItemId, warehouseId: movement.warehouseId, storageLocationId: movement.storageLocationId, stockLotId: movement.stockLotId, quantity, stockDisposition: line.stockDisposition });
      } catch (error) {
        if (error instanceof EnterpriseRetailError) throw error;
        const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
        throw conflict(["RETAIL_INVOICE_RETURN_BATCH_SELECTION_REQUIRED", "RETAIL_INVOICE_RETURN_BATCH_QUANTITY_EXCEEDED", "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID"].includes(code) ? code : "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
      }
      continue;
    }
    if (line.lotAllocations != null) throw conflict("RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID");
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
    const completed = sum(previous.filter(row => row.stockDisposition !== "UNDELIVERED_CREDIT").map(row => row.quantity));
    const undelivered = sum(previous.filter(row => row.stockDisposition === "UNDELIVERED_CREDIT").map(row => row.quantity));
    if (!original.equals(source.invoiceItem.quantity.minus(undelivered)) ||
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
      const portion = decimalMin(remaining, available);
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
    receivableId: receivableId, refundAmount, payoutAmount,
    currencyCode: checkout.invoice.currencyCode, stockLineCount: stockLines.length,
    financeSourcePlan, stockSourcePlan,
  };
}
