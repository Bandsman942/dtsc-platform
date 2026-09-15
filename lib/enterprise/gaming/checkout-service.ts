import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertAccountingApprovalCandidate, createAccountingApprovalAssignment } from "@/lib/enterprise/accounting/accounting-approval-service";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import {
  EnterpriseGamingCheckoutError,
  ensureGamingWalkInPartyTx,
  gamingMoney,
  loadGamingCheckoutDetail,
  uniqueValues,
} from "@/lib/enterprise/gaming/checkout-common";
import type { gamingCheckoutPrepareSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type PrepareInput = z.infer<typeof gamingCheckoutPrepareSchema>;

type ExtraLine = {
  item: {
    id: string;
    name: string;
    trackInventory: boolean;
    itemType: string;
  };
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  netUnitPrice: Prisma.Decimal;
  net: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
};

function pricingSnapshotServiceName(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const serviceName = (value as Record<string, unknown>).serviceName;
  return typeof serviceName === "string" && serviceName.trim() ? serviceName.trim() : null;
}

async function resolveExtraItemsTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  currency: string,
  extraItems: PrepareInput["extraItems"],
): Promise<ExtraLine[]> {
  if (!extraItems.length) return [];
  const ids = extraItems.map((item) => item.catalogItemId);
  if (uniqueValues(ids).length !== ids.length) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_DUPLICATE_EXTRA_ITEM", 400);
  const now = new Date();
  const items = await tx.enterpriseCatalogItem.findMany({
    where: { id: { in: ids }, organizationId, status: "ACTIVE", archivedAt: null },
    include: {
      prices: {
        where: {
          status: "ACTIVE",
          archivedAt: null,
          priceType: "SALE",
          currency,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
  if (items.length !== ids.length) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_ITEM_INVALID", 409);
  const byId = new Map(items.map((item) => [item.id, item]));
  return extraItems.map((requested) => {
    const item = byId.get(requested.catalogItemId)!;
    if (item.itemType === "SERVICE") {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_MUST_BE_PHYSICAL", 409, { catalogItemId: item.id });
    }
    const price = item.prices[0];
    if (!price) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_PRICE_MISSING", 409, { catalogItemId: item.id, currency });
    }
    const quantity = gamingMoney(requested.quantity);
    const unitPrice = gamingMoney(price.amount);
    const taxRate = gamingMoney(price.taxRate || 0);
    const netUnitPrice = price.taxIncluded && taxRate.gt(0)
      ? gamingMoney(unitPrice.div(new Prisma.Decimal(1).plus(taxRate)))
      : unitPrice;
    const net = gamingMoney(quantity.times(netUnitPrice));
    const tax = taxRate.gt(0) ? gamingMoney(net.times(taxRate)) : gamingMoney(0);
    const total = gamingMoney(net.plus(tax));
    return {
      item: { id: item.id, name: item.name, trackInventory: item.trackInventory, itemType: item.itemType },
      quantity,
      unitPrice,
      netUnitPrice,
      net,
      tax,
      total,
    };
  });
}

export async function prepareGamingCheckout(organizationId: string, actorUserId: string, input: PrepareInput) {
  const existingByKey = await prisma.enterpriseGamingCheckout.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    select: { id: true, sessionId: true },
  });
  if (existingByKey) {
    if (existingByKey.sessionId !== input.sessionId) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_IDEMPOTENCY_CONFLICT", 409);
    }
    return { ...(await loadGamingCheckoutDetail(organizationId, existingByKey.id)), idempotent: true };
  }
  const existingBySession = await prisma.enterpriseGamingCheckout.findFirst({
    where: { organizationId, sessionId: input.sessionId },
    select: { id: true },
  });
  if (existingBySession) return { ...(await loadGamingCheckoutDetail(organizationId, existingBySession.id)), idempotent: true };

  await assertAccountingApprovalCandidate({
    organizationId,
    targetEntityType: "EnterpriseSalesInvoice",
    requesterUserId: actorUserId,
    approverUserId: input.invoiceApproverUserId,
  });

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const lockKey = `${organizationId}:gaming-checkout:${input.sessionId}`;
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingSession" WHERE id = ${input.sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);

      const retryByKey = await tx.enterpriseGamingCheckout.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { id: true, sessionId: true },
      });
      if (retryByKey) {
        if (retryByKey.sessionId !== input.sessionId) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_IDEMPOTENCY_CONFLICT", 409);
        return retryByKey.id;
      }
      const retryBySession = await tx.enterpriseGamingCheckout.findFirst({
        where: { organizationId, sessionId: input.sessionId },
        select: { id: true },
      });
      if (retryBySession) return retryBySession.id;

      const session = await tx.enterpriseGamingSession.findFirst({
        where: { id: input.sessionId, organizationId, archivedAt: null },
        include: { station: true },
      });
      if (!session) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SESSION_NOT_FOUND", 404);
      if (!["ENDED", "TO_CHECKOUT"].includes(session.status)) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SESSION_NOT_READY", 409);
      }
      if (!session.serviceCatalogItemId || !session.finalAmount || !session.finalAmount.isPositive() || !session.currency) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_BILLABLE_SESSION_REQUIRED", 409);
      }
      const service = await tx.enterpriseCatalogItem.findFirst({
        where: {
          id: session.serviceCatalogItemId,
          organizationId,
          status: "ACTIVE",
          archivedAt: null,
          itemType: "SERVICE",
        },
      });
      if (!service) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SERVICE_INVALID", 409);

      const extraLines = await resolveExtraItemsTx(tx, organizationId, session.currency, input.extraItems);
      const trackedExtras = extraLines.filter((line) => line.item.trackInventory);
      const inventoryItems = trackedExtras.length
        ? await tx.enterpriseInventoryItem.findMany({
            where: {
              organizationId,
              catalogItemId: { in: trackedExtras.map((line) => line.item.id) },
              status: "ACTIVE",
              archivedAt: null,
            },
          })
        : [];
      if (inventoryItems.length !== trackedExtras.length) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVENTORY_ITEM_REQUIRED", 409);
      }
      if (inventoryItems.some((item) => item.lotTracking)) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_LOT_SELECTION_REQUIRED", 409);
      }
      const inventoryByCatalogId = new Map(inventoryItems.map((item) => [item.catalogItemId, item]));
      if (trackedExtras.length && !input.warehouseId) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_WAREHOUSE_REQUIRED", 409);
      }

      const stationAsset = await tx.enterpriseAsset.findFirst({
        where: { id: session.station.assetId, organizationId, archivedAt: null },
        select: { id: true, siteId: true },
      });
      if (!stationAsset) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_STATION_ASSET_INVALID", 409);
      if (input.warehouseId) {
        const warehouse = await tx.enterpriseWarehouse.findFirst({
          where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null },
          select: { id: true, siteId: true },
        });
        if (!warehouse) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_WAREHOUSE_INVALID", 409);
        if (stationAsset.siteId && warehouse.siteId !== stationAsset.siteId) {
          throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_WAREHOUSE_SITE_MISMATCH", 409);
        }
        if (input.storageLocationId) {
          const location = await tx.enterpriseStorageLocation.findFirst({
            where: {
              id: input.storageLocationId,
              organizationId,
              warehouseId: warehouse.id,
              status: "ACTIVE",
              archivedAt: null,
            },
            select: { id: true },
          });
          if (!location) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_LOCATION_INVALID", 409);
        }
      }

      const businessParty = session.businessPartyId
        ? await tx.enterpriseBusinessParty.findFirst({
            where: {
              id: session.businessPartyId,
              organizationId,
              status: "ACTIVE",
              archivedAt: null,
              roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
            },
          })
        : await ensureGamingWalkInPartyTx(tx, organizationId, actorUserId);
      if (!businessParty) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CUSTOMER_INVALID", 409);

      const serviceAmount = gamingMoney(session.finalAmount);
      const subtotal = gamingMoney(extraLines.reduce((total, line) => total.plus(line.net), serviceAmount));
      const taxTotal = gamingMoney(extraLines.reduce((total, line) => total.plus(line.tax), gamingMoney(0)));
      const grandTotal = gamingMoney(extraLines.reduce((total, line) => total.plus(line.total), serviceAmount));
      const serviceDescription = pricingSnapshotServiceName(session.pricingSnapshotJson) || service.name;
      const invoice = await tx.enterpriseSalesInvoice.create({
        data: {
          organizationId,
          number: financeReference("INV"),
          businessPartyId: businessParty.id,
          status: "PENDING_APPROVAL",
          invoiceDate: new Date(),
          dueDate: new Date(),
          currencyCode: session.currency,
          paymentTerms: "Point of service",
          notes: `Gaming session ${session.reference}`,
          subtotal,
          discountTotal: gamingMoney(0),
          taxTotal,
          grandTotal,
          outstandingAmount: grandTotal,
          createdByUserId: actorUserId,
          items: {
            create: [
              {
                organizationId,
                catalogItemId: service.id,
                description: serviceDescription,
                quantity: gamingMoney(1),
                unitPrice: serviceAmount,
                discountAmount: gamingMoney(0),
                netAmount: serviceAmount,
                taxAmount: gamingMoney(0),
                totalAmount: serviceAmount,
              },
              ...extraLines.map((line) => ({
                organizationId,
                catalogItemId: line.item.id,
                description: line.item.name,
                quantity: line.quantity,
                unitPrice: line.netUnitPrice,
                discountAmount: gamingMoney(0),
                netAmount: line.net,
                taxAmount: line.tax,
                totalAmount: line.total,
              })),
            ],
          },
        },
        include: { items: true },
      });
      const checkout = await tx.enterpriseGamingCheckout.create({
        data: {
          organizationId,
          reference: `GC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          sessionId: session.id,
          salesInvoiceId: invoice.id,
          status: "INVOICE_PENDING",
          idempotencyKey: input.idempotencyKey,
          createdByUserId: actorUserId,
        },
      });
      await createAccountingApprovalAssignment(tx, {
        organizationId,
        targetEntityType: "EnterpriseSalesInvoice",
        targetEntityId: invoice.id,
        requesterUserId: actorUserId,
        approverUserId: input.invoiceApproverUserId,
      });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterpriseSalesInvoice",
        entityId: invoice.id,
        eventType: "SALES_INVOICE_SUBMIT",
        summary: `Customer invoice ${invoice.number}: SUBMIT`,
        actorUserId,
        fromStatus: "DRAFT",
        toStatus: "PENDING_APPROVAL",
        metadataJson: {
          source: "GAMING_CHECKOUT",
          checkoutId: checkout.id,
          sessionId: session.id,
          approverUserId: input.invoiceApproverUserId,
        },
      });

      if (session.status !== "TO_CHECKOUT") {
        await tx.enterpriseGamingSession.update({
          where: { id: session.id },
          data: { status: "TO_CHECKOUT", updatedByUserId: actorUserId, revision: { increment: 1 } },
        });
        await tx.enterpriseGamingSessionTransition.upsert({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `CHECKOUT:${checkout.id}:OPEN` } },
          update: {},
          create: {
            organizationId,
            sessionId: session.id,
            action: "CHECKOUT_OPEN",
            idempotencyKey: `CHECKOUT:${checkout.id}:OPEN`,
            fromStatus: session.status,
            toStatus: "TO_CHECKOUT",
            actorUserId,
            metadataJson: { checkoutId: checkout.id, salesInvoiceId: invoice.id },
          },
        });
      }

      for (const line of trackedExtras) {
        const inventoryItem = inventoryByCatalogId.get(line.item.id)!;
        const invoiceItem = invoice.items.find((item) => item.catalogItemId === line.item.id);
        if (!invoiceItem) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_LINE_MISSING", 409);
        await applyStockMovementTx(tx, organizationId, actorUserId, {
          inventoryItemId: inventoryItem.id,
          warehouseId: input.warehouseId!,
          storageLocationId: input.storageLocationId || null,
          stockLotId: null,
          movementType: "SALE_FULFILLMENT",
          direction: "OUT",
          quantity: Number(line.quantity),
          sourceEntityType: "EnterpriseGamingCheckout",
          sourceEntityId: checkout.id,
          sourceLineId: invoiceItem.id,
          idempotencyKey: `gaming-checkout:${checkout.id}:${invoiceItem.id}:out`,
          reason: `Gaming checkout ${checkout.reference}`,
        });
      }
      return checkout.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

    return { ...(await loadGamingCheckoutDetail(organizationId, createdId)), idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingCheckout.findFirst({
        where: {
          organizationId,
          OR: [{ sessionId: input.sessionId }, { idempotencyKey: input.idempotencyKey }],
        },
        select: { id: true, sessionId: true },
      });
      if (retry?.sessionId === input.sessionId) {
        return { ...(await loadGamingCheckoutDetail(organizationId, retry.id)), idempotent: true };
      }
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}

export async function listGamingCheckouts(
  organizationId: string,
  input: { page: number; pageSize: number; status?: string; search?: string },
) {
  const page = Math.max(1, Math.trunc(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(input.pageSize || 20)));
  const where: Prisma.EnterpriseGamingCheckoutWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { reference: { contains: input.search, mode: "insensitive" } },
            { session: { reference: { contains: input.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseGamingCheckout.findMany({
      where,
      include: { session: { include: { station: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.enterpriseGamingCheckout.count({ where }),
    prisma.enterpriseGamingCheckout.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const invoiceIds = items.map((item) => item.salesInvoiceId);
  const invoices = invoiceIds.length
    ? await prisma.enterpriseSalesInvoice.findMany({
        where: { organizationId, id: { in: invoiceIds } },
        include: { receivable: true },
      })
    : [];
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  return {
    items: items.map((item) => ({ ...item, invoice: invoiceById.get(item.salesInvoiceId) || null })),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
  };
}

export async function getGamingCheckout(organizationId: string, checkoutId: string) {
  return loadGamingCheckoutDetail(organizationId, checkoutId);
}
