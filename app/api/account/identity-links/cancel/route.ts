import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { requireIdentityLinkSession } from "@/lib/enterprise/identity-links/http";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const cancelSchema = z.object({
  linkId: z.string().trim().min(1).max(191),
  revision: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let userId: string | undefined;
  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `enterprise-identity-user-cancel:${session.userId}`),
      30,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      await writeApiLog({ request: req, statusCode: 429, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_RATE_LIMITED", message: "Trop d’actions ont été envoyées. Réessayez plus tard." },
        { status: 429 },
      );
    }
    const parsed = cancelSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_INVALID_CANCELLATION", message: "La demande à annuler est incomplète ou périmée." },
        { status: 400 },
      );
    }
    const link = await prisma.enterpriseIdentityLink.findFirst({
      where: {
        id: parsed.data.linkId,
        userId: session.userId,
        origin: "USER",
        status: { in: ["REQUEST_PENDING", "ORGANIZATION_APPROVAL_REQUIRED"] },
      },
      select: { id: true, organizationId: true, status: true, revision: true },
    });
    if (!link) {
      return NextResponse.json(
        { error: "IDENTITY_LINK_NOT_CANCELLABLE", message: "Cette demande ne peut plus être annulée." },
        { status: 409 },
      );
    }
    if (link.revision !== parsed.data.revision) {
      return NextResponse.json(
        { error: "IDENTITY_LINK_CONCURRENT_UPDATE", message: "La demande a changé. Actualisez la page avant de réessayer." },
        { status: 409 },
      );
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.enterpriseIdentityLink.updateMany({
        where: { id: link.id, userId: session.userId, status: link.status, revision: link.revision },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: parsed.data.reason || null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("IDENTITY_LINK_CONCURRENT_UPDATE");
      await tx.enterpriseIdentityLinkEvent.create({
        data: {
          organizationId: link.organizationId,
          identityLinkId: link.id,
          eventType: "USER_REQUEST_CANCELLED",
          fromStatus: link.status,
          toStatus: "CANCELLED",
          actorUserId: session.userId,
          reason: parsed.data.reason || null,
        },
      });
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_IDENTITY_USER_CANCEL",
      entity: "EnterpriseIdentityLink",
      entityId: link.id,
      metadata: { organizationId: link.organizationId, reasonProvided: Boolean(parsed.data.reason) },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId, startedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const concurrent = error instanceof Error && error.message === "IDENTITY_LINK_CONCURRENT_UPDATE";
    await writeApiLog({ request: req, statusCode: concurrent ? 409 : 500, userId, startedAt });
    return NextResponse.json(
      concurrent
        ? { error: "IDENTITY_LINK_CONCURRENT_UPDATE", message: "La demande a changé. Actualisez la page." }
        : { error: "IDENTITY_LINK_CANCEL_FAILED", message: "La demande n’a pas pu être annulée." },
      { status: concurrent ? 409 : 500 },
    );
  }
}
