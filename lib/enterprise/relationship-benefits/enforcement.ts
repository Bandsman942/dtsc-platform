import { Prisma } from "@prisma/client";
import { canUseModule } from "@/lib/billing/entitlements";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type RelationshipBenefitExecutionContext = {
  moduleCode: string;
  transactionAmount?: number | null;
  currencyCode?: string | null;
  businessPartyId?: string | null;
  siteId?: string | null;
  channelCode?: string | null;
  catalogItemIds?: string[];
  categoryIds?: string[];
  quantity?: number | null;
  occurredAt?: string | Date | null;
};

export type RelationshipBenefitDenialCode =
  | "RELATIONSHIP_INACTIVE"
  | "BENEFITS_CAPABILITY_DENIED"
  | "BENEFIT_INACTIVE"
  | "TARGET_MISMATCH"
  | "TARGET_MODULE_DENIED"
  | "AUDIENCE_MISMATCH"
  | "ASSIGNMENT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "MINIMUM_AMOUNT_NOT_MET"
  | "CONDITIONS_NOT_MET"
  | "CONDITIONS_UNSUPPORTED"
  | "TOTAL_LIMIT_REACHED"
  | "PERIOD_LIMIT_REACHED";

type BenefitLike = {
  id: string;
  assignmentMode: string;
  currencyCode: string | null;
  minimumAmount: Prisma.Decimal | null;
  targetModuleCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerPeriod: number | null;
  usagePeriodDays: number | null;
  stackable: boolean;
  benefitType: string;
  valueType: string;
  valueDecimal: Prisma.Decimal | null;
  conditionsJson: Prisma.JsonValue | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  archivedAt: Date | null;
  audiences: Array<{ relationType: string; roleCode: string | null }>;
};

type LinkLike = {
  id: string;
  userId: string | null;
  requestedRelationType: string;
  requestedRoleCode: string | null;
  status: string;
  activatedAt: Date | null;
  userDecisionAt: Date | null;
  organizationDecisionAt: Date | null;
};

type AssignmentLike = {
  benefitId: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

type UsageLike = {
  benefitId: string;
  status: string;
  requestedAt: Date;
};

export type RelationshipBenefitEvaluation = {
  allowed: boolean;
  code: "OK" | RelationshipBenefitDenialCode;
  reason: string;
  totalRemaining: number | null;
  periodRemaining: number | null;
  requiresBusinessContext: boolean;
};

const CONDITION_KEYS = new Set([
  "channelCodes",
  "siteIds",
  "catalogItemIds",
  "categoryIds",
  "weekdays",
  "minimumQuantity",
]);

function activeWindow(startsAt: Date | null, endsAt: Date | null, now: Date) {
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function objectValue(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function intersects(left: string[], right: string[]) {
  if (!left.length) return true;
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function contextDate(context: RelationshipBenefitExecutionContext | null | undefined, fallback: Date) {
  if (!context?.occurredAt) return fallback;
  const value = context.occurredAt instanceof Date ? context.occurredAt : new Date(context.occurredAt);
  return Number.isNaN(value.getTime()) ? fallback : value;
}

export function benefitConditionsSupported(
  conditionsJson: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
) {
  const conditions = objectValue(conditionsJson);
  return Object.keys(conditions).every((key) => CONDITION_KEYS.has(key));
}

export function matchesRelationshipBenefitConditions(
  conditionsJson: Prisma.JsonValue | null | undefined,
  context: RelationshipBenefitExecutionContext,
  now = new Date(),
) {
  if (!benefitConditionsSupported(conditionsJson)) return false;
  const conditions = objectValue(conditionsJson);
  const channels = stringArray(conditions.channelCodes);
  const sites = stringArray(conditions.siteIds);
  const catalogItems = stringArray(conditions.catalogItemIds);
  const categories = stringArray(conditions.categoryIds);
  const weekdays = numberArray(conditions.weekdays);
  const minimumQuantity =
    typeof conditions.minimumQuantity === "number" && Number.isFinite(conditions.minimumQuantity)
      ? conditions.minimumQuantity
      : null;

  if (channels.length && (!context.channelCode || !channels.includes(context.channelCode.toUpperCase()))) return false;
  if (sites.length && (!context.siteId || !sites.includes(context.siteId))) return false;
  if (catalogItems.length && !intersects(catalogItems, context.catalogItemIds || [])) return false;
  if (categories.length && !intersects(categories, context.categoryIds || [])) return false;
  if (weekdays.length && !weekdays.includes(contextDate(context, now).getDay())) return false;
  if (minimumQuantity !== null && (!context.quantity || context.quantity < minimumQuantity)) return false;
  return true;
}

export function evaluateRelationshipBenefitSnapshot(args: {
  benefit: BenefitLike;
  link: LinkLike;
  assignment: AssignmentLike | null;
  usages: UsageLike[];
  context?: RelationshipBenefitExecutionContext | null;
  now?: Date;
  requireBusinessContext?: boolean;
}): RelationshipBenefitEvaluation {
  const now = args.now || new Date();
  const { benefit, link, assignment } = args;
  const context = args.context || null;

  if (
    link.status !== "ACTIVE" ||
    !link.userId ||
    !link.activatedAt ||
    !link.userDecisionAt ||
    !link.organizationDecisionAt
  ) {
    return { allowed: false, code: "RELATIONSHIP_INACTIVE", reason: "La relation n’est plus active et approuvée.", totalRemaining: null, periodRemaining: null, requiresBusinessContext: false };
  }
  if (benefit.status !== "ACTIVE" || benefit.archivedAt || !activeWindow(benefit.startsAt, benefit.endsAt, now)) {
    return { allowed: false, code: "BENEFIT_INACTIVE", reason: "L’avantage n’est pas actif à cette date.", totalRemaining: null, periodRemaining: null, requiresBusinessContext: false };
  }

  const audienceMatch =
    benefit.audiences.length === 0 ||
    benefit.audiences.some(
      (audience) =>
        audience.relationType === link.requestedRelationType &&
        (!audience.roleCode || audience.roleCode === link.requestedRoleCode),
    );
  const assignmentMatch =
    Boolean(assignment) &&
    assignment?.status === "ACTIVE" &&
    activeWindow(assignment.startsAt, assignment.endsAt, now);
  const targeted =
    benefit.assignmentMode === "MANUAL"
      ? assignmentMatch
      : benefit.assignmentMode === "HYBRID"
        ? audienceMatch || assignmentMatch
        : audienceMatch;

  if (!targeted) {
    return { allowed: false, code: assignment ? "AUDIENCE_MISMATCH" : "ASSIGNMENT_MISMATCH", reason: "Cette relation n’est pas ciblée par l’avantage.", totalRemaining: null, periodRemaining: null, requiresBusinessContext: false };
  }

  const requiresBusinessContext = Boolean(
    benefit.minimumAmount ||
      benefit.targetModuleCode ||
      Object.keys(objectValue(benefit.conditionsJson)).length,
  );

  if (benefit.targetModuleCode && (context || args.requireBusinessContext)) {
    if (!context?.moduleCode || normalizeEnterpriseModuleCode(context.moduleCode) !== normalizeEnterpriseModuleCode(benefit.targetModuleCode)) {
      return { allowed: false, code: "TARGET_MISMATCH", reason: "Cet avantage doit être appliqué dans le module métier prévu.", totalRemaining: null, periodRemaining: null, requiresBusinessContext };
    }
  }
  if (benefit.currencyCode && context) {
    if (!context.currencyCode || context.currencyCode.toUpperCase() !== benefit.currencyCode.toUpperCase()) {
      return { allowed: false, code: "CURRENCY_MISMATCH", reason: "La devise de l’opération ne correspond pas à celle de l’avantage.", totalRemaining: null, periodRemaining: null, requiresBusinessContext };
    }
  }
  if (benefit.minimumAmount && (context || args.requireBusinessContext)) {
    const amount = context?.transactionAmount;
    if (amount === null || amount === undefined || amount < Number(benefit.minimumAmount)) {
      return { allowed: false, code: "MINIMUM_AMOUNT_NOT_MET", reason: "Le montant minimum requis pour cet avantage n’est pas atteint.", totalRemaining: null, periodRemaining: null, requiresBusinessContext };
    }
  }
  if (!benefitConditionsSupported(benefit.conditionsJson)) {
    return { allowed: false, code: "CONDITIONS_UNSUPPORTED", reason: "Les conditions enregistrées pour cet avantage ne sont pas reconnues par le moteur.", totalRemaining: null, periodRemaining: null, requiresBusinessContext };
  }
  if (Object.keys(objectValue(benefit.conditionsJson)).length && (context || args.requireBusinessContext)) {
    if (!context || !matchesRelationshipBenefitConditions(benefit.conditionsJson, context, now)) {
      return { allowed: false, code: "CONDITIONS_NOT_MET", reason: "Les conditions métier de l’avantage ne sont pas réunies.", totalRemaining: null, periodRemaining: null, requiresBusinessContext };
    }
  }

  const activeUsages = args.usages.filter((usage) => !["REJECTED", "CANCELLED"].includes(usage.status));
  const totalRemaining =
    benefit.usageLimitTotal === null
      ? null
      : Math.max(0, benefit.usageLimitTotal - activeUsages.length);
  let periodRemaining: number | null = null;
  if (benefit.usageLimitPerPeriod !== null && benefit.usagePeriodDays) {
    const periodStart = new Date(now.getTime() - benefit.usagePeriodDays * 24 * 60 * 60 * 1000);
    const periodUsed = activeUsages.filter((usage) => usage.requestedAt >= periodStart).length;
    periodRemaining = Math.max(0, benefit.usageLimitPerPeriod - periodUsed);
  }
  if (totalRemaining !== null && totalRemaining <= 0) {
    return { allowed: false, code: "TOTAL_LIMIT_REACHED", reason: "La limite totale d’utilisation est atteinte.", totalRemaining, periodRemaining, requiresBusinessContext };
  }
  if (periodRemaining !== null && periodRemaining <= 0) {
    return { allowed: false, code: "PERIOD_LIMIT_REACHED", reason: "La limite d’utilisation pour la période est atteinte.", totalRemaining, periodRemaining, requiresBusinessContext };
  }
  return { allowed: true, code: "OK", reason: "Avantage applicable.", totalRemaining, periodRemaining, requiresBusinessContext };
}

export async function assertRelationshipBenefitTargetModule(
  organizationId: string,
  targetModuleCode: string | null | undefined,
) {
  if (!targetModuleCode) return;
  const decision = await canUseModule(organizationId, targetModuleCode);
  if (!decision.allowed) {
    const error = new Error(decision.message) as Error & { code?: string; status?: number };
    error.code = "RELATIONSHIP_BENEFIT_TARGET_MODULE_DENIED";
    error.status = decision.code === "PLAN_REQUIRED" || decision.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    throw error;
  }
}

export async function findActiveRelationshipsForBusinessParty(args: {
  organizationId: string;
  businessPartyId: string;
}) {
  const references = await prisma.enterprisePersonBusinessReference.findMany({
    where: {
      organizationId: args.organizationId,
      businessPartyId: args.businessPartyId,
      status: "ACTIVE",
      archivedAt: null,
    },
    select: { personIdentityId: true },
    take: 100,
  });
  const personIdentityIds = [...new Set(references.map((reference) => reference.personIdentityId))];
  if (!personIdentityIds.length) return [];
  return prisma.enterpriseIdentityLink.findMany({
    where: {
      organizationId: args.organizationId,
      personIdentityId: { in: personIdentityIds },
      status: "ACTIVE",
      userId: { not: null },
      activatedAt: { not: null },
      userDecisionAt: { not: null },
      organizationDecisionAt: { not: null },
    },
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
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
  });
}

export async function findActiveRelationshipForBusinessParty(args: {
  organizationId: string;
  businessPartyId: string;
}) {
  const links = await findActiveRelationshipsForBusinessParty(args);
  return links[0] || null;
}

export async function evaluateRelationshipBenefit(args: {
  organizationId: string;
  userId: string;
  identityLinkId: string;
  benefitId: string;
  context?: RelationshipBenefitExecutionContext | null;
  requireBusinessContext?: boolean;
  excludeUsageId?: string | null;
}) {
  const access = await resolveEnterpriseIdentityRelationshipAccess({
    userId: args.userId,
    organizationId: args.organizationId,
    identityLinkId: args.identityLinkId,
  });
  if (!access.allowed || !access.capabilities.includes("ENTERPRISE_BENEFITS")) {
    return {
      access,
      evaluation: {
        allowed: false,
        code: "BENEFITS_CAPABILITY_DENIED" as const,
        reason: access.message,
        totalRemaining: null,
        periodRemaining: null,
        requiresBusinessContext: false,
      },
      benefit: null,
      link: null,
    };
  }

  const now = contextDate(args.context, new Date());
  const [benefit, link, assignment, usages] = await Promise.all([
    prisma.enterpriseRelationshipBenefit.findFirst({
      where: { id: args.benefitId, organizationId: args.organizationId },
      include: { audiences: true },
    }),
    prisma.enterpriseIdentityLink.findFirst({
      where: { id: args.identityLinkId, organizationId: args.organizationId, userId: args.userId },
      select: {
        id: true,
        userId: true,
        requestedRelationType: true,
        requestedRoleCode: true,
        status: true,
        activatedAt: true,
        userDecisionAt: true,
        organizationDecisionAt: true,
      },
    }),
    prisma.enterpriseRelationshipBenefitAssignment.findFirst({
      where: { organizationId: args.organizationId, benefitId: args.benefitId, identityLinkId: args.identityLinkId },
      select: { benefitId: true, status: true, startsAt: true, endsAt: true },
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId: args.organizationId,
        benefitId: args.benefitId,
        identityLinkId: args.identityLinkId,
        userId: args.userId,
        ...(args.excludeUsageId ? { id: { not: args.excludeUsageId } } : {}),
      },
      select: { benefitId: true, status: true, requestedAt: true },
      take: 100000,
    }),
  ]);

  if (!benefit || !link) {
    return {
      access,
      evaluation: {
        allowed: false,
        code: "BENEFIT_INACTIVE" as const,
        reason: "L’avantage ou la relation est introuvable.",
        totalRemaining: null,
        periodRemaining: null,
        requiresBusinessContext: false,
      },
      benefit,
      link,
    };
  }

  if (benefit.targetModuleCode) {
    const moduleDecision = await canUseModule(args.organizationId, benefit.targetModuleCode);
    if (!moduleDecision.allowed) {
      return {
        access,
        evaluation: {
          allowed: false,
          code: "TARGET_MODULE_DENIED" as const,
          reason: moduleDecision.message,
          totalRemaining: null,
          periodRemaining: null,
          requiresBusinessContext: true,
        },
        benefit,
        link,
      };
    }
  }

  return {
    access,
    evaluation: evaluateRelationshipBenefitSnapshot({
      benefit,
      link,
      assignment,
      usages,
      context: args.context,
      now,
      requireBusinessContext: args.requireBusinessContext,
    }),
    benefit,
    link,
  };
}

export function automaticRetailEffectSupported(benefit: {
  targetModuleCode: string | null;
  benefitType: string;
  valueType: string;
  valueDecimal: Prisma.Decimal | null;
  actionCode?: string | null;
}) {
  if (normalizeEnterpriseModuleCode(benefit.targetModuleCode || "") !== "RETAIL_POS") return false;
  if (benefit.actionCode && benefit.actionCode !== "NONE") return false;
  if (!benefit.valueDecimal || benefit.valueDecimal.lte(0)) return false;
  if (benefit.benefitType === "DISCOUNT") return ["PERCENT", "AMOUNT"].includes(benefit.valueType);
  if (benefit.benefitType === "FIXED_PRICE") return benefit.valueType === "AMOUNT";
  return false;
}

export function calculateRetailRelationshipDiscount(args: {
  benefitType: string;
  valueType: string;
  valueDecimal: Prisma.Decimal;
  eligibleAmount: Prisma.Decimal;
}) {
  const zero = new Prisma.Decimal(0);
  const base = Prisma.Decimal.max(zero, args.eligibleAmount);
  if (args.benefitType === "DISCOUNT" && args.valueType === "PERCENT") {
    return Prisma.Decimal.min(base, base.times(args.valueDecimal).div(100)).toDecimalPlaces(6);
  }
  if (args.benefitType === "DISCOUNT" && args.valueType === "AMOUNT") {
    return Prisma.Decimal.min(base, args.valueDecimal).toDecimalPlaces(6);
  }
  if (args.benefitType === "FIXED_PRICE" && args.valueType === "AMOUNT") {
    return Prisma.Decimal.max(zero, base.minus(args.valueDecimal)).toDecimalPlaces(6);
  }
  return zero;
}
