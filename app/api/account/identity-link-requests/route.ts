import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  ENTERPRISE_IDENTITY_CONSENT_VERSION,
  ENTERPRISE_IDENTITY_RELATION_TYPES,
} from "@/lib/enterprise/identity-links/contracts";
import {
  identityLinkErrorResponse,
  requireIdentityLinkSession,
} from "@/lib/enterprise/identity-links/http";
import { createUserInitiatedIdentityRequest } from "@/lib/enterprise/identity-links/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  organizationCode: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i),
  relationType: z.enum(ENTERPRISE_IDENTITY_RELATION_TYPES),
  roleCode: z.string().trim().max(80).optional(),
  purpose: z.string().trim().min(10).max(500),
  consentTextVersion: z.string().trim().min(1).max(80).default(ENTERPRISE_IDENTITY_CONSENT_VERSION),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `enterprise-identity-request:${session.userId}`),
      10,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      await writeApiLog({ request: req, statusCode: 429, userId, startedAt });
      return NextResponse.json(
        {
          error: "IDENTITY_LINK_RATE_LIMITED",
          message: "Trop de demandes ont été envoyées. Réessayez plus tard.",
        },
        { status: 429 },
      );
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
      return NextResponse.json(
        {
          error: "IDENTITY_LINK_INVALID_REQUEST",
          message: parsed.error.issues[0]?.message || "La demande est incomplète ou invalide.",
        },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.findFirst({
      where: {
        slug: parsed.data.organizationCode.toLowerCase(),
        status: "ACTIVE",
        organizationType: "CLIENT",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!organization) {
      await writeApiLog({ request: req, statusCode: 404, userId, startedAt });
      return NextResponse.json(
        {
          error: "IDENTITY_LINK_ORGANIZATION_NOT_FOUND",
          message: "Aucune entreprise active ne correspond exactement à ce code. Vérifiez le code communiqué par l’entreprise.",
        },
        { status: 404 },
      );
    }

    const link = await createUserInitiatedIdentityRequest({
      organizationId: organization.id,
      userId: session.userId,
      input: {
        relationType: parsed.data.relationType,
        roleCode: parsed.data.roleCode || undefined,
        purpose: parsed.data.purpose,
        consentTextVersion: parsed.data.consentTextVersion,
      },
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_IDENTITY_REQUEST_CREATED",
      entity: "EnterpriseIdentityLink",
      entityId: link.id,
      metadata: {
        organizationId: organization.id,
        relationType: parsed.data.relationType,
      },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId, startedAt });
    return NextResponse.json(
      {
        ok: true,
        linkId: link.id,
        message: "Votre demande a été envoyée. L’entreprise doit la confirmer avant l’activation des services associés.",
      },
      { status: 201 },
    );
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
