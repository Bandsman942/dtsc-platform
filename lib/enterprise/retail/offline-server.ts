import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { retailCommercialContextSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { previewRetailCommercialPricing } from "@/lib/enterprise/retail/commercial-engine";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import { executeCanonicalRetailSale } from "@/lib/enterprise/retail/sale-execution";
import { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";

const OFFLINE_SNAPSHOT_TTL_MS = 8 * 60 * 60 * 1000;
const OFFLINE_ALLOWED_TENDERS = new Set(["CASH"]);

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonHash(value: unknown) {
  return sha256(JSON.stringify(value));
}

function decimal(value: Prisma.Decimal.Value = 0) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

type PreviewLine = Awaited<ReturnType<typeof previewRetailCommercialPricing>>["lines"][number];

function serviceValuesFromPreview(line: PreviewLine) {
  const resolvedUnitPrice = decimal(line.resolvedUnitPrice);
  const customerDiscountAmount = decimal(line.discountAmount);
  const taxRate = decimal(line.taxRate);
  if (line.taxIncluded && taxRate.gt(0)) {
    const divisor = decimal(1).plus(taxRate);
    return {
      serviceUnitPrice: money(resolvedUnitPrice.div(divisor)),
      serviceDiscountAmount: money(customerDiscountAmount.div(divisor)),
    };
  }
  return {
    serviceUnitPrice: money(resolvedUnitPrice),
    serviceDiscountAmount: money(customerDiscountAmount),
  };
}

function activePromotionWhere(organizationId: string, at: Date): Prisma.EnterpriseRetailPromotionWhereInput {
  return {
    organizationId,
    status: "ACTIVE",
    archivedAt: null,
    startsAt: { lte: at },
    OR: [{ endsAt: null }, { endsAt: { gte: at } }],
  };
}

export async function buildRetailOfflineSnapshot(args: {
  organizationId: string;
  actorUserId: string;
  siteId: string;
  warehouseId: string;
  currencyCode: string;
  maxItems: number;
}) {
  const now = new Date();
  const [site, warehouse, totalCatalogItems, catalogItems, activePromotionCount, activePriceConditionCount] = await Promise.all([
    prisma.enterpriseSite.findFirst({
      where: { id: args.siteId, organizationId: args.organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, code: true, name: true },
    }),
    prisma.enterpriseWarehouse.findFirst({
      where: { id: args.warehouseId, organizationId: args.organizationId, siteId: args.siteId, status: "ACTIVE", archivedAt: null },
      select: { id: true, code: true, name: true },
    }),
    prisma.enterpriseCatalogItem.count({
      where: { organizationId: args.organizationId, status: "ACTIVE", archivedAt: null, OR: [{ currency: null }, { currency: args.currencyCode }] },
    }),
    prisma.enterpriseCatalogItem.findMany({
      where: { organizationId: args.organizationId, status: "ACTIVE", archivedAt: null, OR: [{ currency: null }, { currency: args.currencyCode }] },
      orderBy: [{ code: "asc" }],
      take: args.maxItems,
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        description: true,
        itemType: true,
        currency: true,
        indicativeSalePrice: true,
        taxCode: true,
        taxable: true,
        trackInventory: true,
        updatedAt: true,
      },
    }),
    prisma.enterpriseRetailPromotion.count({ where: activePromotionWhere(args.organizationId, now) }),
    prisma.enterpriseRetailPriceCondition.count({ where: { organizationId: args.organizationId, isActive: true } }),
  ]);
  if (!site) throw new EnterpriseRetailError("RETAIL_OFFLINE_SITE_INVALID", 409);
  if (!warehouse) throw new EnterpriseRetailError("RETAIL_OFFLINE_WAREHOUSE_INVALID", 409);

  const dynamicPricingBlocked = activePromotionCount > 0 || activePriceConditionCount > 0;
  const itemIds = catalogItems.map((item) => item.id);
  const [pricingPreview, inventoryItems] = await Promise.all([
    itemIds.length && !dynamicPricingBlocked
      ? previewRetailCommercialPricing(
          args.organizationId,
          {
            siteId: args.siteId,
            customerBusinessPartyId: null,
            currencyCode: args.currencyCode,
            soldAt: now,
            lines: itemIds.map((catalogItemId) => ({ catalogItemId, quantity: 1 })),
          },
          { couponCode: null, customerSegmentCode: null, channelCode: "POS" },
        )
      : Promise.resolve(null),
    itemIds.length
      ? prisma.enterpriseInventoryItem.findMany({
          where: { organizationId: args.organizationId, catalogItemId: { in: itemIds }, status: "ACTIVE", archivedAt: null },
          select: { id: true, catalogItemId: true },
        })
      : Promise.resolve([]),
  ]);
  const inventoryItemIds = inventoryItems.map((item) => item.id);
  const [balances, reservations] = await Promise.all([
    inventoryItemIds.length
      ? prisma.enterpriseInventoryBalance.findMany({
          where: { organizationId: args.organizationId, warehouseId: args.warehouseId, inventoryItemId: { in: inventoryItemIds } },
          select: { inventoryItemId: true, quantityOnHand: true, quantityReserved: true },
        })
      : Promise.resolve([]),
    inventoryItemIds.length
      ? prisma.enterpriseInventoryReservation.findMany({
          where: {
            organizationId: args.organizationId,
            warehouseId: args.warehouseId,
            inventoryItemId: { in: inventoryItemIds },
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { inventoryItemId: true, quantity: true, fulfilledQuantity: true },
        })
      : Promise.resolve([]),
  ]);

  const pricingByItem = new Map((pricingPreview?.lines || []).map((line) => [line.catalogItemId, line]));
  const inventoryByCatalog = new Map(inventoryItems.map((item) => [item.catalogItemId, item.id]));
  const onHandByInventory = new Map<string, Prisma.Decimal>();
  const legacyReservedByInventory = new Map<string, Prisma.Decimal>();
  for (const row of balances) {
    onHandByInventory.set(row.inventoryItemId, (onHandByInventory.get(row.inventoryItemId) || decimal()).plus(row.quantityOnHand));
    legacyReservedByInventory.set(row.inventoryItemId, (legacyReservedByInventory.get(row.inventoryItemId) || decimal()).plus(row.quantityReserved));
  }
  const activeReservedByInventory = new Map<string, Prisma.Decimal>();
  for (const row of reservations) {
    const remaining = decimal(row.quantity).minus(row.fulfilledQuantity);
    if (remaining.gt(0)) activeReservedByInventory.set(row.inventoryItemId, (activeReservedByInventory.get(row.inventoryItemId) || decimal()).plus(remaining));
  }

  const items = catalogItems.map((item) => {
    const pricing = pricingByItem.get(item.id);
    const inventoryItemId = inventoryByCatalog.get(item.id) || null;
    const available = inventoryItemId
      ? Prisma.Decimal.max(
          decimal(),
          (onHandByInventory.get(inventoryItemId) || decimal())
            .minus(legacyReservedByInventory.get(inventoryItemId) || decimal())
            .minus(activeReservedByInventory.get(inventoryItemId) || decimal()),
        )
      : decimal();
    const unitPrice = pricing?.resolvedUnitPrice ?? item.indicativeSalePrice?.toFixed() ?? null;
    const serviceValues = pricing ? serviceValuesFromPreview(pricing) : null;
    return {
      catalogItemId: item.id,
      inventoryItemId,
      code: item.code,
      sku: item.sku,
      name: item.name,
      description: item.description,
      itemType: item.itemType,
      currencyCode: args.currencyCode,
      unitPrice,
      serviceUnitPrice: serviceValues?.serviceUnitPrice.toFixed() ?? null,
      customerUnitDiscountAmount: pricing?.discountAmount ?? null,
      serviceUnitDiscountAmount: serviceValues?.serviceDiscountAmount.toFixed() ?? null,
      taxCode: item.taxCode,
      taxCodeId: pricing?.taxCodeId ?? null,
      taxRate: pricing?.taxRate ?? null,
      taxIncluded: pricing?.taxIncluded ?? false,
      unitTaxAmount: pricing?.taxAmount ?? null,
      unitLineTotal: pricing?.lineTotal ?? null,
      trackInventory: item.trackInventory,
      quantityAvailable: available.toFixed(),
      updatedAt: item.updatedAt.toISOString(),
      offlineEligible: !dynamicPricingBlocked && Boolean(pricing) && (!item.trackInventory || Boolean(inventoryItemId)),
    };
  });

  const validUntil = new Date(now.getTime() + OFFLINE_SNAPSHOT_TTL_MS);
  const blockingReason = activePromotionCount > 0
    ? "ACTIVE_PROMOTIONS_REQUIRE_ONLINE"
    : activePriceConditionCount > 0
      ? "DYNAMIC_PRICING_REQUIRES_ONLINE"
      : null;
  const snapshotPayload = {
    schemaVersion: 1,
    organizationId: args.organizationId,
    site,
    warehouse,
    currencyCode: args.currencyCode,
    generatedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    catalog: { total: totalCatalogItems, returned: items.length, truncated: totalCatalogItems > items.length, items },
    policy: {
      saleEnabled: !dynamicPricingBlocked,
      blockingReason,
      allowedTenderTypes: ["CASH"],
      blockedTenderTypes: ["CARD", "MOBILE_MONEY", "TELCO", "BANK_TRANSFER", "GIFT_CARD", "STORE_CREDIT"],
      customerSelectionAllowed: false,
      couponAllowed: false,
      priceOverrideAllowed: false,
      promotionsAllowed: false,
      maxQueueBatch: 25,
    },
  };
  const payloadHash = jsonHash(snapshotPayload);
  const version = `ofs_${payloadHash.slice(0, 24)}`;
  await prisma.enterpriseRetailOfflineSnapshot.upsert({
    where: { organizationId_version: { organizationId: args.organizationId, version } },
    update: { validUntil },
    create: {
      organizationId: args.organizationId,
      version,
      siteId: args.siteId,
      warehouseId: args.warehouseId,
      currencyCode: args.currencyCode,
      payloadHash,
      itemCount: items.length,
      validFrom: now,
      validUntil,
      createdByUserId: args.actorUserId,
    },
  });
  return { ...snapshotPayload, version, payloadHash };
}

async function updateSyncConflict(
  organizationId: string,
  operationUuid: string,
  status: "CONFLICT" | "REJECTED",
  conflictCode: string,
  conflictJson?: Prisma.InputJsonValue,
) {
  return prisma.enterpriseRetailOfflineSyncOperation.update({
    where: { organizationId_operationUuid: { organizationId, operationUuid } },
    data: { status, conflictCode, conflictJson: conflictJson ?? Prisma.JsonNull },
  });
}

function retailErrorCode(error: unknown) {
  return error instanceof EnterpriseRetailError ? error.code : "RETAIL_OFFLINE_SYNC_FAILED";
}

export async function syncRetailOfflineSale(args: {
  organizationId: string;
  actorUserId: string;
  operationUuid: string;
  snapshotVersion: string;
  siteId: string;
  warehouseId: string;
  payload: unknown;
}) {
  const payloadHash = jsonHash(args.payload);
  const existing = await prisma.enterpriseRetailOfflineSyncOperation.findFirst({ where: { organizationId: args.organizationId, operationUuid: args.operationUuid } });
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new EnterpriseRetailError("RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH", 409);
    if (existing.status === "SYNCED") return { operation: existing, idempotent: true };
    if (["CONFLICT", "REJECTED"].includes(existing.status)) return { operation: existing, idempotent: true };
  } else {
    await prisma.enterpriseRetailOfflineSyncOperation.create({
      data: {
        organizationId: args.organizationId,
        operationUuid: args.operationUuid,
        operationType: "SALE",
        siteId: args.siteId,
        warehouseId: args.warehouseId,
        snapshotVersion: args.snapshotVersion,
        payloadHash,
        receivedByUserId: args.actorUserId,
      },
    });
  }

  const snapshot = await prisma.enterpriseRetailOfflineSnapshot.findFirst({
    where: { organizationId: args.organizationId, version: args.snapshotVersion, siteId: args.siteId, warehouseId: args.warehouseId },
  });
  if (!snapshot) {
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "CONFLICT", "OFFLINE_SNAPSHOT_NOT_FOUND");
    return { operation, idempotent: false };
  }
  const rawObject = args.payload && typeof args.payload === "object" && !Array.isArray(args.payload) ? args.payload as Record<string, unknown> : null;
  const capturedAtRaw = rawObject?.soldAt;
  const capturedAt = typeof capturedAtRaw === "string" || capturedAtRaw instanceof Date ? new Date(capturedAtRaw) : null;
  if (!capturedAt || Number.isNaN(capturedAt.getTime()) || capturedAt < snapshot.validFrom || capturedAt > snapshot.validUntil) {
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "CONFLICT", "OFFLINE_SNAPSHOT_EXPIRED", {
      validFrom: snapshot.validFrom.toISOString(),
      validUntil: snapshot.validUntil.toISOString(),
    });
    return { operation, idempotent: false };
  }

  const parsed = retailSaleCreateSchema.safeParse({ ...(rawObject || {}), siteId: args.siteId, warehouseId: args.warehouseId, idempotencyKey: `offline:${args.operationUuid}` });
  if (!parsed.success) {
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "REJECTED", "OFFLINE_SALE_PAYLOAD_INVALID");
    return { operation, idempotent: false };
  }
  const context = retailCommercialContextSchema.safeParse(rawObject || {});
  if (!context.success || context.data.couponCode || context.data.overrideReason || parsed.data.customerBusinessPartyId) {
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "REJECTED", "OFFLINE_COMMERCIAL_CONTEXT_NOT_ALLOWED");
    return { operation, idempotent: false };
  }
  if (!parsed.data.tenders.length || parsed.data.tenders.some((tender) => !OFFLINE_ALLOWED_TENDERS.has(tender.methodType))) {
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "REJECTED", "OFFLINE_TENDER_NOT_ALLOWED");
    return { operation, idempotent: false };
  }

  try {
    const preview = await previewRetailCommercialPricing(
      args.organizationId,
      {
        siteId: args.siteId,
        customerBusinessPartyId: null,
        currencyCode: parsed.data.currencyCode,
        soldAt: parsed.data.soldAt,
        lines: parsed.data.lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity })),
      },
      { couponCode: null, customerSegmentCode: null, channelCode: "POS" },
    );
    const currentByItem = new Map(preview.lines.map((line) => [line.catalogItemId, line]));
    const changedItems = parsed.data.lines
      .filter((line) => {
        const current = currentByItem.get(line.catalogItemId);
        if (!current) return true;
        const serviceValues = serviceValuesFromPreview(current);
        return !decimal(line.unitPrice).equals(serviceValues.serviceUnitPrice)
          || !decimal(line.discountAmount || 0).equals(serviceValues.serviceDiscountAmount)
          || !decimal(line.taxAmount || 0).equals(current.taxAmount);
      })
      .map((line) => line.catalogItemId);
    if (changedItems.length) {
      const operation = await updateSyncConflict(args.organizationId, args.operationUuid, "CONFLICT", "OFFLINE_PRICING_CHANGED", { catalogItemIds: changedItems });
      return { operation, idempotent: false };
    }

    const permissions = await getRetailCommercialPermissions(args.actorUserId, args.organizationId);
    const { result, accounting, loyalty, promotionCount } = await executeCanonicalRetailSale({
      organizationId: args.organizationId,
      actorUserId: args.actorUserId,
      input: parsed.data,
      commercialContext: { ...context.data, couponCode: null, customerSegmentCode: null, channelCode: "POS", overrideReason: null },
      permissions,
    });
    const operation = await prisma.enterpriseRetailOfflineSyncOperation.update({
      where: { organizationId_operationUuid: { organizationId: args.organizationId, operationUuid: args.operationUuid } },
      data: {
        status: "SYNCED",
        serverEntityType: "EnterpriseRetailSale",
        serverEntityId: result.sale.id,
        conflictCode: null,
        conflictJson: Prisma.JsonNull,
        syncedAt: new Date(),
      },
    });
    return { operation, idempotent: result.idempotent, sale: result.sale, accounting, loyalty, promotionCount };
  } catch (error) {
    const code = retailErrorCode(error);
    const conflict = /STOCK|PRICE|PRIC|TAX|ACCOUNT|FINANCE|PERIOD|CURRENCY|CASH_SESSION|READINESS/.test(code);
    const operation = await updateSyncConflict(args.organizationId, args.operationUuid, conflict ? "CONFLICT" : "REJECTED", code);
    return { operation, idempotent: false };
  }
}
