import {
  calculateRelationshipBenefitMonetaryEffect,
  evaluateRelationshipBenefitsForBusinessParty,
  type EvaluatedRelationshipBenefit,
  type RelationshipBenefitApplicationDraft,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import { prisma } from "@/lib/prisma";

type RetailRelationshipPricingLine = {
  catalogItemId: string;
  categoryId: string | null;
  quantity: number;
  grossAmount: number;
  currentDiscountAmount: number;
};

export type RetailRelationshipRewardPlan = {
  benefitId: string;
  benefitRevision: number;
  identityLinkId: string;
  userId: string;
  relationType: string;
  benefitType: "CASHBACK" | "CREDIT" | "LOYALTY";
  valueType: string;
  valueDecimal: number;
  currencyCode: string;
  baseAmount: number;
  expectedAmount: number | null;
  loyaltyProgramId: string | null;
  storedValueAccountType: "STORE_CREDIT" | "GIFT_CARD" | null;
  stackable: boolean;
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

function rewardMonetaryAmount(item: EvaluatedRelationshipBenefit, baseAmount: number) {
  if (item.valueDecimal === null || baseAmount <= 0) return 0;
  if (!["CASHBACK", "CREDIT"].includes(item.benefitType)) return 0;
  if (item.valueType === "PERCENT") {
    return Math.min(baseAmount, Math.max(0, baseAmount * Math.min(100, item.valueDecimal) / 100));
  }
  if (item.valueType === "AMOUNT") {
    return Math.min(baseAmount, Math.max(0, item.valueDecimal));
  }
  return 0;
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
  const empty = {
    applications: [] as RelationshipBenefitApplicationDraft[],
    rewards: [] as RetailRelationshipRewardPlan[],
    discountByCatalogItemId: new Map<string, number>(),
    relationshipBenefitIds: [] as string[],
  };
  if (!customerBusinessPartyId || !lines.length) return empty;

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

  const transactional = candidates.filter(
    (item) => item.applicationMode === "TRANSACTIONAL" && item.usable,
  );
  if (!transactional.length) return empty;

  const loyaltyProgramIds = [
    ...new Set(
      transactional
        .filter((item) => item.benefitType === "LOYALTY")
        .map((item) => item.conditions?.retailLoyaltyProgramId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const loyaltyPrograms = loyaltyProgramIds.length
    ? await prisma.enterpriseRetailLoyaltyProgram.findMany({
        where: {
          organizationId,
          id: { in: loyaltyProgramIds },
          status: "ACTIVE",
          archivedAt: null,
        },
        select: { id: true, redeemValuePerPoint: true, currencyCode: true },
      })
    : [];
  const loyaltyById = new Map(loyaltyPrograms.map((program) => [program.id, program]));

  const scored = transactional.flatMap((item) => {
    const matching = eligibleLines(item, lines);
    const baseAmount = matching.reduce(
      (sum, line) => sum + Math.max(0, line.grossAmount - line.currentDiscountAmount),
      0,
    );
    let effect = 0;
    if (["DISCOUNT", "FIXED_PRICE"].includes(item.benefitType)) {
      effect = calculateRelationshipBenefitMonetaryEffect(item, baseAmount);
    } else if (["CASHBACK", "CREDIT"].includes(item.benefitType)) {
      effect = rewardMonetaryAmount(item, baseAmount);
    } else if (item.benefitType === "LOYALTY" && item.valueDecimal !== null) {
      const programId = item.conditions?.retailLoyaltyProgramId || null;
      const program = programId ? loyaltyById.get(programId) : null;
      if (program && program.currencyCode === currencyCode) {
        effect = Math.max(0, item.valueDecimal * Number(program.redeemValuePerPoint));
      }
    }
    return effect > 0 ? [{ item, effect, baseAmount }] : [];
  });
  if (!scored.length) return empty;

  const existingCommercialDiscount = lines.reduce(
    (sum, line) => sum + Math.max(0, line.currentDiscountAmount),
    0,
  );
  const stackable = scored.filter(({ item }) => item.stackable);
  const exclusive = scored
    .filter(({ item }) => !item.stackable)
    .sort((left, right) => right.effect - left.effect);

  const selected =
    existingCommercialDiscount > 0
      ? stackable
      : (() => {
          const stackableTotal = stackable.reduce((sum, candidate) => sum + candidate.effect, 0);
          const bestExclusive = exclusive[0] || null;
          return bestExclusive && bestExclusive.effect >= stackableTotal ? [bestExclusive] : stackable;
        })();

  const pricingSelected = selected.filter(({ item }) =>
    ["DISCOUNT", "FIXED_PRICE"].includes(item.benefitType),
  );
  const rewardSelected = selected.filter(({ item }) =>
    ["CASHBACK", "CREDIT", "LOYALTY"].includes(item.benefitType),
  );

  const remainingByItem = new Map(
    lines.map((line) => [
      line.catalogItemId,
      Math.max(0, line.grossAmount - line.currentDiscountAmount),
    ]),
  );
  const discountByCatalogItemId = new Map<string, number>();
  const applications: RelationshipBenefitApplicationDraft[] = [];

  for (const { item } of pricingSelected) {
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
      benefitRevision: item.revision,
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

  const rewards: RetailRelationshipRewardPlan[] = rewardSelected.flatMap(
    ({ item }) => {
      if (item.valueDecimal === null) return [];
      const benefitType = item.benefitType as RetailRelationshipRewardPlan["benefitType"];
      const matching = eligibleLines(item, lines);
      const rewardBaseAmount = matching.reduce(
        (sum, line) => sum + (remainingByItem.get(line.catalogItemId) || 0),
        0,
      );
      const expectedAmount =
        benefitType === "LOYALTY" ? null : rewardMonetaryAmount(item, rewardBaseAmount);
      if (benefitType !== "LOYALTY" && (!expectedAmount || expectedAmount <= 0)) return [];
      return [{
        benefitId: item.id,
        benefitRevision: item.revision,
        identityLinkId: item.identityLinkId,
        userId: item.userId,
        relationType: item.relationType,
        benefitType,
        valueType: item.valueType,
        valueDecimal: item.valueDecimal,
        currencyCode,
        baseAmount: rewardBaseAmount,
        expectedAmount,
        loyaltyProgramId: item.conditions?.retailLoyaltyProgramId || null,
        storedValueAccountType: item.conditions?.retailStoredValueAccountType || "STORE_CREDIT",
        stackable: item.stackable,
      }];
    },
  );

  return {
    applications,
    rewards,
    discountByCatalogItemId,
    relationshipBenefitIds: selected.map(({ item }) => item.id),
  };
}
