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
    // Distinct quantity/channel/store rules must not overwrite the first rule
    // for a product. Update by rule id + optimistic revision, or create a new
    // distinct rule. The catalog price is not itself the rule's identity.
    const ruleValues = {
      catalogPriceId: input.catalogPriceId,
      siteId: input.siteId || null,
      customerBusinessPartyId: input.customerBusinessPartyId || null,
      customerSegmentCode: input.customerSegmentCode || null,
      minQuantity: input.minQuantity == null ? null : new Prisma.Decimal(input.minQuantity),
      maxQuantity: input.maxQuantity == null ? null : new Prisma.Decimal(input.maxQuantity),
      channelCode: input.channelCode,
      priority: input.priority,
      isActive: input.isActive,
    };
    const duplicate = await tx.enterpriseRetailPriceCondition.findFirst({
      where: {
        organizationId,
        ...(input.id ? { id: { not: input.id } } : {}),
        catalogPriceId: ruleValues.catalogPriceId,
        siteId: ruleValues.siteId,
        customerBusinessPartyId: ruleValues.customerBusinessPartyId,
        customerSegmentCode: ruleValues.customerSegmentCode,
        minQuantity: ruleValues.minQuantity,
        maxQuantity: ruleValues.maxQuantity,
        channelCode: ruleValues.channelCode,
      },
      select: { id: true },
    });
    if (duplicate) throw new EnterpriseRetailError("RETAIL_PRICE_CONDITION_DUPLICATE", 409);
    if (input.id) {
      const changed = await tx.enterpriseRetailPriceCondition.updateMany({
        where: { id: input.id, organizationId, revision: input.revision },
        data: { ...ruleValues, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new EnterpriseRetailError("RETAIL_PRICE_CONDITION_STALE", 409);
      return tx.enterpriseRetailPriceCondition.findFirstOrThrow({ where: { organizationId, id: input.id } });
    }
    return tx.enterpriseRetailPriceCondition.create({
      data: { organizationId, ...ruleValues, createdByUserId: actorUserId },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listRetailPriceConditions(organizationId: string, opts?: {
  page?: number; pageSize?: number; search?: string; from?: Date; toExclusive?: Date; active?: boolean;
}) {
  const search = opts?.search?.trim().slice(0, 120);
  const productMatches = search ? await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, OR: [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ] },
    select: { id: true }, take: 1001,
  }) : null;
  if (productMatches && productMatches.length > 1000) {
    throw new EnterpriseRetailError("RETAIL_SEARCH_TOO_BROAD", 422);
  }
  const matchingPrices = productMatches ? await prisma.enterpriseCatalogPrice.findMany({
    where: { organizationId, catalogItemId: { in: productMatches.map((item) => item.id) } },
    select: { id: true }, take: 2001,
  }) : null;
  if (matchingPrices && matchingPrices.length > 2000) {
    throw new EnterpriseRetailError("RETAIL_SEARCH_TOO_BROAD", 422);
  }
  const where: Prisma.EnterpriseRetailPriceConditionWhereInput = {
    organizationId,
    ...(matchingPrices ? { catalogPriceId: { in: matchingPrices.map((price) => price.id) } } : {}),
    ...(opts?.active !== undefined ? { isActive: opts.active } : {}),
    ...(opts?.from || opts?.toExclusive ? { createdAt: {
      ...(opts?.from ? { gte: opts.from } : {}),
      ...(opts?.toExclusive ? { lt: opts.toExclusive } : {}),
    } } : {}),
  };
  const [conditions, total] = await Promise.all([
    prisma.enterpriseRetailPriceCondition.findMany({
      where, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      ...(opts?.page && opts?.pageSize ? { skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize } : {}),
    }),
    opts?.page && opts?.pageSize ? prisma.enterpriseRetailPriceCondition.count({ where }) : Promise.resolve(0),
  ]);
  const priceIds = Array.from(new Set(conditions.map((condition) => condition.catalogPriceId)));
  const prices = priceIds.length ? await prisma.enterpriseCatalogPrice.findMany({
    where: { organizationId, id: { in: priceIds } },
    select: { id: true, catalogItemId: true, amount: true, currency: true, effectiveFrom: true, effectiveUntil: true, taxIncluded: true, status: true },
  }) : [];
  const itemIds = Array.from(new Set(prices.map((price) => price.catalogItemId)));
  const items = itemIds.length ? await prisma.enterpriseCatalogItem.findMany({ where: { organizationId, id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const priceById = new Map(prices.map((price) => [price.id, price]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const result = conditions.map((condition) => {
    const price = priceById.get(condition.catalogPriceId) || null;
    return { ...condition, price, item: price ? itemById.get(price.catalogItemId) || null : null };
  });
  return opts?.page && opts?.pageSize
    ? { items: result, pagination: { page: opts.page, pageSize: opts.pageSize, total, pageCount: Math.max(1, Math.ceil(total / opts.pageSize)) } }
    : { items: result };
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

export async function listRetailPromotions(organizationId: string, page = 1, pageSize = 50, filters?: {
  search?: string; status?: string; from?: Date; toExclusive?: Date;
}) {
  const search = filters?.search?.trim().slice(0, 120);
  const where: Prisma.EnterpriseRetailPromotionWhereInput = {
    organizationId,
    ...(filters?.status ? { status: filters.status } : {}),
    ...(search ? { OR: [
      { code: { contains: search, mode: "insensitive" } },
      { nameFr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
    ] } : {}),
    ...(filters?.from || filters?.toExclusive ? { createdAt: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.toExclusive ? { lt: filters.toExclusive } : {}),
    } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailPromotion.findMany({ where, orderBy: [{ status: "asc" }, { priority: "desc" }, { startsAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailPromotion.count({ where }),
  ]);
  const ids = items.map((item) => item.id);
  const counts = ids.length ? await prisma.enterpriseRetailPromotionRedemption.groupBy({ by: ["promotionId"], where: { organizationId, promotionId: { in: ids } }, _count: { _all: true }, _sum: { discountAmount: true } }) : [];
  const byPromotion = new Map(counts.map((row) => [row.promotionId, { count: row._count._all, discountAmount: row._sum.discountAmount?.toFixed() || "0" }]));
  return { items: items.map((item) => ({ ...item, usage: byPromotion.get(item.id) || { count: 0, discountAmount: "0" } })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}
