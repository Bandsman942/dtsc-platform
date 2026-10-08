import {
  calculateRelationshipBenefitMonetaryEffect,
  evaluateRelationshipBenefitsForBusinessParty,
  type EvaluatedRelationshipBenefit,
  type RelationshipBenefitApplicationDraft,
} from "@/lib/enterprise/relationship-benefits/enforcement";

type RetailRelationshipPricingLine = {
  catalogItemId: string;
  categoryId: string | null;
  quantity: number;
  grossAmount: number;
  currentDiscountAmount: number;
};

function eligibleLines(
  item: EvaluatedRelationshipBenefit,
  lines: RetailRelationshipPricingLine[],
) {
  const catalogIds = item.conditions?.catalogItemIds || [];
  const categoryIds = item.conditions?.categoryIds || [];
  return lines.filter((line) => {
    if (catalogIds.length && !catalogIds.includes(line.catalogItemId)) return false;
    if (categoryIds.length && (!line.categoryId || !categoryIds.includes(line.categoryId))) return false;
    return true;
  });
}

export async function resolveRetailRelationshipBenefitPricing({
  organizationId,
  customerBusinessPartyId,
  currencyCode,
  siteId,
  channelCode,
  lines,
}: {
  organizationId: string;
  customerBusinessPartyId: string | null | undefined;
  currencyCode: string;
  siteId?: string | null;
  channelCode: string;
  lines: RetailRelationshipPricingLine[];
}) {
  if (!customerBusinessPartyId || !lines.length) {
    return {
      applications: [] as RelationshipBenefitApplicationDraft[],
      discountByCatalogItemId: new Map<string, number>(),
      relationshipBenefitIds: [] as string[],
    };
  }

  const cartSubtotal = lines.reduce((sum, line) => sum + line.grossAmount, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const candidates = await evaluateRelationshipBenefitsForBusinessParty({
    organizationId,
    businessPartyId: customerBusinessPartyId,
    context: {
      sourceModuleCode: "RETAIL_POS",
      amount: cartSubtotal,
      currencyCode,
      quantity: totalQuantity,
      catalogItemIds: lines.map((line) => line.catalogItemId),
      categoryIds: lines.flatMap((line) => line.categoryId ? [line.categoryId] : []),
      siteId: siteId || null,
      channelCode,
    },
  });

  const pricingCandidates = candidates.filter(
    (item) =>
      item.applicationMode === "TRANSACTIONAL" &&
      item.usable &&
      ["DISCOUNT", "FIXED_PRICE"].includes(item.benefitType),
  );
  if (!pricingCandidates.length) {
    return {
      applications: [] as RelationshipBenefitApplicationDraft[],
      discountByCatalogItemId: new Map<string, number>(),
      relationshipBenefitIds: [] as string[],
    };
  }

  const existingCommercialDiscount = lines.reduce(
    (sum, line) => sum + Math.max(0, line.currentDiscountAmount),
    0,
  );

  const scored = pricingCandidates.flatMap((item) => {
    const matching = eligibleLines(item, lines);
    const baseAmount = matching.reduce(
      (sum, line) => sum + Math.max(0, line.grossAmount - line.currentDiscountAmount),
      0,
    );
    const effect = calculateRelationshipBenefitMonetaryEffect(item, baseAmount);
    return effect > 0 ? [{ item, effect }] : [];
  });
  if (!scored.length) {
    return {
      applications: [] as RelationshipBenefitApplicationDraft[],
      discountByCatalogItemId: new Map<string, number>(),
      relationshipBenefitIds: [] as string[],
    };
  }

  const stackable = scored.filter(({ item }) => item.stackable);
  const exclusive = scored
    .filter(({ item }) => !item.stackable)
    .sort((left, right) => right.effect - left.effect);

  let selected: typeof scored;
  if (existingCommercialDiscount > 0) {
    selected = stackable;
  } else {
    const stackableTotal = stackable.reduce((sum, candidate) => sum + candidate.effect, 0);
    const bestExclusive = exclusive[0] || null;
    selected = bestExclusive && bestExclusive.effect >= stackableTotal ? [bestExclusive] : stackable;
  }

  const remainingByItem = new Map(
    lines.map((line) => [
      line.catalogItemId,
      Math.max(0, line.grossAmount - line.currentDiscountAmount),
    ]),
  );
  const discountByCatalogItemId = new Map<string, number>();
  const applications: RelationshipBenefitApplicationDraft[] = [];

  for (const { item } of selected) {
    const matching = eligibleLines(item, lines).filter(
      (line) => (remainingByItem.get(line.catalogItemId) || 0) > 0,
    );
    const baseAmount = matching.reduce(
      (sum, line) => sum + (remainingByItem.get(line.catalogItemId) || 0),
      0,
    );
    const requestedEffect = calculateRelationshipBenefitMonetaryEffect(item, baseAmount);
    const appliedAmount = Math.min(baseAmount, requestedEffect);
    if (appliedAmount <= 0) continue;

    let allocated = 0;
    matching.forEach((line, index) => {
      const available = remainingByItem.get(line.catalogItemId) || 0;
      const share =
        index === matching.length - 1
          ? Math.max(0, appliedAmount - allocated)
          : Math.min(available, appliedAmount * (available / baseAmount));
      allocated += share;
      remainingByItem.set(line.catalogItemId, Math.max(0, available - share));
      discountByCatalogItemId.set(
        line.catalogItemId,
        (discountByCatalogItemId.get(line.catalogItemId) || 0) + share,
      );
    });

    applications.push({
      benefitId: item.id,
      identityLinkId: item.identityLinkId,
      userId: item.userId,
      applicationType: item.benefitType,
      baseAmount,
      appliedAmount: allocated,
      currencyCode,
      context: {
        relationType: item.relationType,
        benefitCode: item.code,
        targetModuleCode: item.targetModuleCode,
        stackable: item.stackable,
        channelCode,
        siteId: siteId || null,
        catalogItemIds: matching.map((line) => line.catalogItemId),
      },
    });
  }

  return {
    applications,
    discountByCatalogItemId,
    relationshipBenefitIds: applications.map((item) => item.benefitId),
  };
}
