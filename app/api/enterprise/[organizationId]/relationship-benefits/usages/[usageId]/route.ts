import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { relationshipBenefitUsageDecisionSchema } from "@/lib/enterprise/relationship-benefits/contracts";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";
import { decideRelationshipBenefitUsage } from "@/lib/enterprise/relationship-benefits/service";

type Params = { params: Promise<{ organizationId: string; usageId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, usageId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", {
    mutation: true,
    limit: 160,
  });
  if (!auth.ok) return auth.response;

  const parsed = relationshipBenefitUsageDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "RELATIONSHIP_BENEFIT_USAGE_INPUT_INVALID",
        message: parsed.error.issues[0]?.message || "La décision est invalide.",
      },
      { status: 400 },
    );
  }

  try {
    const usage = await decideRelationshipBenefitUsage({
      organizationId,
      usageId,
      actorUserId: auth.session.userId,
      ...parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RELATIONSHIP_BENEFIT_USAGE_UPDATED",
      entity: "EnterpriseRelationshipBenefitUsage",
      entityId: usageId,
      request: req,
      metadata: { organizationId, status: usage?.status || parsed.data.status },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "usage-decision" },
    });
    return NextResponse.json({ ok: true, usage, message: "Demande mise à jour." });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({
      request: req,
      statusCode: response.status,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "usage-decision-failed" },
    });
    return response;
  }
}
