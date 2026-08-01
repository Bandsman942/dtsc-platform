import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  identityLinkErrorResponse,
  requireIdentityLinkOrganizationAdmin,
} from "@/lib/enterprise/identity-links/http";
import {
  enterpriseIdentityApprovalSchema,
  enterpriseIdentityDecisionSchema,
} from "@/lib/enterprise/identity-links/schemas";
import {
  approveUserInitiatedIdentityRequest,
  cancelEnterpriseIdentityLink,
  refuseUserInitiatedIdentityRequest,
} from "@/lib/enterprise/identity-links/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string; linkId: string }> };

const actionSchema = z.object({ action: z.enum(["APPROVE", "REFUSE", "CANCEL"]) });

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const { organizationId, linkId } = await params;
    const { session } = await requireIdentityLinkOrganizationAdmin(req, organizationId);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `enterprise-identity-decision:${organizationId}:${session.userId}`),
      60,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      await writeApiLog({ request: req, statusCode: 429, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_RATE_LIMITED", message: "Trop de décisions ont été envoyées. Réessayez plus tard." },
        { status: 429 },
      );
    }
    const payload = await req.json().catch(() => null);
    const action = actionSchema.safeParse(payload);
    if (!action.success) {
      await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
      return NextResponse.json(
        { error: "IDENTITY_LINK_INVALID_ACTION", message: "Sélectionnez une décision valide." },
        { status: 400 },
      );
    }

    if (action.data.action === "APPROVE") {
      const parsed = enterpriseIdentityApprovalSchema.safeParse(payload);
      if (!parsed.success) {
        await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
        return NextResponse.json(
          {
            error: "IDENTITY_LINK_INVALID_APPROVAL",
            message: parsed.error.issues[0]?.message || "Sélectionnez une fiche métier valide.",
          },
          { status: 400 },
        );
      }
      await approveUserInitiatedIdentityRequest({
        organizationId,
        linkId,
        actorUserId: session.userId,
        input: parsed.data,
      });
    } else {
      const parsed = enterpriseIdentityDecisionSchema.safeParse(payload);
      if (!parsed.success) {
        await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
        return NextResponse.json(
          { error: "IDENTITY_LINK_INVALID_DECISION", message: "La décision est incomplète ou invalide." },
          { status: 400 },
        );
      }
      if (action.data.action === "REFUSE") {
        await refuseUserInitiatedIdentityRequest({
          organizationId,
          linkId,
          actorUserId: session.userId,
          revision: parsed.data.revision,
          reason: parsed.data.reason,
        });
      } else {
        await cancelEnterpriseIdentityLink({
          organizationId,
          linkId,
          actorUserId: session.userId,
          revision: parsed.data.revision,
          reason: parsed.data.reason,
        });
      }
    }

    await writeAuditLog({
      userId: session.userId,
      action: `ENTERPRISE_IDENTITY_${action.data.action}`,
      entity: "EnterpriseIdentityLink",
      entityId: linkId,
      metadata: { organizationId },
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
