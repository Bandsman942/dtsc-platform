import { Prisma } from "@prisma/client";
import { canUseModule } from "@/lib/billing/entitlements";
import { listEnterpriseCurrencies } from "@/lib/enterprise/accounting/currency-service";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import { ENTERPRISE_IDENTITY_RELATION_TYPES } from "@/lib/enterprise/identity-links/contracts";
import {
  automaticRetailEffectSupported,
  benefitConditionsSupported,
  evaluateRelationshipBenefit,
  evaluateRelationshipBenefitSnapshot,
  type RelationshipBenefitExecutionContext,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export class EnterpriseRelationshipBenefitError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "EnterpriseRelationshipBenefitError";
    this.code = code;
    this.status = status;
  }
}

function asNumber(value: Prisma.Decimal | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function isDateActive(startsAt: Date | null, endsAt: Date | null, now: Date) {
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function storedExecutionContext(value: Prisma.JsonValue | null | undefined) {
  const record = jsonObject(value);
  if (!record.moduleCode || typeof record.moduleCode !== "string") return null;
  return {
    moduleCode: record.moduleCode,
    transactionAmount:
      typeof record.transactionAmount === "number" ? record.transactionAmount : null,
    currencyCode: typeof record.currencyCode === "string" ? record.currencyCode : null,
    businessPartyId:
      typeof record.businessPartyId === "string" ? record.businessPartyId : null,
    siteId: typeof record.siteId === "string" ? record.siteId : null,
    channelCode: typeof record.channelCode === "string" ? record.channelCode : null,
    catalogItemIds: stringList(record.catalogItemIds),
    categoryIds: stringList(record.categoryIds),
    quantity: typeof record.quantity === "number" ? record.quantity : null,
    occurredAt: typeof record.occurredAt === "string" ? record.occurredAt : null,
  } satisfies RelationshipBenefitExecutionContext;
}

async function assertReferenceSet(
  organizationId: string,
  ids: string[],
  kind: "site" | "catalogItem" | "category",
) {
  if (!ids.length) return;
  const uniqueIds = [...new Set(ids)];
  const count =
    kind === "site"
      ? await prisma.enterpriseSite.count({
          where: {
            organizationId,
            id: { in: uniqueIds },
            status: "ACTIVE",
            archivedAt: null,
          },
        })
      : kind === "catalogItem"
        ? await prisma.enterpriseCatalogItem.count({
            where: {
              organizationId,
              id: { in: uniqueIds },
              status: "ACTIVE",
              archivedAt: null,
            },
          })
        : await prisma.enterpriseCatalogCategory.count({
            where: {
              organizationId,
              id: { in: uniqueIds },
              status: "ACTIVE",
              archivedAt: null,
            },
          });
  if (count !== uniqueIds.length) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_CONDITION_REFERENCE_INVALID",
      "Une condition de l’avantage référence une donnée inactive ou appartenant à une autre entreprise.",
      400,
    );
  }
}

async function validateRelationshipBenefitConfiguration(
  organizationId: string,
  config: {
    benefitType: string;
    valueType: string;
    valueDecimal: number | Prisma.Decimal | null | undefined;
    currencyCode: string | null | undefined;
    minimumAmount: number | Prisma.Decimal | null | undefined;
    targetModuleCode: string | null | undefined;
    usageLimitPerPeriod: number | null | undefined;
    usagePeriodDays: number | null | undefined;
    stackable: boolean;
    actionCode: string;
    conditions: Record<string, unknown> | null | undefined;
  },
) {
  if (
    config.valueType === "PERCENT" &&
    config.valueDecimal !== null &&
    config.valueDecimal !== undefined &&
    Number(config.valueDecimal) > 100
  ) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_PERCENT_INVALID",
      "Un pourcentage d’avantage doit être compris entre 0 et 100.",
    );
  }
  if (Boolean(config.usageLimitPerPeriod) !== Boolean(config.usagePeriodDays)) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_PERIOD_LIMIT_INVALID",
      "Une limite périodique exige une durée de période, et inversement.",
    );
  }
  if (config.currencyCode) {
    const currencies = await listEnterpriseCurrencies(organizationId);
    const code = config.currencyCode.toUpperCase();
    if (!currencies.some((currency) => currency.code === code && currency.isActive)) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_CURRENCY_INVALID",
        "La devise sélectionnée n’est pas active pour cette entreprise.",
      );
    }
  }
    if (config.valueType === "AMOUNT" && !config.currencyCode) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_AMOUNT_CURRENCY_REQUIRED",
      "Un avantage exprimé en montant doit préciser sa devise.",
    );
  }
    if (config.minimumAmount && !config.currencyCode) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_MINIMUM_CURRENCY_REQUIRED",
      "Choisissez la devise du montant minimum.",
    );
  }
  if (
    config.benefitType === "FIXED_PRICE" &&
    config.valueType === "AMOUNT" &&
    !config.currencyCode
  ) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_VALUE_CURRENCY_REQUIRED",
      "Un prix fixe doit préciser sa devise.",
    );
  }
  if (config.benefitType === "FIXED_PRICE" && config.stackable) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_FIXED_PRICE_STACK_FORBIDDEN",
      "Un prix fixe ne peut pas être cumulé avec d’autres remises.",
    );
  }

  if (config.targetModuleCode) {
    const canonicalTarget = normalizeEnterpriseModuleCode(config.targetModuleCode);
    const decision = await canUseModule(organizationId, canonicalTarget);
    if (!decision.allowed) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_TARGET_MODULE_DENIED",
        decision.message,
        decision.code === "PLAN_REQUIRED" || decision.code === "SUBSCRIPTION_REQUIRED"
          ? 402
          : 403,
      );
    }
  }

  const conditions = config.conditions || {};
  if (!benefitConditionsSupported(conditions as Prisma.InputJsonValue)) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_CONDITIONS_UNSUPPORTED",
      "Une condition de l’avantage n’est pas prise en charge par le moteur serveur.",
    );
  }
  await Promise.all([
    assertReferenceSet(organizationId, stringList(conditions.siteIds), "site"),
    assertReferenceSet(
      organizationId,
      stringList(conditions.catalogItemIds),
      "catalogItem",
    ),
    assertReferenceSet(
      organizationId,
      stringList(conditions.categoryIds),
      "category",
    ),
  ]);

  const retailProbe = {
    targetModuleCode: config.targetModuleCode
      ? normalizeEnterpriseModuleCode(config.targetModuleCode)
      : null,
    benefitType: config.benefitType,
    valueType: config.valueType,
    valueDecimal:
      config.valueDecimal === null || config.valueDecimal === undefined
        ? null
        : new Prisma.Decimal(config.valueDecimal),
    actionCode: config.actionCode,
  };
  const automaticRetailShape = automaticRetailEffectSupported({
    ...retailProbe,
    actionCode: null,
  });
  if (automaticRetailShape && config.actionCode !== "NONE") {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_AUTOMATIC_ACTION_INVALID",
      "Un avantage monétaire appliqué automatiquement au point de vente ne doit pas créer une seconde demande manuelle.",
    );
  }
  if (config.targetModuleCode && !automaticRetailShape) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED",
      "Ce module ne dispose pas encore d’un adaptateur certifié pour exécuter ce type d’avantage. Retirez la cible métier ou utilisez un avantage Retail POS monétaire pris en charge.",
      409,
    );
  }

  const hasContextualRules =
    Boolean(config.minimumAmount) ||
    Object.keys(conditions).length > 0;
  if (hasContextualRules && !automaticRetailShape) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_CONTEXTUAL_RULES_UNSUPPORTED",
      "Les montants minimums et conditions métier exigent un adaptateur serveur certifié. Utilisez actuellement Retail POS avec une remise ou un prix fixe automatique.",
      409,
    );
  }
}

export async function listRelationshipBenefitsForAdmin(organizationId: string) {
  const [benefits, usages] = await Promise.all([
    prisma.enterpriseRelationshipBenefit.findMany({
      where: { organizationId, archivedAt: null },
      include: {
        audiences: true,
        assignments: { where: { status: "ACTIVE" }, select: { id: true, identityLinkId: true, startsAt: true, endsAt: true, status: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: { organizationId },
      orderBy: { requestedAt: "desc" },
      take: 200,
    }),
  ]);

  const linkIds = [...new Set(usages.map((usage) => usage.identityLinkId))];
  const links = linkIds.length
    ? await prisma.enterpriseIdentityLink.findMany({
        where: { organizationId, id: { in: linkIds } },
        select: { id: true, requestedRelationType: true, personIdentityId: true, userId: true },
      })
    : [];
  const personIds = [...new Set(links.map((link) => link.personIdentityId))];
  const people = personIds.length
    ? await prisma.enterprisePersonIdentity.findMany({
        where: { organizationId, id: { in: personIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const personById = new Map(people.map((person) => [person.id, person.displayName]));
  const linkById = new Map(links.map((link) => [link.id, link]));

  return {
    benefits: benefits.map((benefit) => ({
      id: benefit.id,
      code: benefit.code,
      nameFr: benefit.nameFr,
      nameEn: benefit.nameEn,
      descriptionFr: benefit.descriptionFr,
      descriptionEn: benefit.descriptionEn,
      benefitType: benefit.benefitType,
      assignmentMode: benefit.assignmentMode,
      valueType: benefit.valueType,
      valueDecimal: asNumber(benefit.valueDecimal),
      currencyCode: benefit.currencyCode,
      minimumAmount: asNumber(benefit.minimumAmount),
      actionCode: benefit.actionCode,
      actionLabelFr: benefit.actionLabelFr,
      actionLabelEn: benefit.actionLabelEn,
      targetModuleCode: benefit.targetModuleCode,
      usageLimitTotal: benefit.usageLimitTotal,
      usageLimitPerPeriod: benefit.usageLimitPerPeriod,
      usagePeriodDays: benefit.usagePeriodDays,
      stackable: benefit.stackable,
      startsAt: iso(benefit.startsAt),
      endsAt: iso(benefit.endsAt),
      status: benefit.status,
      revision: benefit.revision,
      relationTypes: [...new Set(benefit.audiences.map((audience) => audience.relationType))],
      audienceRoleCodes: [...new Set(benefit.audiences.map((audience) => audience.roleCode).filter((value): value is string => Boolean(value)))],
      assignmentCount: benefit.assignments.length,
      createdAt: benefit.createdAt.toISOString(),
    })),
    usages: usages.map((usage) => {
      const link = linkById.get(usage.identityLinkId);
      return {
        id: usage.id,
        benefitId: usage.benefitId,
        identityLinkId: usage.identityLinkId,
        userId: usage.userId,
        actionCode: usage.actionCode,
        status: usage.status,
        note: usage.note,
        organizationNote: usage.organizationNote,
        requestedAt: usage.requestedAt.toISOString(),
        decidedAt: iso(usage.decidedAt),
        consumedAt: iso(usage.consumedAt),
        cancelledAt: iso(usage.cancelledAt),
        revision: usage.revision,
        executionMode: usage.executionMode,
        effectModuleCode: usage.effectModuleCode,
        effectEntityType: usage.effectEntityType,
        effectEntityId: usage.effectEntityId,
        effectAmount: asNumber(usage.effectAmount),
        effectCurrencyCode: usage.effectCurrencyCode,
        executedAt: iso(usage.executedAt),
        relationType: link?.requestedRelationType || null,
        personName: link ? personById.get(link.personIdentityId) || null : null,
      };
    }),
  };
}

export async function listAssignableRelationshipLinks(organizationId: string) {
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId, status: "ACTIVE", userId: { not: null } },
    select: { id: true, requestedRelationType: true, requestedRoleCode: true, personIdentityId: true, activatedAt: true },
    orderBy: { activatedAt: "desc" },
    take: 300,
  });
  const personIds = [...new Set(links.map((link) => link.personIdentityId))];
  const people = personIds.length
    ? await prisma.enterprisePersonIdentity.findMany({
        where: { organizationId, id: { in: personIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const personById = new Map(people.map((person) => [person.id, person.displayName]));
  return links.map((link) => ({
    id: link.id,
    relationType: link.requestedRelationType,
    roleCode: link.requestedRoleCode,
    personName: personById.get(link.personIdentityId) || "Relation active",
    activatedAt: iso(link.activatedAt),
  }));
}

type BenefitInput = {
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  benefitType: string;
  assignmentMode: string;
  relationTypes: string[];
  audienceRoleCode?: string | null;
  identityLinkIds: string[];
  valueType: string;
  valueDecimal?: number | null;
  currencyCode?: string | null;
  minimumAmount?: number | null;
  actionCode: string;
  actionLabelFr?: string | null;
  actionLabelEn?: string | null;
  targetModuleCode?: string | null;
  usageLimitTotal?: number | null;
  usageLimitPerPeriod?: number | null;
  usagePeriodDays?: number | null;
  stackable: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  status: string;
  conditions?: Record<string, unknown> | null;
};

export async function createRelationshipBenefit({
  organizationId,
  actorUserId,
  input,
}: {
  organizationId: string;
  actorUserId: string;
  input: BenefitInput;
}) {
  const relationTypes = [...new Set(input.relationTypes)];
  const audienceRoleCode = input.audienceRoleCode?.trim() || null;
  if (relationTypes.some((type) => !(ENTERPRISE_IDENTITY_RELATION_TYPES as readonly string[]).includes(type))) {
    throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_AUDIENCE_INVALID", "Un type de relation sélectionné n’est pas reconnu.");
  }
  if (audienceRoleCode && !relationTypes.length) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_AUDIENCE_ROLE_INVALID",
      "Sélectionnez au moins un type de relation avant de cibler un rôle ou segment.",
    );
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_DATES_INVALID", "La date de fin doit être postérieure à la date de début.");
  }

  const targetModuleCode = input.targetModuleCode
    ? normalizeEnterpriseModuleCode(input.targetModuleCode)
    : null;
  await validateRelationshipBenefitConfiguration(organizationId, {
    benefitType: input.benefitType,
    valueType: input.valueType,
    valueDecimal: input.valueDecimal,
    currencyCode: input.currencyCode,
    minimumAmount: input.minimumAmount,
    targetModuleCode,
    usageLimitPerPeriod: input.usageLimitPerPeriod,
    usagePeriodDays: input.usagePeriodDays,
    stackable: input.stackable,
    actionCode: input.actionCode,
    conditions: input.conditions,
  });

  const uniqueLinkIds = [...new Set(input.identityLinkIds)];
  if (uniqueLinkIds.length) {
    const count = await prisma.enterpriseIdentityLink.count({
      where: { organizationId, id: { in: uniqueLinkIds }, status: "ACTIVE", userId: { not: null } },
    });
    if (count !== uniqueLinkIds.length) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_ASSIGNMENT_INVALID",
        "Une relation sélectionnée n’appartient pas à cette entreprise ou n’est plus active.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const benefit = await tx.enterpriseRelationshipBenefit.create({
      data: {
        organizationId,
        code: input.code,
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        descriptionFr: input.descriptionFr,
        descriptionEn: input.descriptionEn,
        benefitType: input.benefitType,
        assignmentMode: input.assignmentMode,
        valueType: input.valueType,
        valueDecimal: input.valueDecimal ?? null,
        currencyCode: input.currencyCode || null,
        minimumAmount: input.minimumAmount ?? null,
        actionCode: input.actionCode,
        actionLabelFr: input.actionLabelFr || null,
        actionLabelEn: input.actionLabelEn || null,
        targetModuleCode,
        usageLimitTotal: input.usageLimitTotal ?? null,
        usageLimitPerPeriod: input.usageLimitPerPeriod ?? null,
        usagePeriodDays: input.usagePeriodDays ?? null,
        stackable: input.stackable,
        startsAt,
        endsAt,
        status: input.status,
        conditionsJson: input.conditions ? (input.conditions as Prisma.InputJsonValue) : Prisma.JsonNull,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });
    if (relationTypes.length) {
      await tx.enterpriseRelationshipBenefitAudience.createMany({
        data: relationTypes.map((relationType) => ({
          organizationId,
          benefitId: benefit.id,
          relationType,
          roleCode: audienceRoleCode,
        })),
      });
    }
    if (uniqueLinkIds.length) {
      await tx.enterpriseRelationshipBenefitAssignment.createMany({
        data: uniqueLinkIds.map((identityLinkId) => ({
          organizationId,
          benefitId: benefit.id,
          identityLinkId,
          createdByUserId: actorUserId,
        })),
      });
    }
    return benefit;
  });
}

export async function updateRelationshipBenefit({
  organizationId,
  benefitId,
  actorUserId,
  input,
}: {
  organizationId: string;
  benefitId: string;
  actorUserId: string;
  input: Record<string, unknown> & { revision: number };
}) {
  const current = await prisma.enterpriseRelationshipBenefit.findFirst({
    where: { id: benefitId, organizationId, archivedAt: null },
    include: { audiences: true },
  });
  if (!current) throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_NOT_FOUND", "Cet avantage est introuvable.", 404);
  if (current.revision !== input.revision) {
    throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_CONFLICT", "Cet avantage a changé. Actualisez avant de réessayer.", 409);
  }

  const relationTypes = Array.isArray(input.relationTypes)
    ? [...new Set(input.relationTypes.filter((item): item is string => typeof item === "string"))]
    : null;
  const identityLinkIds = Array.isArray(input.identityLinkIds)
    ? [...new Set(input.identityLinkIds.filter((item): item is string => typeof item === "string"))]
    : null;
  const currentRelationTypes = [...new Set(current.audiences.map((audience) => audience.relationType))];
  const currentRoleCodes = [...new Set(
    current.audiences
      .map((audience) => audience.roleCode)
      .filter((value): value is string => Boolean(value)),
  )];
  const mergedAudienceRoleCode =
    "audienceRoleCode" in input
      ? input.audienceRoleCode
        ? String(input.audienceRoleCode).trim() || null
        : null
      : currentRoleCodes.length === 1
        ? currentRoleCodes[0]
        : null;
  const mergedAudienceRelationTypes = relationTypes ?? currentRelationTypes;

  if (
    relationTypes?.some(
      (type) => !(ENTERPRISE_IDENTITY_RELATION_TYPES as readonly string[]).includes(type),
    )
  ) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_AUDIENCE_INVALID",
      "Un type de relation sélectionné n’est pas reconnu.",
    );
  }

  if (mergedAudienceRoleCode && !mergedAudienceRelationTypes.length) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_AUDIENCE_ROLE_INVALID",
      "Sélectionnez au moins un type de relation avant de cibler un rôle ou segment.",
    );
  }

  const mergedStartsAt =
    "startsAt" in input
      ? input.startsAt
        ? new Date(String(input.startsAt))
        : null
      : current.startsAt;
  const mergedEndsAt =
    "endsAt" in input
      ? input.endsAt
        ? new Date(String(input.endsAt))
        : null
      : current.endsAt;
  if (mergedStartsAt && mergedEndsAt && mergedEndsAt <= mergedStartsAt) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_DATES_INVALID",
      "La date de fin doit être postérieure à la date de début.",
    );
  }

    const mergedConditions =
    "conditions" in input
      ? input.conditions && typeof input.conditions === "object" && !Array.isArray(input.conditions)
        ? (input.conditions as Record<string, unknown>)
        : null
      : jsonObject(current.conditionsJson);
  const mergedTargetModuleCode =
    "targetModuleCode" in input
      ? input.targetModuleCode
        ? normalizeEnterpriseModuleCode(String(input.targetModuleCode))
        : null
      : current.targetModuleCode;
  // A status-only suspension/archive is a restrictive transition, not a
  // configuration change. It must remain possible even if an entitlement,
  // reference, currency or certified adapter is no longer available. Any
  // configuration edit or reactivation still goes through full validation.
  const statusOnlyDeactivation =
    (input.status === "SUSPENDED" || input.status === "ARCHIVED") &&
    Object.keys(input).every((key) => key === "revision" || key === "status");
  if (!statusOnlyDeactivation) {
    await validateRelationshipBenefitConfiguration(organizationId, {
    benefitType:
      "benefitType" in input ? String(input.benefitType) : current.benefitType,
    valueType: "valueType" in input ? String(input.valueType) : current.valueType,
    valueDecimal:
      "valueDecimal" in input
        ? (input.valueDecimal as number | null | undefined)
        : current.valueDecimal,
    currencyCode:
      "currencyCode" in input
        ? (input.currencyCode as string | null | undefined)
        : current.currencyCode,
    minimumAmount:
      "minimumAmount" in input
        ? (input.minimumAmount as number | null | undefined)
        : current.minimumAmount,
    targetModuleCode: mergedTargetModuleCode,
    usageLimitPerPeriod:
      "usageLimitPerPeriod" in input
        ? (input.usageLimitPerPeriod as number | null | undefined)
        : current.usageLimitPerPeriod,
    usagePeriodDays:
      "usagePeriodDays" in input
        ? (input.usagePeriodDays as number | null | undefined)
        : current.usagePeriodDays,
    stackable:
      "stackable" in input ? Boolean(input.stackable) : current.stackable,
    actionCode:
      "actionCode" in input ? String(input.actionCode) : current.actionCode,
    conditions: mergedConditions,
    });
  }

  if (identityLinkIds?.length) {
    const count = await prisma.enterpriseIdentityLink.count({
      where: { organizationId, id: { in: identityLinkIds }, status: "ACTIVE", userId: { not: null } },
    });
    if (count !== identityLinkIds.length) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_ASSIGNMENT_INVALID",
        "Une relation sélectionnée n’est plus active dans cette entreprise.",
      );
    }
  }

  const data: Prisma.EnterpriseRelationshipBenefitUpdateManyMutationInput = {
    updatedByUserId: actorUserId,
    revision: { increment: 1 },
  };
  const writable = data as Record<string, unknown>;
  for (const key of ["nameFr", "nameEn", "descriptionFr", "descriptionEn", "benefitType", "assignmentMode", "valueType", "currencyCode", "actionCode", "actionLabelFr", "actionLabelEn", "status"] as const) {
    if (key in input) writable[key] = input[key] ?? null;
  }
  for (const key of ["valueDecimal", "minimumAmount", "usageLimitTotal", "usageLimitPerPeriod", "usagePeriodDays", "stackable"] as const) {
    if (key in input) writable[key] = input[key] ?? null;
  }
  if ("targetModuleCode" in input) data.targetModuleCode = mergedTargetModuleCode;
  if ("startsAt" in input) data.startsAt = mergedStartsAt;
  if ("endsAt" in input) data.endsAt = mergedEndsAt;
  if ("conditions" in input) data.conditionsJson = input.conditions ? (input.conditions as Prisma.InputJsonValue) : Prisma.JsonNull;
  if (input.status === "ARCHIVED") data.archivedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.enterpriseRelationshipBenefit.updateMany({
      where: { id: benefitId, organizationId, revision: input.revision },
      data,
    });
    if (updated.count !== 1) {
      throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_CONFLICT", "Cet avantage a changé. Actualisez avant de réessayer.", 409);
    }
    if (relationTypes || "audienceRoleCode" in input) {
      await tx.enterpriseRelationshipBenefitAudience.deleteMany({ where: { organizationId, benefitId } });
      if (mergedAudienceRelationTypes.length) {
        await tx.enterpriseRelationshipBenefitAudience.createMany({
          data: mergedAudienceRelationTypes.map((relationType) => ({
            organizationId,
            benefitId,
            relationType,
            roleCode: mergedAudienceRoleCode,
          })),
        });
      }
    }
    if (identityLinkIds) {
      await tx.enterpriseRelationshipBenefitAssignment.deleteMany({ where: { organizationId, benefitId } });
      if (identityLinkIds.length) {
        await tx.enterpriseRelationshipBenefitAssignment.createMany({
          data: identityLinkIds.map((identityLinkId) => ({ organizationId, benefitId, identityLinkId, createdByUserId: actorUserId })),
        });
      }
    }
  });

  return prisma.enterpriseRelationshipBenefit.findFirst({ where: { id: benefitId, organizationId } });
}

async function retailSnapshot(organizationId: string, personIdentityId: string) {
  const retailAccess = await canUseModule(organizationId, "RETAIL_POS");
  if (!retailAccess.allowed) return null;

  const reference = await prisma.enterprisePersonBusinessReference.findFirst({
    where: { organizationId, personIdentityId, status: "ACTIVE", archivedAt: null, businessPartyId: { not: null } },
    select: { businessPartyId: true },
  });
  if (!reference?.businessPartyId) return null;

  const [loyaltyAccounts, storedValueAccounts] = await Promise.all([
    prisma.enterpriseRetailLoyaltyAccount.findMany({
      where: { organizationId, customerBusinessPartyId: reference.businessPartyId, status: "ACTIVE" },
      include: { program: { select: { nameFr: true, nameEn: true, currencyCode: true, status: true, startsAt: true, endsAt: true } } },
      take: 20,
    }),
    prisma.enterpriseRetailStoredValueAccount.findMany({
      where: { organizationId, customerBusinessPartyId: reference.businessPartyId, status: "ACTIVE", archivedAt: null },
      select: { id: true, accountType: true, displayCode: true, currencyCode: true, balance: true, expiresAt: true },
      take: 20,
    }),
  ]);

  const now = new Date();
  return {
    loyalty: loyaltyAccounts
      .filter((account) => account.program.status === "ACTIVE" && isDateActive(account.program.startsAt, account.program.endsAt, now))
      .map((account) => ({
        id: account.id,
        programNameFr: account.program.nameFr,
        programNameEn: account.program.nameEn,
        currencyCode: account.program.currencyCode,
        pointsBalance: Number(account.pointsBalance),
        lifetimeEarned: Number(account.lifetimeEarned),
        lifetimeRedeemed: Number(account.lifetimeRedeemed),
        tierCode: account.tierCode,
      })),
    storedValue: storedValueAccounts.map((account) => ({
      id: account.id,
      accountType: account.accountType,
      displayCode: account.displayCode,
      currencyCode: account.currencyCode,
      balance: Number(account.balance),
      expiresAt: iso(account.expiresAt),
    })),
  };
}

export async function resolveEnterpriseRelationshipBenefits({
  userId,
  organizationId,
  identityLinkId,
}: {
  userId: string;
  organizationId: string;
  identityLinkId?: string | null;
}) {
  const access = await resolveEnterpriseIdentityRelationshipAccess({ userId, organizationId, identityLinkId });
  if (!access.allowed || !access.identityLinkId || !access.capabilities.includes("ENTERPRISE_BENEFITS")) {
    return { access, items: [], requests: [], retail: null };
  }

  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: { id: access.identityLinkId, organizationId, userId, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      personIdentityId: true,
      requestedRelationType: true,
      requestedRoleCode: true,
      status: true,
      activatedAt: true,
      userDecisionAt: true,
      organizationDecisionAt: true,
    },
  });
  if (!link) {
    return {
      access: { ...access, allowed: false, code: "RELATIONSHIP_NOT_FOUND" as const, capabilities: [], message: "La relation active est introuvable." },
      items: [],
      requests: [],
      retail: null,
    };
  }

  const now = new Date();
  const [benefits, assignments, usages, retail] = await Promise.all([
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
      take: 100,
    }),
    prisma.enterpriseRelationshipBenefitAssignment.findMany({
      where: { organizationId, identityLinkId: link.id, status: "ACTIVE" },
      select: { benefitId: true, status: true, startsAt: true, endsAt: true },
      take: 200,
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: { organizationId, identityLinkId: link.id, userId },
      select: {
        id: true,
        benefitId: true,
        actionCode: true,
        status: true,
        note: true,
        organizationNote: true,
        requestedAt: true,
        decidedAt: true,
        consumedAt: true,
        cancelledAt: true,
        revision: true,
        executionMode: true,
        effectModuleCode: true,
        effectEntityType: true,
        effectEntityId: true,
        effectAmount: true,
        effectCurrencyCode: true,
        executedAt: true,
        benefit: { select: { nameFr: true, nameEn: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 1000,
    }),
    retailSnapshot(organizationId, link.personIdentityId),
  ]);

  const targetCodes = [...new Set(
    benefits
      .map((benefit) => benefit.targetModuleCode)
      .filter((code): code is string => Boolean(code))
      .map((code) => normalizeEnterpriseModuleCode(code)),
  )];
  const targetAccessByCode = new Map(
    await Promise.all(
      targetCodes.map(async (code) => [code, await canUseModule(organizationId, code)] as const),
    ),
  );

  const assignmentByBenefitId = new Map(
    assignments.map((assignment) => [assignment.benefitId, assignment]),
  );
  const usagesByBenefitId = new Map<string, Array<{ benefitId: string; status: string; requestedAt: Date }>>();
  for (const usage of usages) {
    usagesByBenefitId.set(usage.benefitId, [
      ...(usagesByBenefitId.get(usage.benefitId) || []),
      { benefitId: usage.benefitId, status: usage.status, requestedAt: usage.requestedAt },
    ]);
  }

  const items = benefits.flatMap((benefit) => {
    if (benefit.targetModuleCode) {
      const targetCode = normalizeEnterpriseModuleCode(benefit.targetModuleCode);
      if (!targetAccessByCode.get(targetCode)?.allowed) return [];
    }
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit,
      link,
      assignment: assignmentByBenefitId.get(benefit.id) || null,
      usages: usagesByBenefitId.get(benefit.id) || [],
      now,
      requireBusinessContext: false,
    });
    if (!evaluation.allowed) return [];

    return [{
      id: benefit.id,
      code: benefit.code,
      nameFr: benefit.nameFr,
      nameEn: benefit.nameEn,
      descriptionFr: benefit.descriptionFr,
      descriptionEn: benefit.descriptionEn,
      benefitType: benefit.benefitType,
      valueType: benefit.valueType,
      valueDecimal: asNumber(benefit.valueDecimal),
      currencyCode: benefit.currencyCode,
      minimumAmount: asNumber(benefit.minimumAmount),
      actionCode: benefit.actionCode,
      actionLabelFr: benefit.actionLabelFr,
      actionLabelEn: benefit.actionLabelEn,
      targetModuleCode: benefit.targetModuleCode,
      stackable: benefit.stackable,
      startsAt: iso(benefit.startsAt),
      endsAt: iso(benefit.endsAt),
      usable: true,
      totalRemaining: evaluation.totalRemaining,
      periodRemaining: evaluation.periodRemaining,
      usagePeriodDays: benefit.usagePeriodDays,
      requiresBusinessContext: evaluation.requiresBusinessContext,
      executionMode: automaticRetailEffectSupported(benefit) ? "AUTO_RETAIL" : "REQUEST_ONLY",
    }];
  });

  const requests = usages.slice(0, 100).map((usage) => ({
    id: usage.id,
    benefitId: usage.benefitId,
    benefitNameFr: usage.benefit.nameFr,
    benefitNameEn: usage.benefit.nameEn,
    actionCode: usage.actionCode,
    status: usage.status,
    note: usage.note,
    organizationNote: usage.organizationNote,
    requestedAt: usage.requestedAt.toISOString(),
    decidedAt: iso(usage.decidedAt),
    consumedAt: iso(usage.consumedAt),
    cancelledAt: iso(usage.cancelledAt),
    revision: usage.revision,
    executionMode: usage.executionMode,
    effectModuleCode: usage.effectModuleCode,
    effectEntityType: usage.effectEntityType,
    effectEntityId: usage.effectEntityId,
    effectAmount: asNumber(usage.effectAmount),
    effectCurrencyCode: usage.effectCurrencyCode,
    executedAt: iso(usage.executedAt),
    canCancel: ["REQUESTED", "APPROVED"].includes(usage.status),
  }));

  return { access, items, requests, retail };
}

export async function createRelationshipBenefitUsage({
  organizationId,
  userId,
  identityLinkId,
  benefitId,
  idempotencyKey,
  note,
  context,
}: {
  organizationId: string;
  userId: string;
  identityLinkId: string;
  benefitId: string;
  idempotencyKey: string;
  note?: string | null;
  context?: RelationshipBenefitExecutionContext | null;
}) {
  const existing = await prisma.enterpriseRelationshipBenefitUsage.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
  });
  if (existing) {
    if (
      existing.userId !== userId ||
      existing.identityLinkId !== identityLinkId ||
      existing.benefitId !== benefitId
    ) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_IDEMPOTENCY_COLLISION",
        "Cette clé de reprise est déjà utilisée pour une autre demande.",
        409,
      );
    }
    return existing;
  }

  const resolved = await evaluateRelationshipBenefit({
    organizationId,
    userId,
    identityLinkId,
    benefitId,
    context,
    requireBusinessContext: Boolean(context),
  });
  if (!resolved.evaluation.allowed || !resolved.benefit) {
    throw new EnterpriseRelationshipBenefitError(
      resolved.evaluation.code === "RELATIONSHIP_INACTIVE"
        ? "RELATIONSHIP_BENEFIT_RELATION_INACTIVE"
        : "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
      resolved.evaluation.reason,
      resolved.evaluation.code === "TOTAL_LIMIT_REACHED" ||
        resolved.evaluation.code === "PERIOD_LIMIT_REACHED"
        ? 409
        : 403,
    );
  }
  if (resolved.benefit.actionCode === "NONE") {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_NO_ACTION",
      automaticRetailEffectSupported(resolved.benefit)
        ? "Cet avantage est appliqué automatiquement dans l’opération métier compatible."
        : "Cet avantage est informatif et ne nécessite aucune demande.",
    );
  }

  const lockKey = `${organizationId}:relationship-benefit:${identityLinkId}:${benefitId}`;
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
      );

      const retry = await tx.enterpriseRelationshipBenefitUsage.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      });
      if (retry) {
        if (
          retry.userId !== userId ||
          retry.identityLinkId !== identityLinkId ||
          retry.benefitId !== benefitId
        ) {
          throw new EnterpriseRelationshipBenefitError(
            "RELATIONSHIP_BENEFIT_IDEMPOTENCY_COLLISION",
            "Cette clé de reprise est déjà utilisée pour une autre demande.",
            409,
          );
        }
        return { usage: retry, created: false };
      }

      const [benefit, link, assignment, usages] = await Promise.all([
        tx.enterpriseRelationshipBenefit.findFirst({
          where: { id: benefitId, organizationId },
          include: { audiences: true },
        }),
        tx.enterpriseIdentityLink.findFirst({
          where: { id: identityLinkId, organizationId, userId },
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
        tx.enterpriseRelationshipBenefitAssignment.findFirst({
          where: { organizationId, benefitId, identityLinkId },
          select: { benefitId: true, status: true, startsAt: true, endsAt: true },
        }),
        tx.enterpriseRelationshipBenefitUsage.findMany({
          where: { organizationId, benefitId, identityLinkId, userId },
          select: { benefitId: true, status: true, requestedAt: true },
          take: 100000,
        }),
      ]);

      if (!benefit || !link) {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
          "Cet avantage ou cette relation n’est plus disponible.",
          403,
        );
      }
      const evaluation = evaluateRelationshipBenefitSnapshot({
        benefit,
        link,
        assignment,
        usages,
        context,
        now: context?.occurredAt ? new Date(context.occurredAt) : new Date(),
        requireBusinessContext: Boolean(context),
      });
      if (!evaluation.allowed) {
        throw new EnterpriseRelationshipBenefitError(
          evaluation.code === "TOTAL_LIMIT_REACHED" ||
            evaluation.code === "PERIOD_LIMIT_REACHED"
            ? "RELATIONSHIP_BENEFIT_LIMIT_REACHED"
            : "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
          evaluation.reason,
          evaluation.code === "TOTAL_LIMIT_REACHED" ||
            evaluation.code === "PERIOD_LIMIT_REACHED"
            ? 409
            : 403,
        );
      }
      if (benefit.actionCode === "NONE") {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_NO_ACTION",
          "Cet avantage ne crée pas de demande manuelle.",
        );
      }

      const usage = await tx.enterpriseRelationshipBenefitUsage.create({
        data: {
          organizationId,
          benefitId,
          identityLinkId,
          userId,
          actionCode: benefit.actionCode,
          idempotencyKey,
          note: note || null,
          requestContextJson: context
            ? (context as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          executionMode: "REQUEST",
        },
      });
      return { usage, created: true };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 30000,
    },
  );

  if (result.created) {
    const admins = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        removedAt: null,
        role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] },
      },
      select: { userId: true },
      take: 50,
    });
    await notifyUsers({
      userIds: admins.map((item) => item.userId),
      organizationId,
      type: "ENTERPRISE_RELATIONSHIP",
      title: "Nouvelle demande d’avantage",
      body: "Un membre lié à l’entreprise a demandé l’utilisation d’un avantage.",
      targetUrl: `/enterprise-relationship-benefits?usage=${result.usage.id}`,
    });
  }

  return result.usage;
}

export async function cancelRelationshipBenefitUsageByUser({
  organizationId,
  usageId,
  identityLinkId,
  userId,
  revision,
}: {
  organizationId: string;
  usageId: string;
  identityLinkId: string;
  userId: string;
  revision: number;
}) {
  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: { id: identityLinkId, organizationId, userId },
    select: { id: true },
  });
  if (!link) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_RELATION_NOT_FOUND",
      "Cette relation avec l’entreprise est introuvable.",
      404,
    );
  }

  const usage = await prisma.enterpriseRelationshipBenefitUsage.findFirst({
    where: { id: usageId, organizationId, identityLinkId, userId },
  });
  if (!usage) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_NOT_FOUND",
      "Cette demande d’avantage est introuvable.",
      404,
    );
  }
  if (usage.revision !== revision) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_CONFLICT",
      "Cette demande a changé. Actualisez avant de réessayer.",
      409,
    );
  }
  if (!["REQUESTED", "APPROVED"].includes(usage.status)) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_CANNOT_CANCEL",
      "Cette demande ne peut plus être annulée.",
      409,
    );
  }

  const updated = await prisma.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      id: usageId,
      organizationId,
      identityLinkId,
      userId,
      revision,
      status: { in: ["REQUESTED", "APPROVED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      revision: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_CONFLICT",
      "Cette demande a changé. Actualisez avant de réessayer.",
      409,
    );
  }

  const admins = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] },
    },
    select: { userId: true },
    take: 50,
  });
  await notifyUsers({
    userIds: admins.map((item) => item.userId),
    organizationId,
    type: "ENTERPRISE_RELATIONSHIP",
    title: "Demande d’avantage annulée",
    body: "Le membre lié a annulé une demande d’avantage qui n’était pas encore consommée.",
    targetUrl: `/enterprise-relationship-benefits?usage=${usage.id}`,
  });

  return prisma.enterpriseRelationshipBenefitUsage.findFirst({
    where: { id: usageId, organizationId, identityLinkId, userId },
  });
}

export async function decideRelationshipBenefitUsage({
  organizationId,
  usageId,
  actorUserId,
  revision,
  status,
  note,
  context,
}: {
  organizationId: string;
  usageId: string;
  actorUserId: string;
  revision: number;
  status: "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED";
  note?: string | null;
  context?: RelationshipBenefitExecutionContext | null;
}) {
  const usage = await prisma.enterpriseRelationshipBenefitUsage.findFirst({
    where: { id: usageId, organizationId },
  });
  if (!usage) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_NOT_FOUND",
      "Cette demande est introuvable.",
      404,
    );
  }
  if (usage.revision !== revision) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_CONFLICT",
      "Cette demande a changé. Actualisez avant de réessayer.",
      409,
    );
  }

  const allowed: Record<string, string[]> = {
    REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
    APPROVED: ["CONSUMED", "CANCELLED"],
    REJECTED: [],
    CONSUMED: [],
    CANCELLED: [],
  };
  if (!allowed[usage.status]?.includes(status)) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_TRANSITION_INVALID",
      "Cette demande ne peut plus passer dans l’état choisi.",
      409,
    );
  }

  const effectiveContext =
    context || storedExecutionContext(usage.requestContextJson);

  if (status === "APPROVED" || status === "CONSUMED") {
    const resolved = await evaluateRelationshipBenefit({
      organizationId,
      userId: usage.userId,
      identityLinkId: usage.identityLinkId,
      benefitId: usage.benefitId,
      context: effectiveContext,
      requireBusinessContext: status === "CONSUMED" || Boolean(effectiveContext),
      excludeUsageId: usage.id,
    });
    if (!resolved.evaluation.allowed) {
      throw new EnterpriseRelationshipBenefitError(
        resolved.evaluation.code === "RELATIONSHIP_INACTIVE"
          ? "RELATIONSHIP_BENEFIT_RELATION_INACTIVE"
          : "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
        resolved.evaluation.reason,
        resolved.evaluation.code === "TOTAL_LIMIT_REACHED" ||
          resolved.evaluation.code === "PERIOD_LIMIT_REACHED"
          ? 409
          : 403,
      );
    }
    if (
      status === "APPROVED" &&
      resolved.evaluation.requiresBusinessContext &&
      !effectiveContext
    ) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_CONTEXT_REQUIRED",
        "Cette demande dépend d’une opération métier. Le contexte du module, du montant, de la devise et des conditions doit être vérifié avant approbation.",
        409,
      );
    }
  }

  if (status === "CONSUMED") {
    if (
      !usage.effectModuleCode ||
      !usage.effectEntityType ||
      !usage.effectEntityId ||
      !usage.effectIdempotencyKey ||
      !usage.executedAt
    ) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_EFFECT_REQUIRED",
        "Cet avantage ne peut pas être marqué comme utilisé sans effet métier vérifié. Exécutez d’abord l’action dans le module concerné.",
        409,
      );
    }
  }

  const data: Prisma.EnterpriseRelationshipBenefitUsageUpdateManyMutationInput = {
    status,
    organizationNote: note || null,
    decidedByUserId: actorUserId,
    revision: { increment: 1 },
    ...(effectiveContext && !usage.requestContextJson
      ? {
          requestContextJson:
            effectiveContext as unknown as Prisma.InputJsonValue,
        }
      : {}),
    ...(status === "APPROVED" || status === "REJECTED"
      ? { decidedAt: new Date() }
      : {}),
    ...(status === "CONSUMED" ? { consumedAt: new Date() } : {}),
    ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
  };
  const updated = await prisma.enterpriseRelationshipBenefitUsage.updateMany({
    where: { id: usageId, organizationId, revision },
    data,
  });
  if (updated.count !== 1) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_USAGE_CONFLICT",
      "Cette demande a changé. Actualisez avant de réessayer.",
      409,
    );
  }

  await notifyUser({
    userId: usage.userId,
    organizationId,
    type: "ENTERPRISE_RELATIONSHIP",
    title:
      status === "APPROVED"
        ? "Avantage approuvé"
        : status === "CONSUMED"
          ? "Avantage appliqué"
          : status === "REJECTED"
            ? "Demande d’avantage refusée"
            : "Demande d’avantage annulée",
    body:
      note ||
      (status === "APPROVED"
        ? "Votre demande est approuvée. L’avantage sera considéré comme utilisé uniquement après un effet métier vérifié."
        : "Le statut de votre demande d’avantage a été mis à jour par l’entreprise."),
    targetUrl: `/enterprise-links?link=${usage.identityLinkId}&view=active`,
    idempotencyKey: `relationship-benefit-usage:${usage.id}:${status}:${revision}`,
  });

  return prisma.enterpriseRelationshipBenefitUsage.findFirst({
    where: { id: usageId, organizationId },
  });
}
