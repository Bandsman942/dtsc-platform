import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canUseModule } from "@/lib/billing/entitlements";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { evaluateRelationshipBenefitSnapshot } from "@/lib/enterprise/relationship-benefits/enforcement";
import { requireIdentityLinkOrganizationAdmin } from "@/lib/enterprise/identity-links/http";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; linkId: string }> };

// Only facts from the canonical consent and benefit registries are returned.
// CRM users must prove that the relation belongs to the precise party they are viewing.
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, linkId } = await params;
  const session = await getSession();
  if (!session || !session.activeOrganizationId || session.activeOrganizationId !== organizationId || session.activeContext !== "ORGANIZATION") {
    return NextResponse.json({ message: "Reconnectez-vous à l'entreprise concernée." }, { status: 403 });
  }

  const url = new URL(req.url);
  const partyId = url.searchParams.get("partyId")?.trim() || null;
  const allowedStatuses = ["REQUESTED", "APPROVED", "REJECTED", "CONSUMED", "CANCELLED"] as const;
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus && allowedStatuses.some((value) => value === requestedStatus) ? requestedStatus : null;
  const page = Math.min(1000, Math.max(1, Number(url.searchParams.get("page") || 1) || 1));
  const admin = await requireIdentityLinkOrganizationAdmin(req, organizationId).then(() => true).catch(() => false);
  if (!admin) {
    const access = await getEnterpriseCommonDomainAccess({
      session,
      organizationId,
      moduleCode: "CRM_CUSTOMERS",
      action: "read",
    });
    if (!access || !partyId) {
      return NextResponse.json({ message: "Vous n'êtes pas autorisé à consulter cette relation." }, { status: 403 });
    }
  }

  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: { id: linkId, organizationId },
    select: {
      id: true,
      personIdentityId: true,
      userId: true,
      userDecisionAt: true,
      organizationDecisionAt: true,
      status: true,
      requestedRelationType: true,
      requestedRoleCode: true,
      purpose: true,
      activatedAt: true,
      createdAt: true,
    },
  });
  if (!link) return NextResponse.json({ message: "Cette relation n'existe pas dans votre entreprise." }, { status: 404 });

  if (partyId) {
    const reference = await prisma.enterprisePersonBusinessReference.findFirst({
      where: { organizationId, personIdentityId: link.personIdentityId, businessPartyId: partyId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!reference) return NextResponse.json({ message: "Cette relation ne correspond pas à la fiche consultée." }, { status: 404 });
  }

  const now = new Date();
  const [benefits, assignments, usages, total] = await Promise.all([
    link.status === "ACTIVE" && link.userId && link.activatedAt && link.userDecisionAt && link.organizationDecisionAt ? prisma.enterpriseRelationshipBenefit.findMany({
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
      orderBy: { createdAt: "desc" },
      take: 100,
    }) : Promise.resolve([]),
    prisma.enterpriseRelationshipBenefitAssignment.findMany({
      where: { organizationId, identityLinkId: link.id, status: "ACTIVE" },
      select: { benefitId: true, startsAt: true, endsAt: true },
      take: 200,
    }),
    prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: { organizationId, identityLinkId: link.id, ...(status ? { status } : {}) },
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true, status: true, requestedAt: true, decidedAt: true, consumedAt: true,
        cancelledAt: true, executedAt: true, effectModuleCode: true,
        effectEntityType: true, effectEntityId: true, effectAmount: true,
        effectCurrencyCode: true, benefit: { select: { nameFr: true, nameEn: true } },
      },
    }),
    prisma.enterpriseRelationshipBenefitUsage.count({ where: { organizationId, identityLinkId: link.id, ...(status ? { status } : {}) } }),
  ]);

  // Reuse the same eligibility, consent and quota evaluator as operational adapters.
  // A paginated history alone must not be used to calculate benefit consumption quotas.
  const quotaUsages = benefits.length ? await prisma.enterpriseRelationshipBenefitUsage.findMany({
    where: { organizationId, identityLinkId: link.id, benefitId: { in: benefits.map((benefit) => benefit.id) } },
    select: { benefitId: true, status: true, requestedAt: true },
    take: 100000,
  }) : [];
  const usagesByBenefitId = new Map<string, typeof quotaUsages>();
  for (const usage of quotaUsages) {
    usagesByBenefitId.set(usage.benefitId, [...(usagesByBenefitId.get(usage.benefitId) || []), usage]);
  }
  const assignmentByBenefit = new Map(assignments.map((entry) => [entry.benefitId, entry]));
  const applicable = await Promise.all(benefits.map(async (benefit) => {
    const assignment = assignmentByBenefit.get(benefit.id);
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit,
      link,
      assignment: assignment ? { ...assignment, status: "ACTIVE" } : null,
      usages: usagesByBenefitId.get(benefit.id) || [],
      now,
      requireBusinessContext: false,
    });
    if (!evaluation.allowed && !["TOTAL_LIMIT_REACHED", "PERIOD_LIMIT_REACHED"].includes(evaluation.code)) return null;
    if (benefit.targetModuleCode) {
      const access = await canUseModule(organizationId, normalizeEnterpriseModuleCode(benefit.targetModuleCode));
      if (!access.allowed) return null;
    }
    return {
      id: benefit.id,
      nameFr: benefit.nameFr,
      nameEn: benefit.nameEn,
      descriptionFr: benefit.descriptionFr,
      descriptionEn: benefit.descriptionEn,
      valueType: benefit.valueType,
      valueDecimal: benefit.valueDecimal === null ? null : Number(benefit.valueDecimal),
      currencyCode: benefit.currencyCode,
      minimumAmount: benefit.minimumAmount === null ? null : Number(benefit.minimumAmount),
      usageLimitTotal: benefit.usageLimitTotal,
      totalRemaining: evaluation.totalRemaining,
      periodRemaining: evaluation.periodRemaining,
      usable: evaluation.allowed,
      requiresBusinessContext: evaluation.requiresBusinessContext,
      usageLimitPerPeriod: benefit.usageLimitPerPeriod,
      usagePeriodDays: benefit.usagePeriodDays,
      startsAt: benefit.startsAt?.toISOString() || null,
      endsAt: benefit.endsAt?.toISOString() || null,
      targetModuleCode: benefit.targetModuleCode,
    };
  }));

  const gamingIds = usages
    .filter((usage) => usage.effectModuleCode === "GAMING_CHECKOUT"
      && usage.effectEntityType === "EnterpriseGamingCheckout" && Boolean(usage.effectEntityId))
    .map((usage) => usage.effectEntityId as string);
  const gamingAccess = gamingIds.length
    ? await resolveEnterpriseModuleCapabilities({
        userId: session.userId, organizationId, moduleCode: "GAMING_CHECKOUT",
      })
    : null;
  const checkedGaming = gamingAccess?.canRead
    ? await prisma.enterpriseGamingCheckout.findMany({
        where: { organizationId, id: { in: gamingIds } },
        select: { id: true },
        take: 20,
      })
    : [];
  const authorizedCheckoutIds = new Set(checkedGaming.map((checkout) => checkout.id));

  await writeApiLog({
    request: req, statusCode: 200, userId: session.userId, startedAt,
    metadata: { organizationId, action: "identity-link-overview", page },
  });

  return NextResponse.json({
    relation: {
      id: link.id, status: link.status, requestedRelationType: link.requestedRelationType,
      purpose: link.purpose, createdAt: link.createdAt.toISOString(),
      activatedAt: link.activatedAt?.toISOString() || null,
    },
    // These are possible benefits, not a guarantee of actual transaction eligibility.
    benefits: applicable.filter((item) => item !== null),
    usages: usages.map((usage) => ({
      id: usage.id, status: usage.status,
      benefitNameFr: usage.benefit.nameFr, benefitNameEn: usage.benefit.nameEn,
      requestedAt: usage.requestedAt.toISOString(), decidedAt: usage.decidedAt?.toISOString() || null,
      consumedAt: usage.consumedAt?.toISOString() || null, cancelledAt: usage.cancelledAt?.toISOString() || null,
      executedAt: usage.executedAt?.toISOString() || null,
      effectModuleCode: usage.effectModuleCode, effectEntityType: usage.effectEntityType,
      effectEntityId: usage.effectModuleCode === "GAMING_CHECKOUT" &&
        usage.effectEntityId && authorizedCheckoutIds.has(usage.effectEntityId) ? usage.effectEntityId : null,
      operationHref: usage.effectModuleCode === "GAMING_CHECKOUT" &&
        usage.effectEntityType === "EnterpriseGamingCheckout" &&
        usage.effectEntityId && authorizedCheckoutIds.has(usage.effectEntityId)
          ? `/enterprise-modules/GAMING_CHECKOUT?checkout=${encodeURIComponent(usage.effectEntityId)}`
          : null,
      effectAmount: usage.effectAmount === null ? null : Number(usage.effectAmount),
      effectCurrencyCode: usage.effectCurrencyCode,
    })),
    pagination: { page, pageCount: Math.max(1, Math.ceil(total / 20)), total },
  });
}
