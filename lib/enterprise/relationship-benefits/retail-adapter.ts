import { Prisma } from "@prisma/client";
import { canUseModule } from "@/lib/billing/entitlements";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import {
  automaticRetailEffectSupported,
  calculateRetailRelationshipDiscount,
  evaluateRelationshipBenefitSnapshot,
  findActiveRelationshipsForBusinessParty,
  type RelationshipBenefitExecutionContext,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import type {
  PricingDecision,
  RetailRelationshipBenefitPricingAdjustment,
} from "@/lib/enterprise/retail/commercial-engine";
import { prisma } from "@/lib/prisma";

export type RetailRelationshipBenefitEffect = {
  benefitId: string;
  benefitCode: string;
  benefitNameFr: string;
  benefitNameEn: string;
  identityLinkId: string;
  userId: string;
  amount: Prisma.Decimal;
  eligibleAmount: Prisma.Decimal;
  currencyCode: string;
  stackable: boolean;
  context: RelationshipBenefitExecutionContext;
};

export type RetailRelationshipBenefitResolution = {
  adjustment: RetailRelationshipBenefitPricingAdjustment | null;
  effects: RetailRelationshipBenefitEffect[];
};

function zero() {
  return new Prisma.Decimal(0);
}

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function lineGross(decision: PricingDecision) {
  return money(decision.quantity.times(decision.resolvedUnitPrice));
}

function eligibleDecisionIndexes(
  decisions: PricingDecision[],
  categoryByCatalogItemId: Map<string, string | null>,
  conditionsJson: Prisma.JsonValue | null,
) {
  const conditions = objectValue(conditionsJson);
  const catalogItemIds = new Set(stringArray(conditions.catalogItemIds));
  const categoryIds = new Set(stringArray(conditions.categoryIds));
  return decisions
    .map((decision, index) => ({ decision, index }))
    .filter(({ decision }) => {
      if (catalogItemIds.size && !catalogItemIds.has(decision.catalogItemId)) return false;
      const categoryId = categoryByCatalogItemId.get(decision.catalogItemId) || null;
      if (categoryIds.size && (!categoryId || !categoryIds.has(categoryId))) return false;
      return true;
    })
    .map(({ index }) => index);
}

function allocateAmount(args: {
  amount: Prisma.Decimal;
  indexes: number[];
  basis: Prisma.Decimal[];
  capacity: Prisma.Decimal[];
  accumulated: Prisma.Decimal[];
}) {
  const activeIndexes = args.indexes.filter((index) => args.capacity[index].gt(0) && args.basis[index].gt(0));
  if (!activeIndexes.length || args.amount.lte(0)) return zero();
  const basisTotal = activeIndexes.reduce((sum, index) => sum.plus(args.basis[index]), zero());
  if (basisTotal.lte(0)) return zero();

  const cappedAmount = Prisma.Decimal.min(
    args.amount,
    activeIndexes.reduce((sum, index) => sum.plus(args.capacity[index]), zero()),
  );
  let allocated = zero();
  activeIndexes.forEach((index, position) => {
    const remaining = cappedAmount.minus(allocated);
    if (remaining.lte(0)) return;
    const raw =
      position === activeIndexes.length - 1
        ? remaining
        : money(cappedAmount.times(args.basis[index]).div(basisTotal));
    const lineAmount = money(Prisma.Decimal.min(raw, args.capacity[index]));
    if (lineAmount.lte(0)) return;
    args.accumulated[index] = money(args.accumulated[index].plus(lineAmount));
    args.capacity[index] = money(args.capacity[index].minus(lineAmount));
    allocated = money(allocated.plus(lineAmount));
  });
  return allocated;
}

export async function resolveRetailRelationshipBenefitPricing(args: {
  organizationId: string;
  customerBusinessPartyId?: string | null;
  currencyCode: string;
  siteId?: string | null;
  channelCode?: string | null;
  soldAt?: Date | null;
  decisions: PricingDecision[];
}): Promise<RetailRelationshipBenefitResolution> {
  if (!args.customerBusinessPartyId || !args.decisions.length) {
    return { adjustment: null, effects: [] };
  }

  const [benefitsModule, retailModule] = await Promise.all([
    canUseModule(args.organizationId, "RELATIONSHIP_BENEFITS"),
    canUseModule(args.organizationId, "RETAIL_POS"),
  ]);
  if (!benefitsModule.allowed || !retailModule.allowed) {
    return { adjustment: null, effects: [] };
  }

  const links = await findActiveRelationshipsForBusinessParty({
    organizationId: args.organizationId,
    businessPartyId: args.customerBusinessPartyId,
  });
  const linksWithUsers = links.filter(
    (link): link is typeof link & { userId: string } => Boolean(link.userId),
  );
  if (!linksWithUsers.length) return { adjustment: null, effects: [] };

  const accessDecisions = await Promise.all(
    linksWithUsers.map(async (link) => ({
      link,
      access: await resolveEnterpriseIdentityRelationshipAccess({
        userId: link.userId,
        organizationId: args.organizationId,
        identityLinkId: link.id,
      }),
    })),
  );
  const eligibleLinks = accessDecisions
    .filter(
      ({ access }) =>
        access.allowed && access.capabilities.includes("ENTERPRISE_BENEFITS"),
    )
    .map(({ link }) => link);
  if (!eligibleLinks.length) return { adjustment: null, effects: [] };

  const now = args.soldAt || new Date();
  const benefits = await prisma.enterpriseRelationshipBenefit.findMany({
    where: {
      organizationId: args.organizationId,
      status: "ACTIVE",
      archivedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { audiences: true },
    orderBy: [{ createdAt: "asc" }],
    take: 200,
  });
  const retailBenefits = benefits.filter(
    (benefit) =>
      normalizeEnterpriseModuleCode(benefit.targetModuleCode || "") === "RETAIL_POS" &&
      automaticRetailEffectSupported(benefit),
  );
  if (!retailBenefits.length) return { adjustment: null, effects: [] };

  const benefitIds = retailBenefits.map((benefit) => benefit.id);
  const eligibleLinkIds = eligibleLinks.map((link) => link.id);
  const eligibleUserIds = [...new Set(eligibleLinks.map((link) => link.userId))];
  const [assignments, usages, catalogItems] = await Promise.all([
    prisma.enterpriseRelationshipBenefitAssignment.findMany({
      where: {
        organizationId: args.organizationId,
        identityLinkId: { in: eligibleLinkIds },
        benefitId: { in: benefitIds },
      },
      select: { benefitId: true, identityLinkId: true, status: true, startsAt: true, endsAt: true },
      take: 2000,
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId: args.organizationId,
        identityLinkId: { in: eligibleLinkIds },
        userId: { in: eligibleUserIds },
        benefitId: { in: benefitIds },
      },
      select: { benefitId: true, identityLinkId: true, userId: true, status: true, requestedAt: true },
      take: 100000,
    }),
    prisma.enterpriseCatalogItem.findMany({
      where: {
        organizationId: args.organizationId,
        id: { in: args.decisions.map((decision) => decision.catalogItemId) },
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true, categoryId: true },
      take: 200,
    }),
  ]);

  const assignmentByBenefitAndLink = new Map(
    assignments.map((assignment) => [
      `${assignment.benefitId}:${assignment.identityLinkId}`,
      assignment,
    ]),
  );
  const usagesByBenefitAndLink = new Map<string, typeof usages>();
  for (const usage of usages) {
    const key = `${usage.benefitId}:${usage.identityLinkId}`;
    usagesByBenefitAndLink.set(key, [
      ...(usagesByBenefitAndLink.get(key) || []),
      usage,
    ]);
  }
  const categoryByCatalogItemId = new Map(
    catalogItems.map((item) => [item.id, item.categoryId]),
  );

  const transactionAmount = money(
    args.decisions.reduce((sum, decision) => sum.plus(decision.lineTotal), zero()),
  );
  const quantity = args.decisions.reduce(
    (sum, decision) => sum + Number(decision.quantity),
    0,
  );
  const context: RelationshipBenefitExecutionContext = {
    moduleCode: "RETAIL_POS",
    transactionAmount: Number(transactionAmount),
    currencyCode: args.currencyCode,
    businessPartyId: args.customerBusinessPartyId,
    siteId: args.siteId || null,
    channelCode: (args.channelCode || "POS").toUpperCase(),
    catalogItemIds: args.decisions.map((decision) => decision.catalogItemId),
    categoryIds: [...new Set(catalogItems.map((item) => item.categoryId).filter((value): value is string => Boolean(value)))],
    quantity,
    occurredAt: now,
  };

  const candidates = retailBenefits.flatMap((benefit) => {
    const eligibleLink = eligibleLinks.find((link) => {
      const key = `${benefit.id}:${link.id}`;
      const evaluation = evaluateRelationshipBenefitSnapshot({
        benefit,
        link,
        assignment: assignmentByBenefitAndLink.get(key) || null,
        usages: usagesByBenefitAndLink.get(key) || [],
        context,
        now,
        requireBusinessContext: true,
      });
      return evaluation.allowed;
    });
    if (!eligibleLink || !benefit.valueDecimal) return [];

    const indexes = eligibleDecisionIndexes(
      args.decisions,
      categoryByCatalogItemId,
      benefit.conditionsJson,
    );
    if (!indexes.length) return [];
    const basis = indexes.reduce((sum, index) => {
      const gross = lineGross(args.decisions[index]);
      const amount = benefit.stackable
        ? Prisma.Decimal.max(zero(), gross.minus(args.decisions[index].discountAmount))
        : gross;
      return sum.plus(amount);
    }, zero());
    if (basis.lte(0)) return [];

    const amount = calculateRetailRelationshipDiscount({
      benefitType: benefit.benefitType,
      valueType: benefit.valueType,
      valueDecimal: benefit.valueDecimal,
      eligibleAmount: basis,
    });
    if (amount.lte(0)) return [];
    return [{ benefit, link: eligibleLink, indexes, amount }];
  });

  if (!candidates.length) return { adjustment: null, effects: [] };

  const stackable = candidates.filter((candidate) => candidate.benefit.stackable);
  const exclusive = candidates
    .filter((candidate) => !candidate.benefit.stackable)
    .sort((left, right) => right.amount.comparedTo(left.amount));

  const existingPromotionDiscount = args.decisions.reduce(
    (sum, decision) => sum.plus(decision.discountAmount),
    zero(),
  );
  const simulatedCapacity = args.decisions.map((decision) =>
    money(Prisma.Decimal.max(zero(), lineGross(decision).minus(decision.discountAmount))),
  );
  const simulatedAccumulated = args.decisions.map(() => zero());
  let stackableTotal = zero();
  for (const candidate of stackable) {
    const basis = args.decisions.map((decision, index) => {
      if (!candidate.indexes.includes(index)) return zero();
      return simulatedCapacity[index];
    });
    const eligibleAmount = candidate.indexes.reduce(
      (sum, index) => sum.plus(basis[index]),
      zero(),
    );
    const calculatedAmount = calculateRetailRelationshipDiscount({
      benefitType: candidate.benefit.benefitType,
      valueType: candidate.benefit.valueType,
      valueDecimal: candidate.benefit.valueDecimal!,
      eligibleAmount,
    });
    const appliedAmount = allocateAmount({
      amount: calculatedAmount,
      indexes: candidate.indexes,
      basis,
      capacity: simulatedCapacity,
      accumulated: simulatedAccumulated,
    });
    stackableTotal = money(stackableTotal.plus(appliedAmount));
  }
  const bestExclusive = exclusive[0] || null;
  const useExclusive =
    Boolean(bestExclusive) &&
    bestExclusive!.amount.gt(existingPromotionDiscount.plus(stackableTotal));
  const selected = useExclusive ? [bestExclusive!] : stackable;
  if (!selected.length) return { adjustment: null, effects: [] };

  const accumulated = args.decisions.map(() => zero());
  const capacity = args.decisions.map((decision) =>
    useExclusive
      ? lineGross(decision)
      : money(Prisma.Decimal.max(zero(), lineGross(decision).minus(decision.discountAmount))),
  );
  const effects: RetailRelationshipBenefitEffect[] = [];

  for (const candidate of selected) {
    const basis = args.decisions.map((decision, index) => {
      if (!candidate.indexes.includes(index)) return zero();
      return useExclusive ? lineGross(decision) : capacity[index];
    });
    const eligibleAmount = candidate.indexes.reduce(
      (sum, index) => sum.plus(basis[index]),
      zero(),
    );
    const calculatedAmount = calculateRetailRelationshipDiscount({
      benefitType: candidate.benefit.benefitType,
      valueType: candidate.benefit.valueType,
      valueDecimal: candidate.benefit.valueDecimal!,
      eligibleAmount,
    });
    const appliedAmount = allocateAmount({
      amount: calculatedAmount,
      indexes: candidate.indexes,
      basis,
      capacity,
      accumulated,
    });
    if (appliedAmount.lte(0)) continue;
    effects.push({
      benefitId: candidate.benefit.id,
      benefitCode: candidate.benefit.code,
      benefitNameFr: candidate.benefit.nameFr,
      benefitNameEn: candidate.benefit.nameEn,
      identityLinkId: candidate.link.id,
      userId: candidate.link.userId,
      amount: appliedAmount,
      eligibleAmount,
      currencyCode: args.currencyCode,
      stackable: candidate.benefit.stackable,
      context,
    });
  }

  if (!effects.length) return { adjustment: null, effects: [] };
  return {
    adjustment: {
      mode: useExclusive ? "REPLACE_RETAIL_RULES" : "STACK_WITH_RETAIL_RULES",
      benefitIds: effects.map((effect) => effect.benefitId),
      lineDiscounts: args.decisions
        .map((decision, index) => ({
          catalogItemId: decision.catalogItemId,
          amount: accumulated[index],
        }))
        .filter((line) => line.amount.gt(0)),
    },
    effects,
  };
}

export function serializeRetailRelationshipBenefitEffects(
  effects: RetailRelationshipBenefitEffect[],
) {
  return effects.map((effect) => ({
    benefitId: effect.benefitId,
    benefitCode: effect.benefitCode,
    nameFr: effect.benefitNameFr,
    nameEn: effect.benefitNameEn,
    discountAmount: effect.amount.toFixed(),
    currencyCode: effect.currencyCode,
  }));
}


export async function applyRetailRelationshipBenefitEffectsTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorUserId: string;
  saleId: string;
  effects: RetailRelationshipBenefitEffect[];
}) {
  if (!args.effects.length) return [];

  const sale = await args.tx.enterpriseRetailSale.findFirst({
    where: { id: args.saleId, organizationId: args.organizationId },
    select: {
      id: true,
      customerBusinessPartyId: true,
      currencyCode: true,
      siteId: true,
      discountTotal: true,
    },
  });
  if (!sale) throw new Error("RELATIONSHIP_BENEFIT_EFFECT_SALE_NOT_FOUND");
  const effectTotal = args.effects.reduce(
    (sum, effect) => sum.plus(effect.amount),
    new Prisma.Decimal(0),
  );
  if (effectTotal.lte(0) || !sale.customerBusinessPartyId) {
    throw new Error("RELATIONSHIP_BENEFIT_EFFECT_SALE_MISMATCH");
  }

  const moduleRows = await args.tx.enterpriseModule.findMany({
    where: {
      organizationId: args.organizationId,
      moduleCode: { in: ["RELATIONSHIP_BENEFITS", "RETAIL_POS"] },
      isEnabled: true,
    },
    select: { moduleCode: true },
  });
  const enabled = new Set(moduleRows.map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  if (!enabled.has("RELATIONSHIP_BENEFITS") || !enabled.has("RETAIL_POS")) {
    throw new Error("RELATIONSHIP_BENEFIT_EFFECT_MODULE_DISABLED");
  }

  const persisted = [];
  for (const effect of args.effects) {
    if (
      effect.context.businessPartyId !== sale.customerBusinessPartyId ||
      effect.currencyCode.toUpperCase() !== sale.currencyCode.toUpperCase() ||
      (effect.context.siteId && sale.siteId && effect.context.siteId !== sale.siteId)
    ) {
      throw new Error("RELATIONSHIP_BENEFIT_EFFECT_CONTEXT_MISMATCH");
    }
    const effectIdempotencyKey =
      `retail-sale:${args.saleId}:relationship-benefit:${effect.benefitId}`;
    await args.tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.organizationId + ":" + effect.identityLinkId + ":" + effect.benefitId})::bigint)`,
    );

    const existing = await args.tx.enterpriseRelationshipBenefitUsage.findUnique({
      where: {
        organizationId_effectIdempotencyKey: {
          organizationId: args.organizationId,
          effectIdempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.identityLinkId !== effect.identityLinkId ||
        existing.userId !== effect.userId ||
        existing.benefitId !== effect.benefitId ||
        existing.effectEntityId !== args.saleId
      ) {
        throw new Error("RELATIONSHIP_BENEFIT_EFFECT_IDEMPOTENCY_COLLISION");
      }
      persisted.push(existing);
      continue;
    }

    const [benefit, link, assignment, usages] = await Promise.all([
      args.tx.enterpriseRelationshipBenefit.findFirst({
        where: {
          id: effect.benefitId,
          organizationId: args.organizationId,
        },
        include: { audiences: true },
      }),
      args.tx.enterpriseIdentityLink.findFirst({
        where: {
          id: effect.identityLinkId,
          organizationId: args.organizationId,
          userId: effect.userId,
        },
        select: {
          id: true,
          userId: true,
          requestedRelationType: true,
          requestedRoleCode: true,
          status: true,
          activatedAt: true,
          userDecisionAt: true,
          organizationDecisionAt: true,
          personIdentityId: true,
        },
      }),
      args.tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: {
          organizationId: args.organizationId,
          benefitId: effect.benefitId,
          identityLinkId: effect.identityLinkId,
        },
        select: {
          benefitId: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      args.tx.enterpriseRelationshipBenefitUsage.findMany({
        where: {
          organizationId: args.organizationId,
          benefitId: effect.benefitId,
          identityLinkId: effect.identityLinkId,
          userId: effect.userId,
        },
        select: { benefitId: true, status: true, requestedAt: true },
        take: 100000,
      }),
    ]);

    if (!benefit || !link || !automaticRetailEffectSupported(benefit)) {
      throw new Error("RELATIONSHIP_BENEFIT_EFFECT_NOT_SUPPORTED");
    }
    const businessReference = await args.tx.enterprisePersonBusinessReference.findFirst({
      where: {
        organizationId: args.organizationId,
        personIdentityId: link.personIdentityId,
        businessPartyId: sale.customerBusinessPartyId,
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!businessReference) {
      throw new Error("RELATIONSHIP_BENEFIT_EFFECT_BUSINESS_PARTY_MISMATCH");
    }
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit,
      link,
      assignment,
      usages,
      context: effect.context,
      now: effect.context.occurredAt
        ? effect.context.occurredAt instanceof Date
          ? effect.context.occurredAt
          : new Date(effect.context.occurredAt)
        : new Date(),
      requireBusinessContext: true,
    });
    if (!evaluation.allowed) {
      const error = new Error(evaluation.reason) as Error & { code?: string };
      error.code = `RELATIONSHIP_BENEFIT_EFFECT_${evaluation.code}`;
      throw error;
    }
    const expectedEffectAmount = calculateRetailRelationshipDiscount({
      benefitType: benefit.benefitType,
      valueType: benefit.valueType,
      valueDecimal: benefit.valueDecimal!,
      eligibleAmount: effect.eligibleAmount,
    });
    const transactionAmount =
      effect.context.transactionAmount === null ||
      effect.context.transactionAmount === undefined
        ? null
        : new Prisma.Decimal(effect.context.transactionAmount);
    if (
      effect.amount.lte(0) ||
      effect.eligibleAmount.lte(0) ||
      !expectedEffectAmount.equals(effect.amount) ||
      (transactionAmount && effect.eligibleAmount.gt(transactionAmount)) ||
      !effect.context.currencyCode ||
      effect.context.currencyCode.toUpperCase() !== effect.currencyCode.toUpperCase()
    ) {
      throw new Error("RELATIONSHIP_BENEFIT_EFFECT_AMOUNT_INVALID");
    }

    const usage = await args.tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId: args.organizationId,
        benefitId: effect.benefitId,
        identityLinkId: effect.identityLinkId,
        userId: effect.userId,
        actionCode: "CLAIM",
        status: "CONSUMED",
        idempotencyKey: effectIdempotencyKey,
        executionMode: "AUTO_RETAIL",
        effectModuleCode: "RETAIL_POS",
        effectEntityType: "EnterpriseRetailSale",
        effectEntityId: args.saleId,
        effectAmount: effect.amount,
        effectCurrencyCode: effect.currencyCode,
        effectIdempotencyKey,
        effectMetadataJson: {
          businessPartyId: effect.context.businessPartyId || null,
          siteId: effect.context.siteId || null,
          channelCode: effect.context.channelCode || null,
          benefitCode: effect.benefitCode,
          eligibleAmount: effect.eligibleAmount.toFixed(),
        },
        requestedAt: new Date(),
        decidedAt: new Date(),
        consumedAt: new Date(),
        executedAt: new Date(),
        decidedByUserId: args.actorUserId,
      },
    });
    persisted.push(usage);
  }
  return persisted;
}

export async function reverseRetailRelationshipBenefitEffectsTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  saleId: string;
}) {
  return args.tx.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId: args.organizationId,
      effectModuleCode: "RETAIL_POS",
      effectEntityType: "EnterpriseRetailSale",
      effectEntityId: args.saleId,
      executionMode: "AUTO_RETAIL",
      status: "CONSUMED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      revision: { increment: 1 },
    },
  });
}
