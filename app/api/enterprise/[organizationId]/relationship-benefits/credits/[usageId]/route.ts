import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { manualRelationshipCreditDecisionSchema } from "@/lib/enterprise/relationship-benefits/manual-credit-contracts";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";
import { decideManualRelationshipCredit } from "@/lib/enterprise/relationship-benefits/manual-credit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

type Params = { params: Promise<{ organizationId: string; usageId: string }> };
export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, usageId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const [retail, finance] = await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId: auth.session.userId, moduleCode: "RETAIL_POS", action: "manage" }),
    resolveEnterpriseModuleAccess({ organizationId, userId: auth.session.userId, moduleCode: "FINANCE_ACCOUNTING", action: "approve" }),
  ]);
  if (!retail.allowed || !finance.allowed) {
    return NextResponse.json({ error: "RELATIONSHIP_CREDIT_APPROVAL_DENIED", message: "La validation nécessite un responsable Finance indépendant et autorisé." }, { status: 403 });
  }
  const parsed = manualRelationshipCreditDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({
    error: "RELATIONSHIP_CREDIT_DECISION_INVALID",
    message: parsed.error.issues[0]?.message || "La décision est invalide.",
  }, { status: 400 });
  try {
    const usage = await decideManualRelationshipCredit({
      organizationId, usageId, actorUserId: auth.session.userId, ...parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId, action: "ENTERPRISE_RELATIONSHIP_CREDIT_DECIDED",
      entity: "EnterpriseRelationshipBenefitUsage", entityId: usage.id, request: req,
      metadata: { organizationId, decision: parsed.data.decision, status: usage.status },
    });
    await writeApiLog({ request: req, userId: auth.session.userId, statusCode: 200, startedAt, metadata: { organizationId, domain: "relationship-credit", action: "decide" } });
    return NextResponse.json({ ok: true, usage, message: "Décision enregistrée et écritures vérifiées." });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({ request: req, userId: auth.session.userId, statusCode: response.status, startedAt, metadata: { organizationId, domain: "relationship-credit", action: "decide-failed" } });
    return response;
  }
}
