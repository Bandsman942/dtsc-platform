import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { relationshipBenefitPatchSchema } from "@/lib/enterprise/relationship-benefits/contracts";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";
import { updateRelationshipBenefit } from "@/lib/enterprise/relationship-benefits/service";

type Params = { params: Promise<{ organizationId: string; benefitId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, benefitId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", {
    mutation: true,
    limit: 120,
  });
  if (!auth.ok) return auth.response;

  const parsed = relationshipBenefitPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "RELATIONSHIP_BENEFIT_INPUT_INVALID",
        message: parsed.error.issues[0]?.message || "La modification est invalide.",
      },
      { status: 400 },
    );
  }

  try {
    const benefit = await updateRelationshipBenefit({
      organizationId,
      benefitId,
      actorUserId: auth.session.userId,
      input: parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RELATIONSHIP_BENEFIT_UPDATED",
      entity: "EnterpriseRelationshipBenefit",
      entityId: benefitId,
      request: req,
      metadata: { organizationId, status: benefit?.status || null },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "update" },
    });
    return NextResponse.json({ ok: true, benefit, message: "Avantage mis à jour." });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({
      request: req,
      statusCode: response.status,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "update-failed" },
    });
    return response;
  }
}
