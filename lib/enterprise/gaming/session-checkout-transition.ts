import { Prisma } from "@prisma/client";
import type { gamingSessionTransitionSchema } from "@/lib/enterprise/gaming/schemas";
import { transitionGamingSession } from "@/lib/enterprise/gaming/sessions";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type TransitionInput = z.infer<typeof gamingSessionTransitionSchema>;

export async function transitionGamingSessionWithCheckout(
  organizationId: string,
  sessionId: string,
  actorUserId: string,
  input: TransitionInput,
) {
  const result = await transitionGamingSession(organizationId, sessionId, actorUserId, input);
  if (
    input.action !== "END"
    || result.session.status !== "ENDED"
    || !result.session.finalAmount
    || !result.session.currency
  ) {
    return result;
  }

  const promoted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM "EnterpriseGamingSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`,
    );
    const current = await tx.enterpriseGamingSession.findFirst({
      where: { id: sessionId, organizationId, archivedAt: null },
      select: { id: true, status: true, revision: true, finalAmount: true, currency: true },
    });
    if (!current) return null;
    if (current.status === "TO_CHECKOUT") return current;
    if (current.status !== "ENDED" || !current.finalAmount || !current.currency) return current;

    const updated = await tx.enterpriseGamingSession.update({
      where: { id: current.id },
      data: {
        status: "TO_CHECKOUT",
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
      select: { id: true, status: true, revision: true, finalAmount: true, currency: true },
    });
    await tx.enterpriseGamingSessionTransition.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey: `${input.idempotencyKey}:READY_TO_CHECKOUT`,
        },
      },
      update: {},
      create: {
        organizationId,
        sessionId,
        action: "READY_TO_CHECKOUT",
        idempotencyKey: `${input.idempotencyKey}:READY_TO_CHECKOUT`,
        fromStatus: "ENDED",
        toStatus: "TO_CHECKOUT",
        actorUserId,
        metadataJson: {
          pricingAuthority: "SESSION_FINAL_AMOUNT",
          finalAmount: current.finalAmount.toFixed(2),
          currency: current.currency,
        },
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!promoted) return result;
  return {
    ...result,
    session: {
      ...result.session,
      status: promoted.status,
      revision: promoted.revision,
      finalAmount: promoted.finalAmount,
      currency: promoted.currency,
    },
  };
}
