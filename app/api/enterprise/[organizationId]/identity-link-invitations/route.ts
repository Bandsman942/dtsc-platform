import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  identityLinkErrorResponse,
  requireIdentityLinkOrganizationAdmin,
} from "@/lib/enterprise/identity-links/http";
import { enterpriseIdentityInvitationSchema } from "@/lib/enterprise/identity-links/schemas";
import { createEnterpriseIdentityInvitation } from "@/lib/enterprise/identity-links/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const { organizationId } = await params;
    const { session } = await requireIdentityLinkOrganizationAdmin(req, organizationId);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `enterprise-identity-invitation:${organizationId}:${session.userId}`),
      20,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      await writeApiLog({ request: req, statusCode: 429, userId, startedAt });
      return NextResponse.json(
        {
          error: "IDENTITY_LINK_RATE_LIMITED",
          message: "Trop d’invitations ont été demandées. Réessayez plus tard.",
        },
        { status: 429 },
      );
    }
    const parsed = enterpriseIdentityInvitationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
      return NextResponse.json(
        {
          error: "IDENTITY_LINK_INVALID_INVITATION",
          message: parsed.error.issues[0]?.message || "Les informations de l’invitation sont invalides.",
        },
        { status: 400 },
      );
    }
    const result = await createEnterpriseIdentityInvitation({
      organizationId,
      actorUserId: session.userId,
      input: parsed.data,
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_IDENTITY_INVITATION_CREATED",
      entity: "EnterpriseIdentityLink",
      metadata: {
        organizationId,
        relationType: parsed.data.relationType,
        consentTextVersion: parsed.data.consentTextVersion,
      },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 202, userId, startedAt });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const response = identityLinkErrorResponse(error);
    await writeApiLog({ request: req, statusCode: response.status, userId, startedAt });
    return response;
  }
}
