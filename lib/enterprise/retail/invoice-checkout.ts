import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

// Prisma.Decimal (decimal.js-light) does not provide static min/max.
const decimalMin = (a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal => a.lessThan(b) ? a : b;
const decimalMax = (a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal => a.greaterThan(b) ? a : b;

import { z } from "zod";
import { createSalesInvoiceTx } from "@/lib/enterprise/accounting/receivables-service";
import { resolveExchangeRateDetails, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { resolveRetailCommercialPricingDecisions } from "@/lib/enterprise/retail/commercial-engine";
import { valueRetailInvoiceFulfillmentIssueTx } from "@/lib/enterprise/retail/accounting";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { reservationExactBalanceRemaining, reservationLegacyRemaining, reservationLotRemaining } from "@/lib/enterprise/inventory/lot-allocation";
import { assertRetailLotPolicyTx } from "@/lib/enterprise/retail/inventory-policy";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { prisma } from "@/lib/prisma";

export const retailInvoicePrepareSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  siteId: z.string().trim().min(1).max(191),
  warehouseId: z.string().trim().min(1).max(191),
  businessPartyId: z.string().trim().min(1).max(191).optional().nullable(),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  lines: z.array(z.object({
    catalogItemId: z.string().trim().min(1).max(191),
    stockLotId: z.string().trim().min(1).max(191).optional().nullable(),
    quantity: z.number().positive().max(1_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001),
  }).strict()).min(1).max(100),
}).strict();

export type RetailInvoicePrepareInput = z.infer<typeof retailInvoicePrepareSchema>;

function fingerprint(input: RetailInvoicePrepareInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function invoiceCheckoutEnabled(settings: Prisma.JsonValue | null | undefined) {
  return Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Prisma.JsonObject).invoiceCheckoutEnabled === true);
}

async function resolveWalkInCustomerTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
  const customer = await tx.enterpriseBusinessParty.upsert({
    where: { organizationId_code: { organizationId, code: "RETAIL-WALKIN" } },
    update: {},
    create: {
      organizationId, code: "RETAIL-WALKIN", partyType: "PERSON", legalName: "Client de passage",
      displayName: "Client de passage", normalizedName: "CLIENT DE PASSAGE", createdByUserId: actorUserId,
      roles: { create: { roleCode: "CUSTOMER", createdByUserId: actorUserId } },
    },
    select: { id: true },
  });
  const role = await tx.enterpriseBusinessPartyRole.findFirst({ where: { organizationId, businessPartyId: customer.id, roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null }, select: { id: true } });
  if (!role) throw new EnterpriseRetailError("RETAIL_INVOICE_WALKIN_CUSTOMER_INVALID", 409);
  return customer.id;
}

/** Creates Finance's only invoice and Retail's non-financial site/stock link
 * in one serializable transaction. Its checkout lines reserve the available
 * physical quantity without a stock movement until full payment; cancellation
 * releases this derived reservation automatically. */
export async function prepareRetailInvoice(organizationId: string, actorUserId: string, input: RetailInvoicePrepareInput) {
  const requestFingerprint = fingerprint(input);
  const uniqueItems = new Set(input.lines.map((line) => line.catalogItemId));
  if (uniqueItems.size !== input.lines.length) throw new EnterpriseRetailError("RETAIL_DUPLICATE", 409);

  const earlier = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { invoice: { include: { items: true } }, lines: true },
  });
  if (earlier) {
    // Idempotency must not bypass store access after a user's assignment is
    // removed, even when the original request has the same fingerprint.
    await requireRetailSiteCapability(organizationId, actorUserId, earlier.siteId, "PREPARE_INVOICE", prisma, { requireAssignment: true });
    if (earlier.requestFingerprint !== requestFingerprint) throw new EnterpriseRetailError("RETAIL_INVOICE_IDEMPOTENCY_COLLISION", 409);
    return { checkout: earlier, invoice: earlier.invoice, stockWarnings: [], idempotent: true };
  }

  const decisions = await resolveRetailCommercialPricingDecisions(organizationId, {
    siteId: input.siteId, customerBusinessPartyId: input.businessPartyId || null,
    currencyCode: input.currencyCode, lines: input.lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity })),
  }, { channelCode: "POS", couponCode: null, invoiceCheckoutFx: true });
  // Finance invoices are not EnterpriseRetailSale records. The existing promotion
  // redemption ledger requires a saleId, so an automatic/coupon promotion cannot
  // be considered consumed here. Never grant a discount that evades usage limits
  // or falsely appears unredeemed in Retail analytics.
  if (decisions.some((decision) => (decision.promotions?.length || 0) > 0)) {
    throw new EnterpriseRetailError("RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED", 409);
  }
  const decisionByCatalog = new Map(decisions.map((decision) => [decision.catalogItemId, decision]));
  const calculatedTotal = decisions.reduce((sum, decision) => sum.plus(decision.lineTotal), new Prisma.Decimal(0));

  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { invoice: { include: { items: true } }, lines: true },
    });
    if (existing) {
      await requireRetailSiteCapability(organizationId, actorUserId, existing.siteId, "PREPARE_INVOICE", tx, { requireAssignment: true });
      if (existing.requestFingerprint !== requestFingerprint) throw new EnterpriseRetailError("RETAIL_INVOICE_IDEMPOTENCY_COLLISION", 409);
      return { checkout: existing, invoice: existing.invoice, stockWarnings: [], idempotent: true };
    }
    const [organization, configuration, warehouse, catalogs, inventoryItems] = await Promise.all([
      tx.organization.findFirst({ where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: RETAIL_SECTOR_CODE }, select: { id: true, timezone: true } }),
      tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, siteId: input.siteId, site: { status: "ACTIVE", archivedAt: null }, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.enterpriseCatalogItem.findMany({ where: { organizationId, id: { in: [...uniqueItems] }, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, currency: true, trackInventory: true } }),
      tx.enterpriseInventoryItem.findMany({ where: { organizationId, catalogItemId: { in: [...uniqueItems] }, status: "ACTIVE", archivedAt: null }, select: { id: true, catalogItemId: true } }),
    ]);
    if (!organization || !warehouse) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409);
    if (!invoiceCheckoutEnabled(configuration?.settingsJson)) throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 409);
    await requireRetailSiteCapability(organizationId, actorUserId, input.siteId, "PREPARE_INVOICE", tx, { requireAssignment: true });
    if (catalogs.length !== uniqueItems.size) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);

    const byCatalog = new Map(catalogs.map((item) => [item.id, item]));
    const inventoryByCatalog = new Map(inventoryItems.map((item) => [item.catalogItemId, item]));
    const selectedLots = [...new Set(input.lines.map((line) => line.stockLotId).filter((id): id is string => Boolean(id)))];
    const [lots, balances, reservations, retailHolds] = await Promise.all([
      selectedLots.length ? tx.enterpriseStockLot.findMany({ where: { organizationId, warehouseId: input.warehouseId, id: { in: selectedLots }, status: "AVAILABLE", archivedAt: null }, select: { id: true, inventoryItemId: true } }) : Promise.resolve([]),
      tx.enterpriseInventoryBalance.findMany({ where: { organizationId, warehouseId: input.warehouseId, inventoryItemId: { in: inventoryItems.map((item) => item.id) } }, select: { inventoryItemId: true, stockLotId: true, quantityOnHand: true, quantityReserved: true } }),
      tx.enterpriseInventoryReservation.findMany({ where: { organizationId, warehouseId: input.warehouseId, inventoryItemId: { in: inventoryItems.map((item) => item.id) }, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { inventoryItemId: true, quantity: true, fulfilledQuantity: true, lotAllocations: true } }),
      readActiveRetailInvoiceStockHoldsTx(tx, { organizationId, warehouseId: input.warehouseId, inventoryItemIds: inventoryItems.map((item) => item.id) }),
    ]);
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const prepared = input.lines.map((line) => {
      const item = byCatalog.get(line.catalogItemId);
      const decision = decisionByCatalog.get(line.catalogItemId);
      const invoiceFx = decision?.context.invoiceFx as { sourceCurrencyCode?: string } | undefined;
      if (!item || !decision || (item.currency && item.currency !== input.currencyCode && invoiceFx?.sourceCurrencyCode !== item.currency)) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409);
      const inventory = item.trackInventory ? inventoryByCatalog.get(item.id) : null;
      if (item.trackInventory && !inventory) throw new EnterpriseRetailError("RETAIL_INVENTORY_ITEM_REQUIRED", 409);
      if (line.stockLotId && (!inventory || lotById.get(line.stockLotId)?.inventoryItemId !== inventory.id)) throw new EnterpriseRetailError("RETAIL_STOCK_LOT_INVALID", 409);
      if (inventory) {
        const rows = balances.filter((row) => row.inventoryItemId === inventory.id && (!line.stockLotId || row.stockLotId === line.stockLotId));
        if (!line.stockLotId && rows.some((row) => row.stockLotId)) {
          // The future stock posting must never silently consume an arbitrary
          // batch at the moment a customer finishes paying.
          throw new EnterpriseRetailError("RETAIL_STOCK_LOT_REQUIRED", 409);
        }
        const available = rows.reduce((sum, row) => sum.plus(row.quantityOnHand.minus(row.quantityReserved)), new Prisma.Decimal(0))
          .minus(reservations.filter((row) => row.inventoryItemId === inventory.id).reduce((sum, row) => sum.plus(reservationLotRemaining(row, line.stockLotId || null)), new Prisma.Decimal(0)))
          .minus(retailHolds.filter((hold) => hold.inventoryItemId === inventory.id && (hold.stockLotId === (line.stockLotId || null) || (Boolean(line.stockLotId) && !hold.stockLotId))).reduce((sum, hold) => sum.plus(hold.quantity), new Prisma.Decimal(0)));
        if (available.lessThan(line.quantity)) throw new EnterpriseRetailError("NEGATIVE_STOCK_FORBIDDEN", 409);
      }
      return { ...line, inventoryItemId: inventory?.id || null, itemName: item.name, decision };
    });
    const stockWarnings = await assertRetailLotPolicyTx(tx, {
      organizationId, warehouseId: input.warehouseId, timezone: organization.timezone || "UTC", settings: configuration?.settingsJson,
      lines: prepared.map((line) => ({ inventoryItemId: line.inventoryItemId, stockLotId: line.stockLotId || null, quantity: line.quantity })),
    });

    const customerId = input.businessPartyId || await resolveWalkInCustomerTx(tx, organizationId, actorUserId);
    const financeInput = {
      businessPartyId: customerId, invoiceDate: new Date(), currencyCode: input.currencyCode,
      items: prepared.map((line) => ({
        catalogItemId: line.catalogItemId, description: line.itemName, quantity: String(line.quantity),
        unitPrice: line.decision.serviceUnitPrice.toFixed(), discountAmount: line.decision.serviceDiscountAmount.toFixed(),
        ...(line.decision.taxCodeId ? { taxCodeId: line.decision.taxCodeId } : {}),
      })),
    };
    const newInvoice = await createSalesInvoiceTx(tx, organizationId, actorUserId, financeInput, input.siteId);
    // Freeze the dated Finance rate per canonical invoice LINE. A stale rate
    // between pricing preview and the serializable write invalidates the
    // checkout, rather than silently booking another amount.
    for (const line of prepared) {
      const fx = line.decision.context.invoiceFx as { sourceCurrencyCode: string; targetCurrencyCode: string; rate: string; rateId: string | null; originalUnitPrice: string } | undefined;
      if (!fx || fx.sourceCurrencyCode === input.currencyCode) continue;
      const invoiceItemId = newInvoice.items.find((item) => item.catalogItemId === line.catalogItemId)?.id;
      if (!invoiceItemId) throw new EnterpriseRetailError("RETAIL_INVOICE_LINE_MISSING", 409);
      const current = await resolveExchangeRateDetails(tx, { organizationId, sourceCurrencyCode: fx.sourceCurrencyCode, targetCurrencyCode: input.currencyCode, rateDate: newInvoice.invoiceDate });
      if (!current.rate.equals(new Prisma.Decimal(fx.rate)) || current.rateId !== fx.rateId) throw new EnterpriseRetailError("RETAIL_INVOICE_EXCHANGE_RATE_STALE", 409);
      await snapshotExchangeRate(tx, { organizationId, sourceEntityType: "EnterpriseSalesInvoiceItem", sourceEntityId: invoiceItemId,
        sourceCurrencyCode: fx.sourceCurrencyCode, targetCurrencyCode: input.currencyCode, rateDate: current.rateDate, rate: current.rate,
        source: `RETAIL_INVOICE_ORIGINAL_UNIT:${fx.originalUnitPrice}:FINANCE_RATE:${current.rateId || "NONE"}:${current.direction}`,
      });
    }
    // WARN is an explicit, non-blocking policy. Make the issue visible to
    // Finance validators on the canonical invoice, not only in a transient toast.
    const invoice = stockWarnings.length
      ? await tx.enterpriseSalesInvoice.update({
          where: { id: newInvoice.id },
          data: { notes: [
            "ATTENTION DTSC RETAIL — Risque sur les lots à examiner AVANT validation/émission.",
            ...stockWarnings.map((warning) => `${warning.code} · Inventory ${warning.inventoryItemId} · Lot ${warning.stockLotId || "non sélectionné"}`),
          ].join("\n") },
          include: { items: true },
        })
      : newInvoice;
    // Financial amounts must match the pricing engine. In particular,
    // tax-inclusive pricing must never silently double-add VAT.
    if (!invoice.grandTotal.equals(calculatedTotal)) throw new EnterpriseRetailError("RETAIL_INVOICE_PRICING_MISMATCH", 409);
    const invoiceItems = new Map(invoice.items.map((item) => [item.catalogItemId, item]));
    const checkoutLines = prepared.map((line) => {
      const item = invoiceItems.get(line.catalogItemId);
      if (!item) throw new EnterpriseRetailError("RETAIL_INVOICE_LINE_MISSING", 409);
      return { organizationId, invoiceItemId: item.id, inventoryItemId: line.inventoryItemId,
        stockLotId: line.stockLotId || null };
    });
    // Keep both writes inside the same serializable transaction. Prisma's
    // nested unchecked create cannot safely mix the composite Finance line
    // FK scalars with the checkout relation; createMany uses scalar FK inputs.
    const checkoutRecord = await tx.enterpriseRetailInvoiceCheckout.create({
      data: {
        organizationId, salesInvoiceId: invoice.id, siteId: input.siteId, warehouseId: input.warehouseId,
        idempotencyKey: input.idempotencyKey, requestFingerprint, preparedByUserId: actorUserId,
      },
    });
    await tx.enterpriseRetailInvoiceCheckoutLine.createMany({
      data: checkoutLines.map((line) => ({ ...line, checkoutId: checkoutRecord.id })),
    });
    const checkout = await tx.enterpriseRetailInvoiceCheckout.findUniqueOrThrow({
      where: { id: checkoutRecord.id }, include: { lines: true },
    });
    return { checkout, invoice, stockWarnings, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

/** Finance may allocate a payment only to the store that issued this Retail
 * invoice. This guard belongs in the canonical allocation service, rather
 * than only in a Retail client screen: Finance URLs can be called directly.
 */
export async function assertRetailInvoicePaymentScopeTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesInvoiceId: string,
  actorUserId: string,
  payment: { financialAccountId: string | null; cashSessionId: string | null; methodType: string; currencyCode: string },
) {
  const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId }, select: { id: true, siteId: true },
  });
  if (!checkout) return;
  await requireRetailSiteCapability(organizationId, actorUserId, checkout.siteId, "COLLECT_PAYMENT", tx, { requireAssignment: true });
  const account = payment.financialAccountId ? await tx.enterpriseFinancialAccount.findFirst({
    where: { organizationId, id: payment.financialAccountId, status: "ACTIVE", archivedAt: null },
    select: { siteId: true, currencyCode: true },
  }) : null;
  if (!account || account.siteId !== checkout.siteId || account.currencyCode !== payment.currencyCode) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH", 409);
  }
  if (payment.methodType === "CASH") {
    const session = payment.cashSessionId ? await tx.enterpriseCashSession.findFirst({
      where: { organizationId, id: payment.cashSessionId, financialAccountId: payment.financialAccountId!, siteId: checkout.siteId },
      select: { id: true },
    }) : null;
    if (!session) throw new EnterpriseRetailError("RETAIL_INVOICE_CASH_SESSION_SITE_MISMATCH", 409);
  }
}

/** Called by Finance in the *same* transaction that allocates the final
 * customer payment. If a lot, an expiry rule or physical stock is invalid,
 * the entire final allocation is rejected; no paid invoice without stock
 * delivery and no stock movement against an unpaid invoice.
 *
 * Financial balance stays in Finance; physical delivery and cost-of-sales
 * valuation are committed atomically with the final payment allocation.
 */
export async function postPaidRetailInvoiceStockTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesInvoiceId: string,
  actorUserId: string,
) {
  const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId },
    include: { invoice: true, lines: { include: { invoiceItem: true,
      returnLines: { where: { request: { status: "COMPLETED" } }, select: { quantity: true } },
    } } },
  });
  if (!checkout || checkout.stockPostedAt) return;
  if (!["PAID", "CREDIT_NOTE"].includes(checkout.invoice.status) || !checkout.invoice.outstandingAmount.isZero() ||
      (checkout.invoice.status === "CREDIT_NOTE" &&
        !checkout.invoice.amountPaid.plus(checkout.invoice.amountCredited).equals(checkout.invoice.grandTotal))) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FULLY_PAID", 409);
  }

  const [configuration, organization] = await Promise.all([
    tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
    tx.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  // If a partial invoice was credited before physical fulfillment, remove
  // completed cancellation quantities before committing cost-of-goods sold.
  const fulfilableLines = checkout.lines.map((line) => ({
    line,
    remaining: decimalMax(new Prisma.Decimal(0), line.invoiceItem.quantity.minus(
      (line.returnLines || []).reduce((total, entry) => total.plus(entry.quantity), new Prisma.Decimal(0)),
    )),
  })).filter(({ line, remaining }) => Boolean(line.inventoryItemId) && remaining.greaterThan(0));
  // The owner may deactivate future checkouts; previously issued invoices
  // still have to be fulfilled, subject to current lot safety rules.
  await assertRetailLotPolicyTx(tx, {
    organizationId,
    warehouseId: checkout.warehouseId,
    timezone: organization?.timezone || "UTC",
    settings: configuration?.settingsJson,
    excludeSalesInvoiceId: checkout.salesInvoiceId,
    lines: fulfilableLines.map(({ line, remaining }) => ({ inventoryItemId: line.inventoryItemId, stockLotId: line.stockLotId, quantity: remaining })),
  });

  for (const { line, remaining } of fulfilableLines) {
    if (!line.inventoryItemId) continue; // Services never debit inventory.
    const balances = await tx.enterpriseInventoryBalance.findMany({
      where: {
        organizationId, warehouseId: checkout.warehouseId, inventoryItemId: line.inventoryItemId,
        stockLotId: line.stockLotId || null, quantityOnHand: { gt: 0 },
      },
      orderBy: [{ storageLocationId: "asc" }, { id: "asc" }],
    });
    const [activeReservations, otherRetailHolds] = await Promise.all([tx.enterpriseInventoryReservation.findMany({
      where: {
        organizationId, warehouseId: checkout.warehouseId, inventoryItemId: line.inventoryItemId,
        status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { quantity: true, fulfilledQuantity: true, storageLocationId: true, lotAllocations: true },
    }), readActiveRetailInvoiceStockHoldsTx(tx, {
      organizationId, warehouseId: checkout.warehouseId, inventoryItemIds: [line.inventoryItemId],
      excludeSalesInvoiceId: checkout.salesInvoiceId,
    })]);
    let stillNeeded = remaining;
    let unscopedReserved = activeReservations
      .filter((reservation) => !reservation.storageLocationId)
      .reduce((sum, reservation) => sum.plus(reservationLegacyRemaining(reservation)), new Prisma.Decimal(0));
    // Another unpaid invoice owns this physical quantity. This checkout's
    // own promise must not block its eventual fulfillment.
    unscopedReserved = unscopedReserved.plus(otherRetailHolds
      .filter((hold) => hold.stockLotId === line.stockLotId || (Boolean(line.stockLotId) && !hold.stockLotId))
      .reduce((sum, hold) => sum.plus(hold.quantity), new Prisma.Decimal(0)));
    // Reserve outstanding sales orders first. InventoryBalance.quantityReserved
    // is a separate legacy field, so these two sources must both be counted.
    for (const balance of balances) {
      if (stillNeeded.isZero()) break;
      const specificReserved = activeReservations.reduce((sum, reservation) => sum.plus(reservationExactBalanceRemaining(reservation, balance.id)).plus(reservation.storageLocationId && reservation.storageLocationId === balance.storageLocationId ? reservationLegacyRemaining(reservation) : 0), new Prisma.Decimal(0));
      const physicallyFree = decimalMax(new Prisma.Decimal(0), balance.quantityOnHand.minus(balance.quantityReserved).minus(specificReserved));
      const unscopedTakenHere = decimalMin(unscopedReserved, physicallyFree);
      unscopedReserved = unscopedReserved.minus(unscopedTakenHere);
      const free = physicallyFree.minus(unscopedTakenHere);
      const take = decimalMin(stillNeeded, free);
      if (!take.greaterThan(0)) continue;
      const issued = await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: checkout.warehouseId,
        storageLocationId: balance.storageLocationId,
        stockLotId: line.stockLotId,
        movementType: "SALE_FULFILLMENT", direction: "OUT", quantity: take.toNumber(),
        sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: checkout.salesInvoiceId,
        sourceLineId: line.invoiceItemId,
        idempotencyKey: `retail-invoice:${checkout.id}:${line.id}:${balance.id}`,
        reason: "Facture Retail intégralement encaissée et allouée",
      }, { consumingRetailInvoiceId: checkout.salesInvoiceId });
      await valueRetailInvoiceFulfillmentIssueTx(
        tx, organizationId, actorUserId, issued.movement.id,
        checkout.salesInvoiceId, checkout.invoice.currencyCode,
      );
      stillNeeded = stillNeeded.minus(take);
    }
    if (!stillNeeded.isZero()) throw new EnterpriseRetailError("RETAIL_INVOICE_STOCK_INSUFFICIENT", 409);
  }
  await tx.enterpriseRetailInvoiceCheckout.update({
    where: { id: checkout.id },
    data: { stockPostedAt: new Date(), stockPostedByUserId: actorUserId, revision: { increment: 1 } },
  });
}
