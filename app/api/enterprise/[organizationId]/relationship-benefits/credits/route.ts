import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  manualRelationshipCreditRequestSchema,
} from "@/lib/enterprise/relationship-benefits/manual-credit-contracts";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { createManualRelationshipCreditRequest } from "@/lib/enterprise/relationship-benefits/manual-credit";

type Params = { params: Promise<{ organizationId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const [retail, finance, documents] = await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId: auth.session.userId, moduleCode: "RETAIL_POS", action: "manage" }),
    resolveEnterpriseModuleAccess({ organizationId, userId: auth.session.userId, moduleCode: "FINANCE_ACCOUNTING", action: "read" }),
    resolveEnterpriseModuleAccess({ organizationId, userId: auth.session.userId, moduleCode: "DOCUMENTS", action: "read" }),
  ]);
  if (!retail.allowed || !finance.allowed || !documents.allowed) {
    return NextResponse.json({ error: "RELATIONSHIP_CREDIT_PERMISSION_DENIED", message: "Vous devez disposer des autorisations Retail, Documents et Finance nécessaires." }, { status: 403 });
  }
  const parsed = manualRelationshipCreditRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({
    error: "RELATIONSHIP_CREDIT_INPUT_INVALID",
    message: parsed.error.issues[0]?.message || "Complétez les informations de la demande.",
  }, { status: 400 });
  try {
    const usage = await createManualRelationshipCreditRequest({
      organizationId, actorUserId: auth.session.userId, ...parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId, action: "ENTERPRISE_RELATIONSHIP_CREDIT_REQUESTED",
      entity: "EnterpriseRelationshipBenefitUsage", entityId: usage.id, request: req,
      metadata: { organizationId, benefitId: usage.benefitId, status: usage.status },
    });
    await writeApiLog({ request: req, userId: auth.session.userId, statusCode: 201, startedAt, metadata: { organizationId, domain: "relationship-credit", action: "request" } });
    return NextResponse.json({ ok: true, usage, message: "Demande de crédit enregistrée. Une validation indépendante est nécessaire." }, { status: 201 });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({ request: req, userId: auth.session.userId, statusCode: response.status, startedAt, metadata: { organizationId, domain: "relationship-credit", action: "request-failed" } });
    return response;
  }
}
