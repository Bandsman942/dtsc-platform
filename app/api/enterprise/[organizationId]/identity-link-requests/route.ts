import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  identityLinkErrorResponse,
  requireIdentityLinkSession,
} from "@/lib/enterprise/identity-links/http";
import { enterpriseIdentityUserRequestSchema } from "@/lib/enterprise/identity-links/schemas";
import { createUserInitiatedIdentityRequest } from "@/lib/enterprise/identity-links/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const { organizationId } = await params;
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
    const parsed = enterpriseIdentityUserRequestSchema.safeParse(await req.json().catch(() => null));
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
    const link = await createUserInitiatedIdentityRequest({
      organizationId,
      userId: session.userId,
      input: parsed.data,
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_IDENTITY_REQUEST_CREATED",
      entity: "EnterpriseIdentityLink",
      entityId: link.id,
      metadata: {
        organizationId,
        relationType: parsed.data.relationType,
        consentTextVersion: parsed.data.consentTextVersion,
      },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId, startedAt });
    return NextResponse.json({ ok: true, linkId: link.id }, { status: 201 });
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
