import { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import type { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type RetailSaleInput = z.infer<typeof retailSaleCreateSchema>;

type CommercialContext = {
  couponCode?: string | null;
  customerSegmentCode?: string | null;
  channelCode?: string | null;
  overrideReason?: string | null;
};

type CommercialPermissions = {
  canOverridePrice: boolean;
  canOverrideDiscount: boolean;
  canOverrideTax: boolean;
};

type PricingLineRequest = {
  catalogItemId: string;
  quantity: number;
  requestedUnitPrice?: number;
  requestedDiscountAmount?: number;
  requestedTaxAmount?: number;
  inventoryItemId?: string | null;
  stockLotId?: string | null;
};

type PricingDecision = {
  catalogItemId: string;
  catalogPriceId: string | null;
  quantity: Prisma.Decimal;
  baseUnitPrice: Prisma.Decimal;
  resolvedUnitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxRate: Prisma.Decimal;
  taxIncluded: boolean;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  pricingSource: string;
  promotionIds: string[];
  promotions: Array<{ id: string; code: string; discountAmount: Prisma.Decimal }>;
  context: Record<string, unknown>;
  inventoryItemId?: string | null;
  stockLotId?: string | null;
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionMatches(
  condition: {
    siteId: string | null;
    customerBusinessPartyId: string | null;
    customerSegmentCode: string | null;
    minQuantity: Prisma.Decimal | null;
    maxQuantity: Prisma.Decimal | null;
    channelCode: string;
    priority: number;
  },
  context: { siteId?: string | null; customerBusinessPartyId?: string | null; customerSegmentCode?: string | null; channelCode: string; quantity: Prisma.Decimal },
) {
  if (condition.siteId && condition.siteId !== context.siteId) return false;
  if (condition.customerBusinessPartyId && condition.customerBusinessPartyId !== context.customerBusinessPartyId) return false;
  if (condition.customerSegmentCode && condition.customerSegmentCode !== context.customerSegmentCode) return false;
  if (condition.channelCode && condition.channelCode !== context.channelCode) return false;
  if (condition.minQuantity && context.quantity.lessThan(condition.minQuantity)) return false;
  if (condition.maxQuantity && context.quantity.greaterThan(condition.maxQuantity)) return false;
  return true;
}

function conditionScore(condition: { siteId: string | null; customerBusinessPartyId: string | null; customerSegmentCode: string | null; minQuantity: Prisma.Decimal | null; maxQuantity: Prisma.Decimal | null; priority: number }) {
  return condition.priority * 1000
    + (condition.customerBusinessPartyId ? 400 : 0)
    + (condition.customerSegmentCode ? 200 : 0)
    + (condition.siteId ? 100 : 0)
    + (condition.minQuantity || condition.maxQuantity ? 50 : 0);
}

function promotionConditionMatches(
  promotion: { conditionsJson: Prisma.JsonValue | null; siteId: string | null; customerSegmentCode: string | null; currencyCode: string | null; couponCode: string | null },
  input: { catalogItemId: string; categoryId: string | null; quantity: Prisma.Decimal; gross: Prisma.Decimal; cartSubtotal: Prisma.Decimal; siteId?: string | null; customerSegmentCode?: string | null; currencyCode: string; couponCode?: string | null },
) {
  if (promotion.siteId && promotion.siteId !== input.siteId) return false;
  if (promotion.customerSegmentCode && promotion.customerSegmentCode !== input.customerSegmentCode) return false;
  if (promotion.currencyCode && promotion.currencyCode !== input.currencyCode) return false;
  if (promotion.couponCode && promotion.couponCode !== input.couponCode) return false;
  const condition = objectValue(promotion.conditionsJson);
  const productIds = stringArray(condition.productIds);
  const categoryIds = stringArray(condition.categoryIds);
  if (productIds.length && !productIds.includes(input.catalogItemId)) return false;
  if (categoryIds.length && (!input.categoryId || !categoryIds.includes(input.categoryId))) return false;
  const minQuantity = numberValue(condition.minQuantity);
  const maxQuantity = numberValue(condition.maxQuantity);
  const minLineSubtotal = numberValue(condition.minLineSubtotal);
  const minCartSubtotal = numberValue(condition.minCartSubtotal);
  if (minQuantity !== null && input.quantity.lessThan(minQuantity)) return false;
  if (maxQuantity !== null && input.quantity.greaterThan(maxQuantity)) return false;
  if (minLineSubtotal !== null && input.gross.lessThan(minLineSubtotal)) return false;
  if (minCartSubtotal !== null && input.cartSubtotal.lessThan(minCartSubtotal)) return false;
  return true;
}

function promotionDiscount(
  promotion: { promotionType: string; actionJson: Prisma.JsonValue },
  line: { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; gross: Prisma.Decimal },
) {
  const action = objectValue(promotion.actionJson);
  if (promotion.promotionType === "PERCENTAGE") {
    const percent = numberValue(action.percent);
    return percent && percent > 0 ? money(line.gross.times(percent).div(100)) : decimal(0);
  }
  if (promotion.promotionType === "FIXED_AMOUNT") {
    const amount = numberValue(action.amount);
    return amount && amount > 0 ? money(Prisma.Decimal.min(line.gross, amount)) : decimal(0);
  }
  if (promotion.promotionType === "QUANTITY_BREAK") {
    const minimum = numberValue(action.minQuantity);
    if (!minimum || line.quantity.lessThan(minimum)) return decimal(0);
    const unitPrice = numberValue(action.unitPrice);
    if (unitPrice !== null && unitPrice >= 0) return money(Prisma.Decimal.max(0, line.gross.minus(line.quantity.times(unitPrice))));
    const percent = numberValue(action.percent);
    return percent && percent > 0 ? money(line.gross.times(percent).div(100)) : decimal(0);
  }
  if (promotion.promotionType === "BUY_X_GET_Y") {
    const buyQuantity = numberValue(action.buyQuantity);
    const getQuantity = numberValue(action.getQuantity);
    if (!buyQuantity || !getQuantity || buyQuantity <= 0 || getQuantity <= 0) return decimal(0);
    const groupSize = buyQuantity + getQuantity;
    const freeQuantity = Math.floor(line.quantity.toNumber() / groupSize) * getQuantity;
    return money(Prisma.Decimal.min(line.gross, line.unitPrice.times(freeQuantity)));
  }
  return decimal(0);
}

async function resolveTax(
  organizationId: string,
  item: { taxable: boolean; taxCode: string | null },
  effectiveAt: Date,
) {
  if (!item.taxable) return { taxCodeId: null as string | null, taxRate: decimal(0) };
  if (!item.taxCode) throw new EnterpriseRetailError("RETAIL_TAX_CONFIGURATION_REQUIRED", 409);
  const taxCode = await prisma.enterpriseTaxCode.findFirst({
    where: { organizationId, code: item.taxCode, isActive: true },
    select: { id: true },
  });
  if (!taxCode) throw new EnterpriseRetailError("RETAIL_TAX_CONFIGURATION_REQUIRED", 409, { taxCode: item.taxCode });
  const rate = await prisma.enterpriseTaxRate.findFirst({
    where: {
      organizationId,
      taxCodeId: taxCode.id,
      status: "ACTIVE",
      effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rate) throw new EnterpriseRetailError("RETAIL_TAX_RATE_REQUIRED", 409, { taxCode: item.taxCode });
  return { taxCodeId: taxCode.id, taxRate: rate.rate };
}

async function resolvePricingDecisions(
  organizationId: string,
  input: {
    siteId?: string | null;
    customerBusinessPartyId?: string | null;
    currencyCode: string;
    soldAt?: Date;
    lines: PricingLineRequest[];
  },
  context: CommercialContext,
  permissions: CommercialPermissions,
) {
  const effectiveAt = input.soldAt || new Date();
  const channelCode = (context.channelCode || "POS").toUpperCase();
  const catalogItemIds = Array.from(new Set(input.lines.map((line) => line.catalogItemId)));
  if (catalogItemIds.length !== input.lines.length) throw new EnterpriseRetailError("RETAIL_DUPLICATE", 409, { entity: "catalogItemId" });

  const items = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: catalogItemIds }, status: "ACTIVE", archivedAt: null },
    select: { id: true, name: true, categoryId: true, currency: true, indicativeSalePrice: true, taxable: true, taxCode: true },
  });
  if (items.length !== catalogItemIds.length) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);
  const itemById = new Map(items.map((item) => [item.id, item]));

  const prices = await prisma.enterpriseCatalogPrice.findMany({
    where: {
      organizationId,
      catalogItemId: { in: catalogItemIds },
      priceType: "SALE",
      currency: input.currencyCode,
      status: "ACTIVE",
      archivedAt: null,
      effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: effectiveAt } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const priceIds = prices.map((price) => price.id);
  const conditions = priceIds.length ? await prisma.enterpriseRetailPriceCondition.findMany({ where: { organizationId, catalogPriceId: { in: priceIds }, isActive: true } }) : [];
  const conditionsByPriceId = new Map<string, typeof conditions>();
  for (const condition of conditions) conditionsByPriceId.set(condition.catalogPriceId, [...(conditionsByPriceId.get(condition.catalogPriceId) || []), condition]);
  const pricesByItemId = new Map<string, typeof prices>();
  for (const price of prices) pricesByItemId.set(price.catalogItemId, [...(pricesByItemId.get(price.catalogItemId) || []), price]);

  const activePromotions = await prisma.enterpriseRetailPromotion.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      startsAt: { lte: effectiveAt },
      OR: [{ endsAt: null }, { endsAt: { gte: effectiveAt } }],
    },
    orderBy: [{ priority: "desc" }, { startsAt: "desc" }],
  });
  const promotionIds = activePromotions.map((promotion) => promotion.id);
  const usage = promotionIds.length ? await prisma.enterpriseRetailPromotionRedemption.groupBy({ by: ["promotionId"], where: { organizationId, promotionId: { in: promotionIds } }, _count: { _all: true } }) : [];
  const usageByPromotion = new Map(usage.map((row) => [row.promotionId, row._count._all]));
  const customerUsage = input.customerBusinessPartyId && promotionIds.length
    ? await prisma.enterpriseRetailPromotionRedemption.groupBy({ by: ["promotionId"], where: { organizationId, promotionId: { in: promotionIds }, customerBusinessPartyId: input.customerBusinessPartyId }, _count: { _all: true } })
    : [];
  const customerUsageByPromotion = new Map(customerUsage.map((row) => [row.promotionId, row._count._all]));

  const baseLines = input.lines.map((line) => {
    const item = itemById.get(line.catalogItemId);
    if (!item) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);
    if (item.currency && item.currency !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409, { catalogItemId: item.id });
    const quantity = decimal(line.quantity);
    const candidates = (pricesByItemId.get(item.id) || []).flatMap((price) => {
      const priceConditions = conditionsByPriceId.get(price.id) || [];
      if (!priceConditions.length) return [{ price, score: 0 }];
      return priceConditions
        .filter((condition) => conditionMatches(condition, { siteId: input.siteId, customerBusinessPartyId: input.customerBusinessPartyId, customerSegmentCode: context.customerSegmentCode, channelCode, quantity }))
        .map((condition) => ({ price, score: conditionScore(condition) }));
    }).sort((a, b) => b.score - a.score || b.price.effectiveFrom.getTime() - a.price.effectiveFrom.getTime());
    const selected = candidates[0]?.price || null;
    const fallback = item.indicativeSalePrice;
    if (!selected && fallback === null) throw new EnterpriseRetailError("RETAIL_PRICE_NOT_CONFIGURED", 409, { catalogItemId: item.id });
    const baseUnitPrice = selected ? selected.amount : decimal(fallback!);
    const requestedUnitPrice = line.requestedUnitPrice === undefined ? baseUnitPrice : decimal(line.requestedUnitPrice);
    let resolvedUnitPrice = baseUnitPrice;
    let pricingSource = selected ? "CATALOG_PRICE" : "INDICATIVE_FALLBACK";
    let priceOverride = false;
    if (!requestedUnitPrice.equals(baseUnitPrice)) {
      if (!permissions.canOverridePrice) throw new EnterpriseRetailError("RETAIL_PRICE_OVERRIDE_FORBIDDEN", 403, { catalogItemId: item.id });
      resolvedUnitPrice = requestedUnitPrice;
      pricingSource = "MANUAL_OVERRIDE";
      priceOverride = true;
    }
    return { line, item, quantity, selected, baseUnitPrice, resolvedUnitPrice, pricingSource, priceOverride, gross: money(quantity.times(resolvedUnitPrice)) };
  });
  const cartSubtotal = money(baseLines.reduce((sum, line) => sum.plus(line.gross), decimal(0)));

  const bundleDiscountByItem = new Map<string, Array<{ promotion: (typeof activePromotions)[number]; amount: Prisma.Decimal }>>();
  for (const promotion of activePromotions.filter((item) => item.promotionType === "BUNDLE")) {
    if (promotion.usageLimit && (usageByPromotion.get(promotion.id) || 0) >= promotion.usageLimit) continue;
    if (promotion.perCustomerLimit && input.customerBusinessPartyId && (customerUsageByPromotion.get(promotion.id) || 0) >= promotion.perCustomerLimit) continue;
    if (promotion.siteId && promotion.siteId !== input.siteId) continue;
    if (promotion.customerSegmentCode && promotion.customerSegmentCode !== context.customerSegmentCode) continue;
    if (promotion.currencyCode && promotion.currencyCode !== input.currencyCode) continue;
    if (promotion.couponCode && promotion.couponCode !== context.couponCode) continue;
    const action = objectValue(promotion.actionJson);
    const productIds = stringArray(action.productIds);
    const bundlePrice = numberValue(action.bundlePrice);
    if (productIds.length < 2 || bundlePrice === null || bundlePrice <= 0 || !productIds.every((id) => baseLines.some((line) => line.item.id === id))) continue;
    const participating = baseLines.filter((line) => productIds.includes(line.item.id));
    const participatingGross = participating.reduce((sum, line) => sum.plus(line.gross), decimal(0));
    const totalDiscount = money(Prisma.Decimal.max(0, participatingGross.minus(bundlePrice)));
    if (totalDiscount.isZero()) continue;
    let allocated = decimal(0);
    participating.forEach((line, index) => {
      const amount = index === participating.length - 1
        ? money(totalDiscount.minus(allocated))
        : money(totalDiscount.times(line.gross).div(participatingGross));
      allocated = allocated.plus(amount);
      bundleDiscountByItem.set(line.item.id, [...(bundleDiscountByItem.get(line.item.id) || []), { promotion, amount }]);
    });
  }

  const decisions: PricingDecision[] = [];
  let anyOverride = false;
  for (const base of baseLines) {
    const promotionCandidates: Array<{ promotion: (typeof activePromotions)[number]; amount: Prisma.Decimal }> = [...(bundleDiscountByItem.get(base.item.id) || [])];
    for (const promotion of activePromotions.filter((item) => item.promotionType !== "BUNDLE")) {
      if (promotion.usageLimit && (usageByPromotion.get(promotion.id) || 0) >= promotion.usageLimit) continue;
      if (promotion.perCustomerLimit && input.customerBusinessPartyId && (customerUsageByPromotion.get(promotion.id) || 0) >= promotion.perCustomerLimit) continue;
      if (!promotionConditionMatches(promotion, {
        catalogItemId: base.item.id,
        categoryId: base.item.categoryId,
        quantity: base.quantity,
        gross: base.gross,
        cartSubtotal,
        siteId: input.siteId,
        customerSegmentCode: context.customerSegmentCode,
        currencyCode: input.currencyCode,
        couponCode: context.couponCode,
      })) continue;
      const amount = promotionDiscount(promotion, { quantity: base.quantity, unitPrice: base.resolvedUnitPrice, gross: base.gross });
      if (amount.gt(0)) promotionCandidates.push({ promotion, amount });
    }

    const stackable = promotionCandidates.filter((candidate) => candidate.promotion.stackMode === "STACKABLE");
    const exclusive = promotionCandidates.filter((candidate) => candidate.promotion.stackMode !== "STACKABLE").sort((a, b) => b.amount.comparedTo(a.amount));
    const applied = [...stackable, ...(exclusive[0] ? [exclusive[0]] : [])];
    const automaticDiscount = money(Prisma.Decimal.min(base.gross, applied.reduce((sum, candidate) => sum.plus(candidate.amount), decimal(0))));
    const requestedDiscount = decimal(base.line.requestedDiscountAmount || 0);
    let discountAmount = automaticDiscount;
    let discountOverride = false;
    if (!requestedDiscount.isZero() && !requestedDiscount.equals(automaticDiscount)) {
      if (!permissions.canOverrideDiscount) throw new EnterpriseRetailError("RETAIL_DISCOUNT_OVERRIDE_FORBIDDEN", 403, { catalogItemId: base.item.id });
      discountAmount = requestedDiscount;
      discountOverride = true;
    }
    if (discountAmount.greaterThan(base.gross)) throw new EnterpriseRetailError("RETAIL_LINE_TOTAL_INVALID", 409, { catalogItemId: base.item.id });

    const tax = await resolveTax(organizationId, base.item, effectiveAt);
    const taxIncluded = Boolean(base.selected?.taxIncluded);
    const afterDiscount = money(base.gross.minus(discountAmount));
    let computedTax = decimal(0);
    let lineTotal = afterDiscount;
    if (tax.taxRate.gt(0)) {
      if (taxIncluded) computedTax = money(afterDiscount.times(tax.taxRate).div(decimal(1).plus(tax.taxRate)));
      else {
        computedTax = money(afterDiscount.times(tax.taxRate));
        lineTotal = money(afterDiscount.plus(computedTax));
      }
    }
    const requestedTax = decimal(base.line.requestedTaxAmount || 0);
    let taxAmount = computedTax;
    let taxOverride = false;
    if (!requestedTax.isZero() && !requestedTax.equals(computedTax)) {
      if (!permissions.canOverrideTax) throw new EnterpriseRetailError("RETAIL_TAX_OVERRIDE_FORBIDDEN", 403, { catalogItemId: base.item.id });
      taxAmount = requestedTax;
      lineTotal = taxIncluded ? afterDiscount : money(afterDiscount.plus(taxAmount));
      taxOverride = true;
    }
    if (base.priceOverride || discountOverride || taxOverride) anyOverride = true;
    decisions.push({
      catalogItemId: base.item.id,
      catalogPriceId: base.selected?.id || null,
      quantity: base.quantity,
      baseUnitPrice: base.baseUnitPrice,
      resolvedUnitPrice: base.resolvedUnitPrice,
      discountAmount,
      taxCodeId: tax.taxCodeId,
      taxRate: tax.taxRate,
      taxIncluded,
      taxAmount,
      lineTotal,
      pricingSource: base.pricingSource,
      promotionIds: applied.map((candidate) => candidate.promotion.id),
      promotions: applied.map((candidate) => ({ id: candidate.promotion.id, code: candidate.promotion.code, discountAmount: money(candidate.amount) })),
      context: {
        siteId: input.siteId || null,
        customerBusinessPartyId: input.customerBusinessPartyId || null,
        customerSegmentCode: context.customerSegmentCode || null,
        couponCode: context.couponCode || null,
        channelCode,
        effectiveAt: effectiveAt.toISOString(),
        priceOverride: base.priceOverride,
        discountOverride,
        taxOverride,
      },
      inventoryItemId: base.line.inventoryItemId,
      stockLotId: base.line.stockLotId,
    });
  }

  if (anyOverride && (!context.overrideReason || context.overrideReason.trim().length < 3)) {
    throw new EnterpriseRetailError("RETAIL_PRICE_OVERRIDE_REASON_REQUIRED", 400);
  }
  return decisions;
}

export async function prepareCommercialRetailSaleV2(
  organizationId: string,
  input: RetailSaleInput,
  context: CommercialContext,
  permissions: CommercialPermissions,
) {
  const decisions = await resolvePricingDecisions(
    organizationId,
    {
      siteId: input.siteId,
      customerBusinessPartyId: input.customerBusinessPartyId,
      currencyCode: input.currencyCode,
      soldAt: input.soldAt,
      lines: input.lines.map((line) => ({
        catalogItemId: line.catalogItemId,
        quantity: line.quantity,
        requestedUnitPrice: line.unitPrice,
        requestedDiscountAmount: line.discountAmount,
        requestedTaxAmount: line.taxAmount,
        inventoryItemId: line.inventoryItemId,
        stockLotId: line.stockLotId,
      })),
    },
    context,
    permissions,
  );
  const decisionByItem = new Map(decisions.map((decision) => [decision.catalogItemId, decision]));
  return {
    input: {
      ...input,
      lines: input.lines.map((line) => {
        const decision = decisionByItem.get(line.catalogItemId);
        if (!decision) throw new EnterpriseRetailError("RETAIL_PRICE_NOT_CONFIGURED", 409, { catalogItemId: line.catalogItemId });
        return {
          ...line,
          unitPrice: Number(decision.resolvedUnitPrice.toString()),
          discountAmount: Number(decision.discountAmount.toString()),
          taxAmount: Number(decision.taxAmount.toString()),
        };
      }),
    },
    decisions,
    overrideApplied: decisions.some((decision) => decision.pricingSource === "MANUAL_OVERRIDE" || Boolean(decision.context.discountOverride) || Boolean(decision.context.taxOverride)),
    overrideReason: context.overrideReason?.trim() || null,
  };
}

export async function previewRetailCommercialPricing(
  organizationId: string,
  input: { siteId?: string | null; customerBusinessPartyId?: string | null; currencyCode: string; soldAt?: Date; lines: Array<{ catalogItemId: string; quantity: number }> },
  context: CommercialContext,
) {
  const decisions = await resolvePricingDecisions(
    organizationId,
    { ...input, lines: input.lines.map((line) => ({ ...line })) },
    context,
    { canOverridePrice: false, canOverrideDiscount: false, canOverrideTax: false },
  );
  return {
    lines: decisions.map((decision) => ({
      catalogItemId: decision.catalogItemId,
      catalogPriceId: decision.catalogPriceId,
      quantity: decision.quantity.toFixed(),
      baseUnitPrice: decision.baseUnitPrice.toFixed(),
      resolvedUnitPrice: decision.resolvedUnitPrice.toFixed(),
      discountAmount: decision.discountAmount.toFixed(),
      taxCodeId: decision.taxCodeId,
      taxRate: decision.taxRate.toFixed(),
      taxIncluded: decision.taxIncluded,
      taxAmount: decision.taxAmount.toFixed(),
      lineTotal: decision.lineTotal.toFixed(),
      pricingSource: decision.pricingSource,
      promotions: decision.promotions.map((promotion) => ({ ...promotion, discountAmount: promotion.discountAmount.toFixed() })),
    })),
    subtotal: money(decisions.reduce((sum, decision) => sum.plus(decision.quantity.times(decision.resolvedUnitPrice)), decimal(0))).toFixed(),
    discountTotal: money(decisions.reduce((sum, decision) => sum.plus(decision.discountAmount), decimal(0))).toFixed(),
    taxTotal: money(decisions.reduce((sum, decision) => sum.plus(decision.taxAmount), decimal(0))).toFixed(),
    grandTotal: money(decisions.reduce((sum, decision) => sum.plus(decision.lineTotal), decimal(0))).toFixed(),
    currencyCode: input.currencyCode,
  };
}

export async function persistRetailCommercialDecisions(
  organizationId: string,
  saleId: string,
  customerBusinessPartyId: string | null | undefined,
  currencyCode: string,
  decisions: PricingDecision[],
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailPricingDecision.count({ where: { organizationId, saleId } });
    if (!existing) {
      await tx.enterpriseRetailPricingDecision.createMany({
        data: decisions.map((decision) => ({
          organizationId,
          saleId,
          catalogItemId: decision.catalogItemId,
          catalogPriceId: decision.catalogPriceId,
          quantity: decision.quantity,
          baseUnitPrice: decision.baseUnitPrice,
          resolvedUnitPrice: decision.resolvedUnitPrice,
          discountAmount: decision.discountAmount,
          taxCodeId: decision.taxCodeId,
          taxRate: decision.taxRate,
          taxIncluded: decision.taxIncluded,
          taxAmount: decision.taxAmount,
          lineTotal: decision.lineTotal,
          pricingSource: decision.pricingSource,
          promotionIdsJson: decision.promotionIds.length ? decision.promotionIds : Prisma.JsonNull,
          contextJson: decision.context as Prisma.InputJsonValue,
        })),
      });
    }
    const promotionTotals = new Map<string, { amount: Prisma.Decimal; couponCode: string | null }>();
    for (const decision of decisions) {
      const couponCode = typeof decision.context.couponCode === "string" ? decision.context.couponCode : null;
      for (const promotion of decision.promotions) {
        const current = promotionTotals.get(promotion.id) || { amount: decimal(0), couponCode };
        current.amount = current.amount.plus(promotion.discountAmount);
        promotionTotals.set(promotion.id, current);
      }
    }
    for (const [promotionId, summary] of promotionTotals) {
      const idempotencyKey = `retail-sale:${saleId}:promotion:${promotionId}`;
      await tx.enterpriseRetailPromotionRedemption.upsert({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
        update: {},
        create: {
          organizationId,
          promotionId,
          saleId,
          customerBusinessPartyId: customerBusinessPartyId || null,
          couponCode: summary.couponCode,
          discountAmount: money(summary.amount),
          currencyCode,
          idempotencyKey,
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
