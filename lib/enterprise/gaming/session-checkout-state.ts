import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function promoteEndedGamingSessionToCheckout(
  organizationId: string,
  sessionId: string,
  actorUserId: string,
  sourceIdempotencyKey: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseGamingSession.findFirst({
      where: { id: sessionId, organizationId, archivedAt: null },
      select: {
        id: true,
        status: true,
        revision: true,
        finalAmount: true,
        currency: true,
        serviceCatalogItemId: true,
      },
    });
    if (!session) return { promoted: false, status: null, revision: null };
    if (["TO_CHECKOUT", "PAID"].includes(session.status)) {
      return { promoted: false, status: session.status, revision: session.revision };
    }
    if (
      session.status !== "ENDED"
      || !session.finalAmount?.isPositive()
      || !session.currency
      || !session.serviceCatalogItemId
    ) {
      return { promoted: false, status: session.status, revision: session.revision };
    }
    const transitionKey = `${sourceIdempotencyKey}:to-checkout`;
    const updated = await tx.enterpriseGamingSession.updateMany({
      where: { id: session.id, organizationId, status: "ENDED", revision: session.revision, archivedAt: null },
      data: { status: "TO_CHECKOUT", updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) {
      const current = await tx.enterpriseGamingSession.findFirst({ where: { id: session.id, organizationId }, select: { status: true, revision: true } });
      return { promoted: false, status: current?.status || null, revision: current?.revision || null };
    }
    await tx.enterpriseGamingSessionTransition.upsert({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: transitionKey } },
      update: {},
      create: {
        organizationId,
        sessionId: session.id,
        action: "READY_TO_CHECKOUT",
        idempotencyKey: transitionKey,
        fromStatus: "ENDED",
        toStatus: "TO_CHECKOUT",
        actorUserId,
        metadataJson: { authority: "SERVER_PRICING_FINAL", finalAmount: session.finalAmount.toFixed(2), currency: session.currency },
      },
    });
    return { promoted: true, status: "TO_CHECKOUT", revision: session.revision + 1 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
