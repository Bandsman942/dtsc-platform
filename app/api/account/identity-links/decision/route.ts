import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  acceptAccountBoundEnterpriseIdentityInvitation,
  refuseAccountBoundEnterpriseIdentityInvitation,
} from "@/lib/enterprise/identity-links/account-invitation-decision-service";
import {
  identityLinkErrorResponse,
  requireIdentityLinkSession,
} from "@/lib/enterprise/identity-links/http";
import {
  acceptEnterpriseIdentityInvitation,
  refuseEnterpriseIdentityInvitation,
  revokeEnterpriseIdentityLink,
} from "@/lib/enterprise/identity-links/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const decisionSchema = z.object({
  action: z.enum(["ACCEPT", "REFUSE", "REVOKE"]),
  token: z.string().trim().min(32).max(512).optional(),
  linkId: z.string().trim().min(1).max(191).optional(),
  revision: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `enterprise-identity-user-decision:${session.userId}`),
      40,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      await writeApiLog({ request: req, statusCode: 429, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_RATE_LIMITED", message: "Trop d’actions ont été envoyées. Réessayez plus tard." },
        { status: 429 },
      );
    }
    const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_INVALID_DECISION", message: "La décision est incomplète ou invalide." },
        { status: 400 },
      );
    }

    let entityId: string | undefined;
    if (parsed.data.action === "ACCEPT") {
      if (parsed.data.token) {
        const link = await acceptEnterpriseIdentityInvitation({ token: parsed.data.token, userId: session.userId });
        entityId = link?.id;
      } else if (parsed.data.linkId && parsed.data.revision) {
        const link = await acceptAccountBoundEnterpriseIdentityInvitation({
          linkId: parsed.data.linkId,
          userId: session.userId,
          revision: parsed.data.revision,
        });
        entityId = link?.id || parsed.data.linkId;
      } else {
        return NextResponse.json(
          { error: "IDENTITY_LINK_REFERENCE_REQUIRED", message: "Actualisez l’invitation avant de l’accepter." },
          { status: 400 },
        );
      }
    } else if (parsed.data.action === "REFUSE") {
      if (parsed.data.token) {
        await refuseEnterpriseIdentityInvitation({
          token: parsed.data.token,
          userId: session.userId,
          reason: parsed.data.reason,
        });
      } else if (parsed.data.linkId && parsed.data.revision) {
        await refuseAccountBoundEnterpriseIdentityInvitation({
          linkId: parsed.data.linkId,
          userId: session.userId,
          revision: parsed.data.revision,
          reason: parsed.data.reason,
        });
        entityId = parsed.data.linkId;
      } else {
        return NextResponse.json(
          { error: "IDENTITY_LINK_REFERENCE_REQUIRED", message: "Actualisez l’invitation avant de la refuser." },
          { status: 400 },
        );
      }
    } else {
      if (!parsed.data.linkId || !parsed.data.revision) {
        return NextResponse.json(
          { error: "IDENTITY_LINK_REFERENCE_REQUIRED", message: "Actualisez la relation avant de retirer votre autorisation." },
          { status: 400 },
        );
      }
      const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true } });
      await revokeEnterpriseIdentityLink({
        linkId: parsed.data.linkId,
        userId: session.userId,
        revision: parsed.data.revision,
        reason: parsed.data.reason,
        locale: user?.locale,
      });
      entityId = parsed.data.linkId;
    }

    await writeAuditLog({
      userId: session.userId,
      action: `ENTERPRISE_IDENTITY_USER_${parsed.data.action}`,
      entity: "EnterpriseIdentityLink",
      entityId,
      metadata: {
        reasonProvided: Boolean(parsed.data.reason),
        decisionChannel: parsed.data.token ? "PRIVATE_TOKEN" : "ACCOUNT_RELATION_DETAIL",
      },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId, startedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
