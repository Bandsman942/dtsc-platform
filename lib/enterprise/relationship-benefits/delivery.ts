import { Prisma } from "@prisma/client";
import { canUseModule } from "@/lib/billing/entitlements";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import { evaluateRelationshipBenefitSnapshot } from "@/lib/enterprise/relationship-benefits/enforcement";
import { EnterpriseRelationshipBenefitError } from "@/lib/enterprise/relationship-benefits/service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function reject(code: string, message: string, status = 409): never {
  throw new EnterpriseRelationshipBenefitError(code, message, status);
}

/**
 * DELIVERY is a non-monetary, request-led benefit. It does not create an order,
 * shipment or accounting entry: only the canonical CRM/Sales fulfillment can
 * prove that a service actually happened.
 */
export async function attestRelationshipDelivery(args: {
  organizationId: string;
  usageId: string;
  revision: number;
  fulfillmentReference: string;
  actorUserId: string;
}) {
  const { organizationId, usageId, revision, fulfillmentReference, actorUserId } = args;
  const orderAccess = await canUseModule(organizationId, "SALES_QUOTES_ORDERS");
  if (!orderAccess.allowed) {
    reject("RELATIONSHIP_DELIVERY_SALES_MODULE_DENIED", "Le module des commandes et livraisons doit être actif et autorisé.", 403);
  }

  // Read-only preflight for the member's consent/capability. The transaction
  // rechecks the actual link, audience, usage limits and target module under lock.
  const initial = await prisma.enterpriseRelationshipBenefitUsage.findFirst({
    where: { id: usageId, organizationId },
    select: { userId: true, identityLinkId: true },
  });
  if (!initial) reject("RELATIONSHIP_DELIVERY_REQUEST_NOT_FOUND", "Demande de livraison introuvable.", 404);
  const access = await resolveEnterpriseIdentityRelationshipAccess({
    userId: initial.userId,
    organizationId,
    identityLinkId: initial.identityLinkId,
  });
  if (!access.allowed || !access.capabilities.includes("ENTERPRISE_BENEFITS")) {
    reject("RELATIONSHIP_DELIVERY_CONSENT_REVOKED", "La relation ou le consentement n'autorise plus cette livraison.", 403);
  }

  let result: Awaited<ReturnType<typeof prisma.enterpriseRelationshipBenefitUsage.findFirst>>;
  let changed = false;
  try {
    result = await prisma.$transaction(async (tx) => {
      // Serializes decisions for this usage and prevents concurrent double attestations.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId + ":relationship-delivery:" + usageId})::bigint)`);
      const usage = await tx.enterpriseRelationshipBenefitUsage.findFirst({
        where: { id: usageId, organizationId },
        include: { benefit: { include: { audiences: true } } },
      });
      if (!usage) reject("RELATIONSHIP_DELIVERY_REQUEST_NOT_FOUND", "Demande de livraison introuvable.", 404);
      if (usage.benefit.benefitType !== "DELIVERY" || usage.executionMode !== "REQUEST" ||
          usage.benefit.targetModuleCode !== "SALES_QUOTES_ORDERS" ||
          usage.benefit.actionCode !== "REQUEST" || usage.benefit.valueType !== "NONE") {
        reject("RELATIONSHIP_DELIVERY_TYPE_INVALID", "Cette demande ne correspond pas à un avantage de livraison pris en charge.");
      }

      const fulfillment = await tx.enterpriseFulfillment.findFirst({
        where: { organizationId, reference: fulfillmentReference, status: "COMPLETED", fulfillmentType: "PRODUCT_DELIVERY" },
        include: { salesOrder: { select: { id: true, organizationId: true, businessPartyId: true, currency: true, totalAmount: true, status: true, archivedAt: true, items: { select: { quantityOrdered: true, quantityFulfilled: true } } } } },
      });
      if (!fulfillment || !fulfillment.salesOrder || fulfillment.salesOrder.organizationId !== organizationId) {
        reject("RELATIONSHIP_DELIVERY_PROOF_NOT_FOUND", "Aucune livraison de produits terminée ne correspond à cette référence dans cette entreprise.", 404);
      }
      const order = fulfillment.salesOrder;
      const effectKey = `relationship-delivery:${usage.benefitId}:${fulfillment.id}`;

      if (usage.status === "CONSUMED") {
        if (usage.effectIdempotencyKey === effectKey && usage.effectEntityId === fulfillment.id) return usage;
        reject("RELATIONSHIP_DELIVERY_ALREADY_CONSUMED", "Cet avantage a déjà été utilisé pour une autre livraison.");
      }
      if (usage.revision !== revision || usage.status !== "APPROVED") {
        reject("RELATIONSHIP_DELIVERY_REVISION_CONFLICT", "La demande a changé ou n'est pas approuvée. Actualisez la page.");
      }
      if (usage.userId === actorUserId || fulfillment.fulfilledByUserId === actorUserId) {
        reject("RELATIONSHIP_DELIVERY_INDEPENDENT_REVIEW_REQUIRED", "La livraison doit être attestée par une personne différente du bénéficiaire et du livreur.", 403);
      }
      if (order.status !== "FULFILLED" || order.archivedAt || !order.items.length ||
          order.items.some((item) => Number(item.quantityOrdered) <= 0 || Number(item.quantityFulfilled) < Number(item.quantityOrdered)) ||
          !fulfillment.fulfilledAt ||
          !usage.decidedAt || fulfillment.fulfilledAt < usage.decidedAt) {
        reject("RELATIONSHIP_DELIVERY_NOT_READY", "La commande doit être intégralement livrée après l'approbation de la demande.");
      }
      if (!fulfillment.proofDocumentId) {
        reject("RELATIONSHIP_DELIVERY_DOCUMENT_REQUIRED", "Ajoutez d'abord une preuve documentaire de livraison à la commande.");
      }
      const document = await tx.enterpriseDocument.findFirst({
        where: {
          id: fulfillment.proofDocumentId, organizationId, status: "ACTIVE", visibility: "ORGANIZATION", archivedAt: null,
          sourceEntityType: "EnterpriseSalesOrder", sourceEntityId: order.id,
          currentVersion: { gt: 0 }, versions: { some: { organizationId } },
        },
        select: { id: true },
      });
      if (!document) reject("RELATIONSHIP_DELIVERY_DOCUMENT_INVALID", "La preuve de livraison doit être active, versionnée et liée à cette commande.");
      // A previously returned order must not serve as fresh proof of delivery.
      const returned = await tx.enterpriseRetailOmnichannelReturn.count({
        where: { organizationId, salesOrderId: order.id, status: "COMPLETED" },
      });
      if (returned) reject("RELATIONSHIP_DELIVERY_ALREADY_RETURNED", "Cette commande a déjà fait l'objet d'un retour. Vérifiez le dossier commercial.");

      const link = await tx.enterpriseIdentityLink.findFirst({
        where: { id: usage.identityLinkId, organizationId, userId: usage.userId },
        select: {
          id: true, userId: true, personIdentityId: true, requestedRelationType: true, requestedRoleCode: true,
          status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true,
        },
      });
      if (!link) reject("RELATIONSHIP_DELIVERY_RELATION_MISSING", "La relation du bénéficiaire est introuvable.", 403);
      const party = await tx.enterprisePersonBusinessReference.findFirst({
        where: {
          organizationId, personIdentityId: link.personIdentityId, businessPartyId: order.businessPartyId,
          status: "ACTIVE", archivedAt: null,
        },
        select: { id: true },
      });
      if (!party) reject("RELATIONSHIP_DELIVERY_CUSTOMER_MISMATCH", "La commande n'appartient pas au tiers relié à ce bénéficiaire.", 403);

      const [assignment, usages, sameEffect] = await Promise.all([
        tx.enterpriseRelationshipBenefitAssignment.findFirst({
          where: { organizationId, benefitId: usage.benefitId, identityLinkId: usage.identityLinkId },
          select: { benefitId: true, status: true, startsAt: true, endsAt: true },
        }),
        tx.enterpriseRelationshipBenefitUsage.findMany({
          where: { organizationId, benefitId: usage.benefitId, identityLinkId: usage.identityLinkId, userId: usage.userId, id: { not: usage.id } },
          select: { benefitId: true, status: true, requestedAt: true }, take: 100000,
        }),
        tx.enterpriseRelationshipBenefitUsage.findFirst({
          where: { organizationId, effectIdempotencyKey: effectKey, id: { not: usage.id } },
          select: { id: true },
        }),
      ]);
      if (sameEffect) reject("RELATIONSHIP_DELIVERY_DUPLICATE_PROOF", "Cette preuve de livraison a déjà servi pour le même avantage.");
      const evaluation = evaluateRelationshipBenefitSnapshot({
        benefit: usage.benefit, link, assignment, usages,
        context: {
          moduleCode: "SALES_QUOTES_ORDERS",
          transactionAmount: Number(order.totalAmount),
          currencyCode: order.currency,
          businessPartyId: order.businessPartyId,
          occurredAt: fulfillment.fulfilledAt,
        },
        now: new Date(),
        requireBusinessContext: true,
      });
      if (!evaluation.allowed) reject("RELATIONSHIP_DELIVERY_NOT_ELIGIBLE", evaluation.reason, 403);

      const now = new Date();
      const updated = await tx.enterpriseRelationshipBenefitUsage.updateMany({
        where: { id: usage.id, organizationId, revision, status: "APPROVED", executionMode: "REQUEST", effectEntityId: null },
        data: {
          status: "CONSUMED", consumedAt: now, executedAt: now, revision: { increment: 1 },
          effectModuleCode: "SALES_QUOTES_ORDERS", effectEntityType: "EnterpriseFulfillment",
          effectEntityId: fulfillment.id, effectIdempotencyKey: effectKey,
          effectMetadataJson: {
            salesOrderId: order.id, proofDocumentId: document.id,
            deliveredAt: fulfillment.fulfilledAt.toISOString(),
            attestedByUserId: actorUserId,
          },
        },
      });
      if (updated.count !== 1) reject("RELATIONSHIP_DELIVERY_REVISION_CONFLICT", "La demande vient d'être modifiée. Actualisez-la.");
      changed = true;
      return tx.enterpriseRelationshipBenefitUsage.findFirst({ where: { id: usage.id, organizationId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      reject("RELATIONSHIP_DELIVERY_DUPLICATE_PROOF", "Cette livraison est déjà associée à une consommation d'avantage.");
    }
    throw error;
  }
  if (!result) reject("RELATIONSHIP_DELIVERY_REQUEST_NOT_FOUND", "Demande introuvable après traitement.", 404);
  if (changed) {
    await notifyUser({
      userId: result.userId,
      organizationId,
      type: "ENTERPRISE_RELATIONSHIP",
      title: "Livraison liée à votre avantage confirmée",
      body: "La livraison a été vérifiée et votre avantage est maintenant enregistré comme utilisé.",
      targetUrl: `/enterprise-links?link=${result.identityLinkId}&view=active`,
      idempotencyKey: `relationship-delivery:${result.id}:${result.revision}`,
    });
  }
  return { usage: result, replayed: !changed };
}
