import { Prisma } from "@prisma/client";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import { ENTERPRISE_IDENTITY_RELATION_TYPES } from "@/lib/enterprise/identity-links/contracts";
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
      relationTypes: benefit.audiences.map((audience) => audience.relationType),
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
        relationType: link?.requestedRelationType || null,
        personName: link ? personById.get(link.personIdentityId) || null : null,
      };
    }),
  };
}

export async function listAssignableRelationshipLinks(organizationId: string) {
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId, status: "ACTIVE", userId: { not: null } },
    select: { id: true, requestedRelationType: true, personIdentityId: true, activatedAt: true },
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
  if (relationTypes.some((type) => !(ENTERPRISE_IDENTITY_RELATION_TYPES as readonly string[]).includes(type))) {
    throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_AUDIENCE_INVALID", "Un type de relation sélectionné n’est pas reconnu.");
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new EnterpriseRelationshipBenefitError("RELATIONSHIP_BENEFIT_DATES_INVALID", "La date de fin doit être postérieure à la date de début.");
  }

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
        targetModuleCode: input.targetModuleCode || null,
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
        data: relationTypes.map((relationType) => ({ organizationId, benefitId: benefit.id, relationType })),
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
  for (const key of ["nameFr", "nameEn", "descriptionFr", "descriptionEn", "benefitType", "assignmentMode", "valueType", "currencyCode", "actionCode", "actionLabelFr", "actionLabelEn", "targetModuleCode", "status"] as const) {
    if (key in input) writable[key] = input[key] ?? null;
  }
  for (const key of ["valueDecimal", "minimumAmount", "usageLimitTotal", "usageLimitPerPeriod", "usagePeriodDays", "stackable"] as const) {
    if (key in input) writable[key] = input[key] ?? null;
  }
  if ("startsAt" in input) data.startsAt = input.startsAt ? new Date(String(input.startsAt)) : null;
  if ("endsAt" in input) data.endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
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
    if (relationTypes) {
      await tx.enterpriseRelationshipBenefitAudience.deleteMany({ where: { organizationId, benefitId } });
      if (relationTypes.length) {
        await tx.enterpriseRelationshipBenefitAudience.createMany({
          data: relationTypes.map((relationType) => ({ organizationId, benefitId, relationType })),
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
  const reference = await prisma.enterprisePersonBusinessReference.findFirst({
    where: { organizationId, personIdentityId, status: "ACTIVE", archivedAt: null, businessPartyId: { not: null } },
    select: { businessPartyId: true },
  });
  if (!reference?.businessPartyId) return null;

  const [loyaltyAccounts, storedValueAccounts, retailModule] = await Promise.all([
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
    prisma.enterpriseModule.findFirst({
      where: { organizationId, moduleCode: "RETAIL_POS", isEnabled: true },
      select: { id: true },
    }),
  ]);
  if (!retailModule) return null;

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
    select: { id: true, personIdentityId: true, requestedRelationType: true, requestedRoleCode: true },
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
        benefit: { select: { nameFr: true, nameEn: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 1000,
    }),
    retailSnapshot(organizationId, link.personIdentityId),
  ]);

  const assigned = new Set(
    assignments
      .filter((item) => item.status === "ACTIVE" && isDateActive(item.startsAt, item.endsAt, now))
      .map((item) => item.benefitId),
  );
  const usageByBenefit = new Map<string, Date[]>();
  for (const usage of usages) {
    if (["REJECTED", "CANCELLED"].includes(usage.status)) continue;
    const list = usageByBenefit.get(usage.benefitId) || [];
    list.push(usage.requestedAt);
    usageByBenefit.set(usage.benefitId, list);
  }

  const items = benefits.flatMap((benefit) => {
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
    if (!eligibleByTarget) return [];

    const usageDates = usageByBenefit.get(benefit.id) || [];
    const totalRemaining =
      benefit.usageLimitTotal === null ? null : Math.max(0, benefit.usageLimitTotal - usageDates.length);
    let periodRemaining: number | null = null;
    if (benefit.usageLimitPerPeriod !== null && benefit.usagePeriodDays) {
      const periodStart = new Date(now.getTime() - benefit.usagePeriodDays * 24 * 60 * 60 * 1000);
      const periodUsed = usageDates.filter((requestedAt) => requestedAt >= periodStart).length;
      periodRemaining = Math.max(0, benefit.usageLimitPerPeriod - periodUsed);
    }
    const usable =
      (totalRemaining === null || totalRemaining > 0) &&
      (periodRemaining === null || periodRemaining > 0);

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
      usable,
      totalRemaining,
      periodRemaining,
      usagePeriodDays: benefit.usagePeriodDays,
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
}: {
  organizationId: string;
  userId: string;
  identityLinkId: string;
  benefitId: string;
  idempotencyKey: string;
  note?: string | null;
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

  const resolved = await resolveEnterpriseRelationshipBenefits({
    userId,
    organizationId,
    identityLinkId,
  });
  const resolvedBenefit = resolved.items.find((item) => item.id === benefitId);
  if (!resolvedBenefit) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
      "Cet avantage n’est pas disponible pour cette relation.",
      403,
    );
  }
  if (!resolvedBenefit.usable) {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_LIMIT_REACHED",
      "La limite d’utilisation de cet avantage est atteinte.",
      409,
    );
  }
  if (resolvedBenefit.actionCode === "NONE") {
    throw new EnterpriseRelationshipBenefitError(
      "RELATIONSHIP_BENEFIT_NO_ACTION",
      "Cet avantage est informatif et ne nécessite aucune demande.",
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

      const now = new Date();
      const link = await tx.enterpriseIdentityLink.findFirst({
        where: {
          id: identityLinkId,
          organizationId,
          userId,
          status: "ACTIVE",
          activatedAt: { not: null },
          userDecisionAt: { not: null },
          organizationDecisionAt: { not: null },
        },
        select: {
          id: true,
          requestedRelationType: true,
          requestedRoleCode: true,
        },
      });
      if (!link) {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_RELATION_INACTIVE",
          "La relation n’est plus active ou approuvée : cet avantage ne peut plus être demandé.",
          409,
        );
      }

      const benefit = await tx.enterpriseRelationshipBenefit.findFirst({
        where: {
          id: benefitId,
          organizationId,
          status: "ACTIVE",
          archivedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        include: { audiences: true },
      });
      if (!benefit) {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_INACTIVE",
          "Cet avantage n’est plus actif.",
          409,
        );
      }
      if (benefit.actionCode === "NONE") {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_NO_ACTION",
          "Cet avantage est informatif et ne nécessite aucune demande.",
        );
      }

      const assignment = await tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: {
          organizationId,
          benefitId,
          identityLinkId,
          status: "ACTIVE",
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        select: { id: true },
      });
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
      if (!eligible) {
        throw new EnterpriseRelationshipBenefitError(
          "RELATIONSHIP_BENEFIT_NOT_ELIGIBLE",
          "Votre relation n’est plus éligible à cet avantage.",
          403,
        );
      }

      const activeUsageWhere = {
        organizationId,
        benefitId,
        identityLinkId,
        userId,
        status: { notIn: ["REJECTED", "CANCELLED"] },
      } satisfies Prisma.EnterpriseRelationshipBenefitUsageWhereInput;
      if (benefit.usageLimitTotal !== null) {
        const totalUsed = await tx.enterpriseRelationshipBenefitUsage.count({
          where: activeUsageWhere,
        });
        if (totalUsed >= benefit.usageLimitTotal) {
          throw new EnterpriseRelationshipBenefitError(
            "RELATIONSHIP_BENEFIT_LIMIT_REACHED",
            "La limite totale d’utilisation de cet avantage est atteinte.",
            409,
          );
        }
      }
      if (benefit.usageLimitPerPeriod !== null && benefit.usagePeriodDays) {
        const periodStart = new Date(
          now.getTime() - benefit.usagePeriodDays * 24 * 60 * 60 * 1000,
        );
        const periodUsed = await tx.enterpriseRelationshipBenefitUsage.count({
          where: { ...activeUsageWhere, requestedAt: { gte: periodStart } },
        });
        if (periodUsed >= benefit.usageLimitPerPeriod) {
          throw new EnterpriseRelationshipBenefitError(
            "RELATIONSHIP_BENEFIT_PERIOD_LIMIT_REACHED",
            "La limite d’utilisation de cet avantage pour la période en cours est atteinte.",
            409,
          );
        }
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
}: {
  organizationId: string;
  usageId: string;
  actorUserId: string;
  revision: number;
  status: "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED";
  note?: string | null;
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

  if (status === "APPROVED" || status === "CONSUMED") {
    const now = new Date();
    const [activeLink, activeBenefit] = await Promise.all([
      prisma.enterpriseIdentityLink.findFirst({
        where: {
          id: usage.identityLinkId,
          organizationId,
          userId: usage.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      prisma.enterpriseRelationshipBenefit.findFirst({
        where: {
          id: usage.benefitId,
          organizationId,
          status: "ACTIVE",
          archivedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (!activeLink) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_RELATION_INACTIVE",
        "La relation n’est plus active : cet avantage ne peut plus être approuvé ni consommé.",
        409,
      );
    }
    if (!activeBenefit) {
      throw new EnterpriseRelationshipBenefitError(
        "RELATIONSHIP_BENEFIT_INACTIVE",
        "Cet avantage n’est plus actif : la demande peut être refusée ou annulée, mais pas consommée.",
        409,
      );
    }
  }

  const data: Prisma.EnterpriseRelationshipBenefitUsageUpdateManyMutationInput = {
    status,
    organizationNote: note || null,
    decidedByUserId: actorUserId,
    revision: { increment: 1 },
    ...(status === "APPROVED" || status === "REJECTED" ? { decidedAt: new Date() } : {}),
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
          ? "Avantage utilisé"
          : status === "REJECTED"
            ? "Demande d’avantage refusée"
            : "Demande d’avantage annulée",
    body: note || "Le statut de votre demande d’avantage a été mis à jour par l’entreprise.",
    targetUrl: `/enterprise-links?link=${usage.identityLinkId}&view=active`,
    idempotencyKey: `relationship-benefit-usage:${usage.id}:${status}:${revision}`,
  });

  return prisma.enterpriseRelationshipBenefitUsage.findFirst({ where: { id: usageId, organizationId } });
}
