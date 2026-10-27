import { Prisma } from "@prisma/client";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import {
  evaluateRelationshipBenefit,
  evaluateRelationshipBenefitSnapshot,
  type RelationshipBenefitExecutionContext,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import { EnterpriseRelationshipBenefitError } from "@/lib/enterprise/relationship-benefits/service";
import { changeRelationalStoreCreditTx, ensureRelationalStoreCreditAccountTx } from "@/lib/enterprise/retail/relationship-store-credit";
import { prisma } from "@/lib/prisma";

function failure(code: string, message: string, status = 409): never {
  throw new EnterpriseRelationshipBenefitError(code, message, status);
}
const metadata = (value: Prisma.JsonValue | null) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const currencyContext = (businessPartyId: string, currencyCode: string): RelationshipBenefitExecutionContext => ({
  moduleCode: "RETAIL_POS", businessPartyId, currencyCode,
});

function ensureShape(benefit: {
  benefitType: string; valueType: string; valueDecimal: Prisma.Decimal | null;
  currencyCode: string | null; targetModuleCode: string | null; actionCode: string;
  assignmentMode: string; minimumAmount: Prisma.Decimal | null; conditionsJson: Prisma.JsonValue | null;
  stackable: boolean; status: string; archivedAt: Date | null;
}) {
  if (benefit.benefitType !== "CREDIT" || benefit.valueType !== "AMOUNT" ||
      !benefit.valueDecimal?.gt(0) || !benefit.valueDecimal.isFinite() ||
      !benefit.currencyCode || benefit.targetModuleCode !== "RETAIL_POS" ||
      benefit.actionCode !== "NONE" || benefit.assignmentMode !== "MANUAL" ||
      benefit.stackable || benefit.minimumAmount ||
      Object.keys(metadata(benefit.conditionsJson)).length ||
      benefit.status !== "ACTIVE" || benefit.archivedAt) {
    failure("RELATIONSHIP_CREDIT_CONFIGURATION_INVALID", "Ce crédit relationnel n'est pas activé pour une attribution manuelle sécurisée.");
  }
}

async function checkDocument(tx: Prisma.TransactionClient, organizationId: string, documentId: string) {
  const doc = await tx.enterpriseDocument.findFirst({
    where: { organizationId, id: documentId, archivedAt: null, status: "ACTIVE", visibility: "ORGANIZATION", currentVersion: { gt: 0 } },
    select: { id: true, versions: { take: 1, select: { id: true } } },
  });
  if (!doc?.versions.length) failure("RELATIONSHIP_CREDIT_EVIDENCE_REQUIRED", "Joignez un justificatif déjà enregistré et vérifiable.");
}

async function grantEligibilityTx(tx: Prisma.TransactionClient, args: {
  organizationId: string; usageId?: string; benefitId: string;
  identityLinkId: string; userId: string; businessPartyId: string;
  currencyCode: string;
}) {
  const { organizationId } = args;
  const [benefit, link, assignment, usages, party, modules] = await Promise.all([
    tx.enterpriseRelationshipBenefit.findFirst({
      where: { organizationId, id: args.benefitId }, include: { audiences: true },
    }),
    tx.enterpriseIdentityLink.findFirst({
      where: { organizationId, id: args.identityLinkId, userId: args.userId },
      select: { id: true, userId: true, personIdentityId: true, status: true, requestedRelationType: true,
        requestedRoleCode: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true },
    }),
    tx.enterpriseRelationshipBenefitAssignment.findFirst({
      where: { organizationId, benefitId: args.benefitId, identityLinkId: args.identityLinkId },
      select: { benefitId: true, status: true, startsAt: true, endsAt: true },
    }),
    tx.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId, benefitId: args.benefitId, identityLinkId: args.identityLinkId, userId: args.userId,
        ...(args.usageId ? { id: { not: args.usageId } } : {}),
      },
      select: { benefitId: true, status: true, requestedAt: true }, take: 100000,
    }),

    tx.enterpriseBusinessParty.findFirst({
      where: { organizationId, id: args.businessPartyId, status: "ACTIVE", archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
      select: { id: true },
    }),
    tx.enterpriseModule.findMany({
      where: { organizationId, isEnabled: true, moduleCode: { in: ["RETAIL_POS", "RELATIONSHIP_BENEFITS"] } },
      select: { moduleCode: true },
    }),
  ]);
  const reference = link ? await tx.enterprisePersonBusinessReference.findFirst({
    where: { organizationId, businessPartyId: args.businessPartyId, personIdentityId: link.personIdentityId,
      status: "ACTIVE", archivedAt: null },
    select: { id: true },
  }) : null;
  if (!benefit || !link || !party || !reference ||
      !["RETAIL_POS", "RELATIONSHIP_BENEFITS"].every((code) => modules.some((row) => row.moduleCode === code))) {
    failure("RELATIONSHIP_CREDIT_BENEFICIARY_INVALID", "La relation, le client ou le module n'est plus éligible.", 403);
  }
  ensureShape(benefit);
  if (benefit.currencyCode !== args.currencyCode) failure("RELATIONSHIP_CREDIT_CURRENCY_INVALID", "La devise du crédit ne correspond plus à l'avantage.");
  const evaluation = evaluateRelationshipBenefitSnapshot({
    benefit, link, assignment, usages,
    context: currencyContext(args.businessPartyId, args.currencyCode),
    now: new Date(), requireBusinessContext: true,
  });
  if (!evaluation.allowed) {
    failure("RELATIONSHIP_CREDIT_NOT_ELIGIBLE", evaluation.reason, 403);
  }
  return { benefit, link };
}

export async function createManualRelationshipCreditRequest(args: {
  organizationId: string; actorUserId: string; benefitId: string;
  identityLinkId: string; businessPartyId: string; documentId: string;
  reason: string; idempotencyKey: string;
}) {
  const { organizationId } = args;
  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: { organizationId, id: args.identityLinkId, status: "ACTIVE", userId: { not: null } },
    select: { userId: true },
  });
  if (!link?.userId) failure("RELATIONSHIP_CREDIT_RELATION_INVALID", "La relation sélectionnée n'est pas active.", 403);
  const candidate = await evaluateRelationshipBenefit({
    organizationId, userId: link.userId, identityLinkId: args.identityLinkId,
    benefitId: args.benefitId, context: null,
    requireBusinessContext: false,
  });
  // Currency is checked against the actual benefit during the transaction,
  // not against this preliminary lookup.
  if (!candidate.benefit || candidate.benefit.benefitType !== "CREDIT") {
    failure("RELATIONSHIP_CREDIT_NOT_AVAILABLE", "Cet avantage de crédit n'est pas disponible.", 403);
  }
  const currencyCode = candidate.benefit.currencyCode;
  if (!currencyCode) failure("RELATIONSHIP_CREDIT_CURRENCY_REQUIRED", "Une devise active est obligatoire.");
  const beneficiaryUserId = link.userId;
  const key = `manual-credit:${args.idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId + ":relationship-benefit:" + args.identityLinkId + ":" + args.benefitId})::bigint)`);
    const existing = await tx.enterpriseRelationshipBenefitUsage.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
    });
    if (existing) {
      const c = metadata(existing.requestContextJson);
      if (existing.executionMode !== "MANUAL_RETAIL_CREDIT" || existing.benefitId !== args.benefitId ||
          existing.identityLinkId !== args.identityLinkId || c.requestedByUserId !== args.actorUserId ||
          c.businessPartyId !== args.businessPartyId || c.documentId !== args.documentId || existing.note !== args.reason) {
        failure("RELATIONSHIP_CREDIT_IDEMPOTENCY_CONFLICT", "Cette demande possède déjà un autre contexte.");
      }
      return existing;
    }
    await checkDocument(tx, organizationId, args.documentId);
    const { link: checked, benefit: quoted } = await grantEligibilityTx(tx, {
      organizationId, benefitId: args.benefitId, identityLinkId: args.identityLinkId,
      userId: beneficiaryUserId, businessPartyId: args.businessPartyId, currencyCode,
    });
    return tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId, benefitId: args.benefitId, identityLinkId: args.identityLinkId,
        userId: checked.userId!, actionCode: "NONE", status: "REQUESTED", idempotencyKey: key,
        executionMode: "MANUAL_RETAIL_CREDIT", note: args.reason,
        requestContextJson: {
          moduleCode: "RETAIL_POS", businessPartyId: args.businessPartyId,
          currencyCode, documentId: args.documentId, requestedByUserId: args.actorUserId,
          creditAmount: quoted.valueDecimal!.toFixed(),
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function decideManualRelationshipCredit(args: {
  organizationId: string; actorUserId: string; usageId: string;
  revision: number; decision: "APPROVE" | "REJECT" | "REVERSE"; reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.organizationId + ":manual-credit:" + args.usageId})::bigint)`);
    const usage = await tx.enterpriseRelationshipBenefitUsage.findFirst({
      where: { id: args.usageId, organizationId: args.organizationId, executionMode: "MANUAL_RETAIL_CREDIT" },
    });
    if (!usage) failure("RELATIONSHIP_CREDIT_NOT_FOUND", "Cette attribution est introuvable.", 404);
    if (usage.revision !== args.revision) failure("RELATIONSHIP_CREDIT_REVISION_CONFLICT", "Cette demande a changé. Actualisez les données.");
    const context = metadata(usage.requestContextJson);
    const requestedBy = str(context.requestedByUserId);
    const businessPartyId = str(context.businessPartyId);
    const documentId = str(context.documentId);
    const currencyCode = str(context.currencyCode);
    if (!requestedBy || !businessPartyId || !documentId || !currencyCode ||
        requestedBy === args.actorUserId) {
      failure("RELATIONSHIP_CREDIT_INDEPENDENT_APPROVER_REQUIRED", "Une autre personne autorisée doit valider ou reprendre ce crédit.", 403);
    }
    if (args.decision === "REJECT") {
      if (usage.status !== "REQUESTED") failure("RELATIONSHIP_CREDIT_TRANSITION_INVALID", "Cette demande n'est plus en attente.");
      return tx.enterpriseRelationshipBenefitUsage.update({
        where: { id: usage.id },
        data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: args.actorUserId,
          organizationNote: args.reason, revision: { increment: 1 } },
      });
    }
    if (args.decision === "APPROVE") {
      if (usage.status !== "REQUESTED") failure("RELATIONSHIP_CREDIT_TRANSITION_INVALID", "Cette attribution a déjà été traitée.");
      await checkDocument(tx, args.organizationId, documentId);
      await grantEligibilityTx(tx, {
        organizationId: args.organizationId, usageId: usage.id,
        benefitId: usage.benefitId, identityLinkId: usage.identityLinkId,
        userId: usage.userId, businessPartyId, currencyCode,
      });
      const benefit = await tx.enterpriseRelationshipBenefit.findFirst({
        where: { organizationId: args.organizationId, id: usage.benefitId },
        select: { code: true, valueDecimal: true },
      });
      if (!benefit?.valueDecimal?.gt(0) || context.creditAmount !== benefit.valueDecimal.toFixed()) {
        failure("RELATIONSHIP_CREDIT_VALUE_CHANGED", "Le montant de ce crédit a été modifié depuis la demande. Créez une nouvelle attribution.");
      }
      const account = await ensureRelationalStoreCreditAccountTx({
        tx, organizationId: args.organizationId, customerBusinessPartyId: businessPartyId,
        currencyCode, actorUserId: args.actorUserId,
      });
      const key = `credit:relationship:usage:${usage.id}`;
      const entry = await changeRelationalStoreCreditTx({
        tx, organizationId: args.organizationId, accountId: account.id,
        customerBusinessPartyId: businessPartyId, currencyCode,
        actorUserId: args.actorUserId, amount: benefit.valueDecimal,
        entryType: "EARN", idempotencyKey: key, reason: `Crédit relationnel ${benefit.code}`,
      });
      const updated = await tx.enterpriseRelationshipBenefitUsage.update({
        where: { id: usage.id },
        data: {
          status: "CONSUMED", decidedAt: new Date(), consumedAt: new Date(), executedAt: new Date(),
          decidedByUserId: args.actorUserId, organizationNote: args.reason,
          effectIdempotencyKey: key, effectModuleCode: "RETAIL_POS",
          effectEntityType: "EnterpriseRetailStoredValueEntry", effectEntityId: entry.id,
          effectAmount: benefit.valueDecimal, effectCurrencyCode: currencyCode,
          effectMetadataJson: { storedValueAccountId: account.id, storedValueEntryId: entry.id, evidenceDocumentId: documentId },
          revision: { increment: 1 },
        },
      });
      await postBusinessEventTx(tx, args.organizationId, args.actorUserId, {
        postingEvent: "RETAIL_RELATIONSHIP_CREDIT_GRANTED",
        sourceEntityType: "EnterpriseRelationshipBenefitUsage", sourceEntityId: usage.id,
      });
      return updated;
    }
    if (usage.status !== "CONSUMED" || !usage.effectAmount?.gt(0)) {
      failure("RELATIONSHIP_CREDIT_TRANSITION_INVALID", "Seul un crédit réellement attribué peut être repris.");
    }
    const details = metadata(usage.effectMetadataJson);
    const accountId = str(details.storedValueAccountId);
    if (!accountId) failure("RELATIONSHIP_CREDIT_EFFECT_MISSING", "Le mouvement original est introuvable.");
    const entry = await changeRelationalStoreCreditTx({
      tx, organizationId: args.organizationId, accountId,
      customerBusinessPartyId: businessPartyId, currencyCode,
      actorUserId: args.actorUserId, amount: usage.effectAmount.negated(),
      entryType: "REVERSAL", idempotencyKey: `credit:relationship:reversal:${usage.id}`,
      reason: args.reason,
    });
    const updated = await tx.enterpriseRelationshipBenefitUsage.update({
      where: { id: usage.id },
      data: {
        status: "CANCELLED", cancelledAt: new Date(), organizationNote: args.reason,
        effectMetadataJson: { ...details, reversalEntryId: entry.id, reversalReason: args.reason },
        revision: { increment: 1 },
      },
    });
    await postBusinessEventTx(tx, args.organizationId, args.actorUserId, {
      postingEvent: "RETAIL_RELATIONSHIP_CREDIT_REVERSED",
      sourceEntityType: "EnterpriseRelationshipBenefitUsage", sourceEntityId: usage.id,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
