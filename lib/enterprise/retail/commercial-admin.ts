import { Prisma } from "@prisma/client";
import type { retailPriceConditionUpsertSchema, retailPromotionUpsertSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type PriceConditionInput = z.infer<typeof retailPriceConditionUpsertSchema>;
type PromotionInput = z.infer<typeof retailPromotionUpsertSchema>;

async function assertOptionalRetailReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { siteId?: string | null; customerBusinessPartyId?: string | null },
) {
  const [site, customer] = await Promise.all([
    input.siteId ? tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
    input.customerBusinessPartyId ? tx.enterpriseBusinessParty.findFirst({ where: { id: input.customerBusinessPartyId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (input.siteId && !site) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409, { field: "siteId" });
  if (input.customerBusinessPartyId && !customer) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409, { field: "customerBusinessPartyId" });
}

export async function upsertRetailPriceCondition(organizationId: string, actorUserId: string, input: PriceConditionInput) {
  return prisma.$transaction(async (tx) => {
    const price = await tx.enterpriseCatalogPrice.findFirst({
      where: { id: input.catalogPriceId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, catalogItemId: true },
    });
    if (!price) throw new EnterpriseRetailError("RETAIL_PRICE_NOT_CONFIGURED", 404, { catalogPriceId: input.catalogPriceId });
    await assertOptionalRetailReferences(tx, organizationId, input);
    const existing = await tx.enterpriseRetailPriceCondition.findFirst({ where: { organizationId, catalogPriceId: input.catalogPriceId } });
    if (existing) {
      return tx.enterpriseRetailPriceCondition.update({
        where: { id: existing.id },
        data: {
          siteId: input.siteId || null,
          customerBusinessPartyId: input.customerBusinessPartyId || null,
          customerSegmentCode: input.customerSegmentCode || null,
          minQuantity: input.minQuantity === null || input.minQuantity === undefined ? null : new Prisma.Decimal(input.minQuantity),
          maxQuantity: input.maxQuantity === null || input.maxQuantity === undefined ? null : new Prisma.Decimal(input.maxQuantity),
          channelCode: input.channelCode,
          priority: input.priority,
          isActive: input.isActive,
          revision: { increment: 1 },
        },
      });
    }
    return tx.enterpriseRetailPriceCondition.create({
      data: {
        organizationId,
        catalogPriceId: input.catalogPriceId,
        siteId: input.siteId || null,
        customerBusinessPartyId: input.customerBusinessPartyId || null,
        customerSegmentCode: input.customerSegmentCode || null,
        minQuantity: input.minQuantity === null || input.minQuantity === undefined ? null : new Prisma.Decimal(input.minQuantity),
        maxQuantity: input.maxQuantity === null || input.maxQuantity === undefined ? null : new Prisma.Decimal(input.maxQuantity),
        channelCode: input.channelCode,
        priority: input.priority,
        isActive: input.isActive,
        createdByUserId: actorUserId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listRetailPriceConditions(organizationId: string) {
  const conditions = await prisma.enterpriseRetailPriceCondition.findMany({
    where: { organizationId },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  const priceIds = Array.from(new Set(conditions.map((condition) => condition.catalogPriceId)));
  const prices = priceIds.length ? await prisma.enterpriseCatalogPrice.findMany({
    where: { organizationId, id: { in: priceIds } },
    select: { id: true, catalogItemId: true, amount: true, currency: true, effectiveFrom: true, effectiveUntil: true, taxIncluded: true, status: true },
  }) : [];
  const itemIds = Array.from(new Set(prices.map((price) => price.catalogItemId)));
  const items = itemIds.length ? await prisma.enterpriseCatalogItem.findMany({ where: { organizationId, id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const priceById = new Map(prices.map((price) => [price.id, price]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  return conditions.map((condition) => {
    const price = priceById.get(condition.catalogPriceId) || null;
    return { ...condition, price, item: price ? itemById.get(price.catalogItemId) || null : null };
  });
}

export async function upsertRetailPromotion(organizationId: string, actorUserId: string, input: PromotionInput) {
  return prisma.$transaction(async (tx) => {
    await assertOptionalRetailReferences(tx, organizationId, { siteId: input.siteId });
    const existing = await tx.enterpriseRetailPromotion.findUnique({ where: { organizationId_code: { organizationId, code: input.code } } });
    const data = {
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      promotionType: input.promotionType,
      status: input.status,
      priority: input.priority,
      stackMode: input.stackMode,
      couponCode: input.couponCode || null,
      siteId: input.siteId || null,
      customerSegmentCode: input.customerSegmentCode || null,
      currencyCode: input.currencyCode || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt || null,
      conditionsJson: input.conditionsJson ? input.conditionsJson as Prisma.InputJsonValue : Prisma.JsonNull,
      actionJson: input.actionJson as Prisma.InputJsonValue,
      usageLimit: input.usageLimit || null,
      perCustomerLimit: input.perCustomerLimit || null,
      updatedByUserId: actorUserId,
      archivedAt: input.status === "ARCHIVED" ? new Date() : null,
    };
    if (existing) return tx.enterpriseRetailPromotion.update({ where: { id: existing.id }, data: { ...data, revision: { increment: 1 } } });
    return tx.enterpriseRetailPromotion.create({ data: { organizationId, code: input.code, createdByUserId: actorUserId, ...data } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listRetailPromotions(organizationId: string, page = 1, pageSize = 50) {
  const where = { organizationId };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailPromotion.findMany({ where, orderBy: [{ status: "asc" }, { priority: "desc" }, { startsAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailPromotion.count({ where }),
  ]);
  const ids = items.map((item) => item.id);
  const counts = ids.length ? await prisma.enterpriseRetailPromotionRedemption.groupBy({ by: ["promotionId"], where: { organizationId, promotionId: { in: ids } }, _count: { _all: true }, _sum: { discountAmount: true } }) : [];
  const byPromotion = new Map(counts.map((row) => [row.promotionId, { count: row._count._all, discountAmount: row._sum.discountAmount?.toFixed() || "0" }]));
  return { items: items.map((item) => ({ ...item, usage: byPromotion.get(item.id) || { count: 0, discountAmount: "0" } })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}
