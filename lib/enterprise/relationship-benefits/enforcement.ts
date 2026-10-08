import { Prisma } from "@prisma/client";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import {
  getEnterpriseModuleDefinition,
  normalizeEnterpriseModuleCode,
} from "@/lib/enterprise/module-registry";
import {
  RELATIONSHIP_BENEFIT_TRANSACTIONAL_TYPES,
  relationshipBenefitConditionsSchema,
} from "@/lib/enterprise/relationship-benefits/contracts";
import { prisma } from "@/lib/prisma";

export type RelationshipBenefitApplicationContext = {
  sourceModuleCode?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  quantity?: number | null;
  catalogItemIds?: string[];
  categoryIds?: string[];
  siteId?: string | null;
  channelCode?: string | null;
};

export type EvaluatedRelationshipBenefit = {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  benefitType: string;
  assignmentMode: string;
  valueType: string;
  valueDecimal: number | null;
  currencyCode: string | null;
  minimumAmount: number | null;
  actionCode: string;
  actionLabelFr: string | null;
  actionLabelEn: string | null;
  targetModuleCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerPeriod: number | null;
  usagePeriodDays: number | null;
  stackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  identityLinkId: string;
  userId: string;
  relationType: string;
  applicationMode: "TRANSACTIONAL" | "REQUEST";
  contextRequired: boolean;
  usable: boolean;
  totalRemaining: number | null;
  periodRemaining: number | null;
  blockedReason: string | null;
  conditions: {
    currencyCodes?: string[];
    catalogItemIds?: string[];
    categoryIds?: string[];
    siteIds?: string[];
    channelCodes?: string[];
    sourceModuleCodes?: string[];
    minQuantity?: number;
    maxQuantity?: number;
    retailLoyaltyProgramId?: string;
    retailStoredValueAccountType?: "STORE_CREDIT" | "GIFT_CARD";
  } | null;
};

export type RelationshipBenefitApplicationDraft = {
  benefitId: string;
  identityLinkId: string;
  userId: string;
  applicationType: string;
  baseAmount: number;
  appliedAmount: number;
  currencyCode: string;
  context: Record<string, unknown>;
};

function numberValue(value: Prisma.Decimal | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizeCode(value: string | null | undefined) {
  return value ? value.trim().toUpperCase() : null;
}

function intersects(left: readonly string[], right: readonly string[]) {
  const set = new Set(right);
  return left.some((item) => set.has(item));
}

function relationBenefitApplicationMode(benefitType: string): "TRANSACTIONAL" | "REQUEST" {
  return (RELATIONSHIP_BENEFIT_TRANSACTIONAL_TYPES as readonly string[]).includes(benefitType)
    ? "TRANSACTIONAL"
    : "REQUEST";
}

function conditionsDecision(
  raw: Prisma.JsonValue | null,
  context: RelationshipBenefitApplicationContext | undefined,
) {
  if (raw === null) return { matches: true, contextRequired: false, conditions: null as EvaluatedRelationshipBenefit["conditions"] };
  const parsed = relationshipBenefitConditionsSchema.safeParse(raw);
  if (!parsed.success) {
    return { matches: false, contextRequired: false, conditions: null as EvaluatedRelationshipBenefit["conditions"], blockedReason: "CONDITIONS_INVALID" };
  }

  const conditions = parsed.data;
  let contextRequired = false;
  const requireValue = <T>(value: T | null | undefined) => {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      contextRequired = true;
      return false;
    }
    return true;
  };

  if (conditions.currencyCodes?.length) {
    if (!requireValue(context?.currencyCode)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if (!conditions.currencyCodes.includes(normalizeCode(context?.currencyCode) as string)) return { matches: false, contextRequired: false, conditions, blockedReason: "CURRENCY_MISMATCH" };
  }
  if (conditions.catalogItemIds?.length) {
    if (!requireValue(context?.catalogItemIds)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if (!intersects(conditions.catalogItemIds, context?.catalogItemIds || [])) return { matches: false, contextRequired: false, conditions, blockedReason: "CATALOG_MISMATCH" };
  }
  if (conditions.categoryIds?.length) {
    if (!requireValue(context?.categoryIds)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if (!intersects(conditions.categoryIds, context?.categoryIds || [])) return { matches: false, contextRequired: false, conditions, blockedReason: "CATEGORY_MISMATCH" };
  }
  if (conditions.siteIds?.length) {
    if (!requireValue(context?.siteId)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if (!conditions.siteIds.includes(context?.siteId as string)) return { matches: false, contextRequired: false, conditions, blockedReason: "SITE_MISMATCH" };
  }
  if (conditions.channelCodes?.length) {
    if (!requireValue(context?.channelCode)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if (!conditions.channelCodes.includes(normalizeCode(context?.channelCode) as string)) return { matches: false, contextRequired: false, conditions, blockedReason: "CHANNEL_MISMATCH" };
  }
  if (conditions.sourceModuleCodes?.length) {
    if (!requireValue(context?.sourceModuleCode)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    const sourceModuleCode = normalizeEnterpriseModuleCode(context?.sourceModuleCode as string);
    if (!conditions.sourceModuleCodes.map(normalizeEnterpriseModuleCode).includes(sourceModuleCode)) {
      return { matches: false, contextRequired: false, conditions, blockedReason: "SOURCE_MODULE_MISMATCH" };
    }
  }
  if (conditions.minQuantity !== undefined) {
    if (!requireValue(context?.quantity)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if ((context?.quantity || 0) < conditions.minQuantity) return { matches: false, contextRequired: false, conditions, blockedReason: "QUANTITY_TOO_LOW" };
  }
  if (conditions.maxQuantity !== undefined) {
    if (!requireValue(context?.quantity)) return { matches: false, contextRequired: true, conditions, blockedReason: "CONTEXT_REQUIRED" };
    if ((context?.quantity || 0) > conditions.maxQuantity) return { matches: false, contextRequired: false, conditions, blockedReason: "QUANTITY_TOO_HIGH" };
  }
  return { matches: true, contextRequired, conditions, blockedReason: null as string | null };
}

async function targetModuleAvailable(
  organizationId: string,
  targetModuleCode: string | null,
  context: RelationshipBenefitApplicationContext | undefined,
  enabled: Set<string>,
  entitled: Set<string>,
) {
  if (!targetModuleCode) return { ok: true, code: null as string | null };
  const normalized = normalizeEnterpriseModuleCode(targetModuleCode);
  const definition = getEnterpriseModuleDefinition(normalized);
  if (!definition || !["ACTIVE", "BETA"].includes(definition.implementationStatus)) {
    return { ok: false, code: "TARGET_MODULE_UNAVAILABLE" };
  }
  if (!enabled.has(normalized) || !entitled.has(normalized)) {
    return { ok: false, code: "TARGET_MODULE_UNAVAILABLE" };
  }
  if (context?.sourceModuleCode && normalizeEnterpriseModuleCode(context.sourceModuleCode) !== normalized) {
    return { ok: false, code: "TARGET_MODULE_MISMATCH" };
  }
  return { ok: true, code: null as string | null };
}

export async function evaluateRelationshipBenefitsForIdentityLink({
  organizationId,
  userId,
  identityLinkId,
  context,
}: {
  organizationId: string;
  userId: string;
  identityLinkId?: string | null;
  context?: RelationshipBenefitApplicationContext;
}) {
  const access = await resolveEnterpriseIdentityRelationshipAccess({ organizationId, userId, identityLinkId });
  if (!access.allowed || !access.identityLinkId || !access.capabilities.includes("ENTERPRISE_BENEFITS")) {
    return { access, link: null, items: [] as EvaluatedRelationshipBenefit[] };
  }

  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: {
      id: access.identityLinkId,
      organizationId,
      userId,
      status: "ACTIVE",
      activatedAt: { not: null },
      userDecisionAt: { not: null },
      organizationDecisionAt: { not: null },
    },
    select: {
      id: true,
      userId: true,
      personIdentityId: true,
      requestedRelationType: true,
      requestedRoleCode: true,
    },
  });
  if (!link?.userId) {
    return { access: { ...access, allowed: false, capabilities: [], message: "La relation active est introuvable." }, link: null, items: [] as EvaluatedRelationshipBenefit[] };
  }

  const now = new Date();
  const [benefits, assignments, usages, applications, modules, entitlements] = await Promise.all([
    prisma.enterpriseRelationshipBenefit.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: { audiences: true },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.enterpriseRelationshipBenefitAssignment.findMany({
      where: { organizationId, identityLinkId: link.id, status: "ACTIVE" },
      select: { benefitId: true, startsAt: true, endsAt: true },
      take: 400,
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId,
        identityLinkId: link.id,
        userId,
        status: { notIn: ["REJECTED", "CANCELLED"] },
      },
      select: { benefitId: true, requestedAt: true },
      orderBy: { requestedAt: "desc" },
      take: 2000,
    }),
    prisma.enterpriseRelationshipBenefitApplication.findMany({
      where: {
        organizationId,
        identityLinkId: link.id,
        userId,
        status: "APPLIED",
      },
      select: { benefitId: true, appliedAt: true },
      orderBy: { appliedAt: "desc" },
      take: 2000,
    }),
    prisma.enterpriseModule.findMany({
      where: { organizationId, isEnabled: true },
      select: { moduleCode: true },
    }),
    getOrganizationEntitlements(organizationId),
  ]);

  const enabled = new Set(modules.map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  const entitled = new Set(
    (entitlements?.modules || [])
      .filter((item) => item.allowed)
      .map((item) => normalizeEnterpriseModuleCode(item.moduleCode)),
  );
  const assigned = new Set(
    assignments
      .filter((item) => (!item.startsAt || item.startsAt <= now) && (!item.endsAt || item.endsAt >= now))
      .map((item) => item.benefitId),
  );
  const usageByBenefit = new Map<string, Date[]>();
  for (const usage of usages) {
    const list = usageByBenefit.get(usage.benefitId) || [];
    list.push(usage.requestedAt);
    usageByBenefit.set(usage.benefitId, list);
  }
  for (const application of applications) {
    const list = usageByBenefit.get(application.benefitId) || [];
    list.push(application.appliedAt);
    usageByBenefit.set(application.benefitId, list);
  }

  const items: EvaluatedRelationshipBenefit[] = [];
  for (const benefit of benefits) {
    const audienceMatch =
      benefit.audiences.length === 0 ||
      benefit.audiences.some(
        (audience) =>
          audience.relationType === link.requestedRelationType &&
          (!audience.roleCode || audience.roleCode === link.requestedRoleCode),
      );
    const assignmentMatch = assigned.has(benefit.id);
    const eligibleByTarget =
      benefit.assignmentMode === "MANUAL"
        ? assignmentMatch
        : benefit.assignmentMode === "HYBRID"
          ? audienceMatch || assignmentMatch
          : audienceMatch;
    if (!eligibleByTarget) continue;

    const targetDecision = await targetModuleAvailable(
      organizationId,
      benefit.targetModuleCode,
      context,
      enabled,
      entitled,
    );
    if (!targetDecision.ok) continue;

    const conditionDecision = conditionsDecision(benefit.conditionsJson, context);
    if (!conditionDecision.matches && !conditionDecision.contextRequired) continue;

    let contextRequired = Boolean(conditionDecision.contextRequired);
    let blockedReason = conditionDecision.blockedReason || null;
    if (benefit.minimumAmount !== null) {
      if (context?.amount === null || context?.amount === undefined) {
        contextRequired = true;
        blockedReason = "CONTEXT_REQUIRED";
      } else if (context.amount < Number(benefit.minimumAmount)) {
        continue;
      }
    }
    if (
      benefit.currencyCode &&
      ["AMOUNT", "POINTS"].includes(benefit.valueType) &&
      benefit.valueType === "AMOUNT"
    ) {
      if (!context?.currencyCode) {
        contextRequired = true;
        blockedReason = "CONTEXT_REQUIRED";
      } else if (normalizeCode(context.currencyCode) !== normalizeCode(benefit.currencyCode)) {
        continue;
      }
    }

    const usageDates = usageByBenefit.get(benefit.id) || [];
    const totalRemaining =
      benefit.usageLimitTotal === null
        ? null
        : Math.max(0, benefit.usageLimitTotal - usageDates.length);
    let periodRemaining: number | null = null;
    if (benefit.usageLimitPerPeriod !== null && benefit.usagePeriodDays) {
      const periodStart = new Date(now.getTime() - benefit.usagePeriodDays * 24 * 60 * 60 * 1000);
      const periodUsed = usageDates.filter((requestedAt) => requestedAt >= periodStart).length;
      periodRemaining = Math.max(0, benefit.usageLimitPerPeriod - periodUsed);
    }
    const quotaAvailable =
      (totalRemaining === null || totalRemaining > 0) &&
      (periodRemaining === null || periodRemaining > 0);

    items.push({
      id: benefit.id,
      code: benefit.code,
      nameFr: benefit.nameFr,
      nameEn: benefit.nameEn,
      descriptionFr: benefit.descriptionFr,
      descriptionEn: benefit.descriptionEn,
      benefitType: benefit.benefitType,
      assignmentMode: benefit.assignmentMode,
      valueType: benefit.valueType,
      valueDecimal: numberValue(benefit.valueDecimal),
      currencyCode: benefit.currencyCode,
      minimumAmount: numberValue(benefit.minimumAmount),
      actionCode: benefit.actionCode,
      actionLabelFr: benefit.actionLabelFr,
      actionLabelEn: benefit.actionLabelEn,
      targetModuleCode: benefit.targetModuleCode ? normalizeEnterpriseModuleCode(benefit.targetModuleCode) : null,
      usageLimitTotal: benefit.usageLimitTotal,
      usageLimitPerPeriod: benefit.usageLimitPerPeriod,
      usagePeriodDays: benefit.usagePeriodDays,
      stackable: benefit.stackable,
      startsAt: iso(benefit.startsAt),
      endsAt: iso(benefit.endsAt),
      identityLinkId: link.id,
      userId: link.userId,
      relationType: link.requestedRelationType,
      applicationMode: relationBenefitApplicationMode(benefit.benefitType),
      contextRequired,
      usable: quotaAvailable && !contextRequired,
      totalRemaining,
      periodRemaining,
      blockedReason: quotaAvailable ? blockedReason : "USAGE_LIMIT_REACHED",
      conditions: conditionDecision.conditions,
    });
  }

  return { access, link, items };
}

export async function evaluateRelationshipBenefitsForBusinessParty({
  organizationId,
  businessPartyId,
  context,
}: {
  organizationId: string;
  businessPartyId: string;
  context: RelationshipBenefitApplicationContext;
}) {
  const references = await prisma.enterprisePersonBusinessReference.findMany({
    where: {
      organizationId,
      businessPartyId,
      status: "ACTIVE",
      archivedAt: null,
    },
    select: { personIdentityId: true },
    take: 50,
  });
  if (!references.length) return [] as EvaluatedRelationshipBenefit[];
  const personIdentityIds = [...new Set(references.map((item) => item.personIdentityId))];
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: {
      organizationId,
      personIdentityId: { in: personIdentityIds },
      userId: { not: null },
      status: "ACTIVE",
      activatedAt: { not: null },
      userDecisionAt: { not: null },
      organizationDecisionAt: { not: null },
    },
    select: { id: true, userId: true, activatedAt: true },
    orderBy: { activatedAt: "desc" },
    take: 50,
  });

  const resolved = [];
  for (const link of links) {
    if (!link.userId) continue;
    const decision = await evaluateRelationshipBenefitsForIdentityLink({
      organizationId,
      userId: link.userId,
      identityLinkId: link.id,
      context,
    });
    resolved.push(...decision.items);
  }

  const unique = new Map<string, EvaluatedRelationshipBenefit>();
  for (const item of resolved) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()];
}

export function calculateRelationshipBenefitMonetaryEffect(item: EvaluatedRelationshipBenefit, baseAmount: number) {
  if (!item.usable || item.valueDecimal === null || baseAmount <= 0) return 0;
  if (item.benefitType === "DISCOUNT") {
    if (item.valueType === "PERCENT") {
      return Math.min(baseAmount, Math.max(0, baseAmount * Math.min(100, item.valueDecimal) / 100));
    }
    if (item.valueType === "AMOUNT") {
      return Math.min(baseAmount, Math.max(0, item.valueDecimal));
    }
  }
  if (item.benefitType === "FIXED_PRICE" && item.valueType === "AMOUNT") {
    return Math.min(baseAmount, Math.max(0, baseAmount - item.valueDecimal));
  }
  return 0;
}

export function selectMonetaryRelationshipBenefitApplications(
  items: EvaluatedRelationshipBenefit[],
  baseAmount: number,
  currencyCode: string,
): RelationshipBenefitApplicationDraft[] {
  const candidates = items
    .map((item) => ({ item, amount: calculateRelationshipBenefitMonetaryEffect(item, baseAmount) }))
    .filter((candidate) => candidate.amount > 0);

  const stackable = candidates.filter((candidate) => candidate.item.stackable);
  const exclusive = candidates
    .filter((candidate) => !candidate.item.stackable)
    .sort((left, right) => right.amount - left.amount);

  const stackableTotal = Math.min(
    baseAmount,
    stackable.reduce((sum, candidate) => sum + candidate.amount, 0),
  );
  const bestExclusive = exclusive[0] || null;
  const selected =
    bestExclusive && bestExclusive.amount >= stackableTotal
      ? [bestExclusive]
      : stackable;

  let remaining = baseAmount;
  return selected.flatMap(({ item, amount }) => {
    const appliedAmount = Math.min(remaining, amount);
    if (appliedAmount <= 0) return [];
    remaining -= appliedAmount;
    return [{
      benefitId: item.id,
      identityLinkId: item.identityLinkId,
      userId: item.userId,
      applicationType: item.benefitType,
      baseAmount,
      appliedAmount,
      currencyCode,
      context: {
        relationType: item.relationType,
        benefitCode: item.code,
        targetModuleCode: item.targetModuleCode,
        stackable: item.stackable,
      },
    }];
  });
}

export async function persistRelationshipBenefitApplicationsTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    actorUserId: string;
    sourceModuleCode: string;
    sourceEntityType: string;
    sourceEntityId: string;
    applications: RelationshipBenefitApplicationDraft[];
  },
) {
  const results = [];
  for (const draft of args.applications) {
    const lockKey = `${args.organizationId}:relationship-benefit:${draft.identityLinkId}:${draft.benefitId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const [link, benefit, assignment] = await Promise.all([
      tx.enterpriseIdentityLink.findFirst({
        where: {
          id: draft.identityLinkId,
          organizationId: args.organizationId,
          userId: draft.userId,
          status: "ACTIVE",
          activatedAt: { not: null },
          userDecisionAt: { not: null },
          organizationDecisionAt: { not: null },
        },
        select: { id: true, requestedRelationType: true, requestedRoleCode: true },
      }),
      tx.enterpriseRelationshipBenefit.findFirst({
        where: {
          id: draft.benefitId,
          organizationId: args.organizationId,
          status: "ACTIVE",
          archivedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
        },
        include: { audiences: true },
      }),
      tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: {
          organizationId: args.organizationId,
          benefitId: draft.benefitId,
          identityLinkId: draft.identityLinkId,
          status: "ACTIVE",
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (!link || !benefit) throw new Error("RELATIONSHIP_BENEFIT_APPLICATION_STALE");

    const audienceMatch =
      benefit.audiences.length === 0 ||
      benefit.audiences.some(
        (audience) =>
          audience.relationType === link.requestedRelationType &&
          (!audience.roleCode || audience.roleCode === link.requestedRoleCode),
      );
    const assignmentMatch = Boolean(assignment);
    const eligible =
      benefit.assignmentMode === "MANUAL"
        ? assignmentMatch
        : benefit.assignmentMode === "HYBRID"
          ? audienceMatch || assignmentMatch
          : audienceMatch;
    if (!eligible) throw new Error("RELATIONSHIP_BENEFIT_APPLICATION_NOT_ELIGIBLE");

    const [activeApplicationCount, activeRequestCount] = await Promise.all([
      tx.enterpriseRelationshipBenefitApplication.count({
        where: {
          organizationId: args.organizationId,
          benefitId: draft.benefitId,
          identityLinkId: draft.identityLinkId,
          status: "APPLIED",
        },
      }),
      tx.enterpriseRelationshipBenefitUsage.count({
        where: {
          organizationId: args.organizationId,
          benefitId: draft.benefitId,
          identityLinkId: draft.identityLinkId,
          userId: draft.userId,
          status: { notIn: ["REJECTED", "CANCELLED"] },
        },
      }),
    ]);
    if (benefit.usageLimitTotal !== null && activeApplicationCount + activeRequestCount >= benefit.usageLimitTotal) {
      throw new Error("RELATIONSHIP_BENEFIT_APPLICATION_LIMIT_REACHED");
    }
    if (benefit.usageLimitPerPeriod !== null && benefit.usagePeriodDays) {
      const periodStart = new Date(Date.now() - benefit.usagePeriodDays * 24 * 60 * 60 * 1000);
      const [periodApplicationCount, periodRequestCount] = await Promise.all([
        tx.enterpriseRelationshipBenefitApplication.count({
          where: {
            organizationId: args.organizationId,
            benefitId: draft.benefitId,
            identityLinkId: draft.identityLinkId,
            status: "APPLIED",
            appliedAt: { gte: periodStart },
          },
        }),
        tx.enterpriseRelationshipBenefitUsage.count({
          where: {
            organizationId: args.organizationId,
            benefitId: draft.benefitId,
            identityLinkId: draft.identityLinkId,
            userId: draft.userId,
            status: { notIn: ["REJECTED", "CANCELLED"] },
            requestedAt: { gte: periodStart },
          },
        }),
      ]);
      if (periodApplicationCount + periodRequestCount >= benefit.usageLimitPerPeriod) {
        throw new Error("RELATIONSHIP_BENEFIT_APPLICATION_PERIOD_LIMIT_REACHED");
      }
    }

    const idempotencyKey = `relationship-benefit:${args.sourceEntityType}:${args.sourceEntityId}:${draft.benefitId}:${draft.identityLinkId}`;
    const existing = await tx.enterpriseRelationshipBenefitApplication.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: args.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      results.push(existing);
      continue;
    }

    const application = await tx.enterpriseRelationshipBenefitApplication.create({
      data: {
        organizationId: args.organizationId,
        benefitId: draft.benefitId,
        identityLinkId: draft.identityLinkId,
        userId: draft.userId,
        sourceModuleCode: normalizeEnterpriseModuleCode(args.sourceModuleCode),
        sourceEntityType: args.sourceEntityType,
        sourceEntityId: args.sourceEntityId,
        applicationType: draft.applicationType,
        baseAmount: new Prisma.Decimal(draft.baseAmount),
        appliedAmount: new Prisma.Decimal(draft.appliedAmount),
        currencyCode: draft.currencyCode,
        idempotencyKey,
        contextJson: draft.context as Prisma.InputJsonValue,
        appliedByUserId: args.actorUserId,
      },
    });
    results.push(application);
  }
  return results;
}

export async function reverseRelationshipBenefitApplicationsTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    reason: string;
  },
) {
  return tx.enterpriseRelationshipBenefitApplication.updateMany({
    where: {
      organizationId: args.organizationId,
      sourceEntityType: args.sourceEntityType,
      sourceEntityId: args.sourceEntityId,
      status: "APPLIED",
    },
    data: {
      status: "REVERSED",
      reversedAt: new Date(),
      reversalReason: args.reason.slice(0, 1000),
    },
  });
}
