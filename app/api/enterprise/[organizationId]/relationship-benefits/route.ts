import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { relationshipBenefitCreateSchema } from "@/lib/enterprise/relationship-benefits/contracts";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";
import {
  createRelationshipBenefit,
  listAssignableRelationshipLinks,
  listRelationshipBenefitsForAdmin,
} from "@/lib/enterprise/relationship-benefits/service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "read");
  if (!auth.ok) return auth.response;

  const [dataset, links] = await Promise.all([
    listRelationshipBenefitsForAdmin(organizationId),
    listAssignableRelationshipLinks(organizationId),
  ]);
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: {
      organizationId,
      domain: "relationship-benefits",
      action: "list",
      benefitCount: dataset.benefits.length,
    },
  });
  return NextResponse.json({ ...dataset, links });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", {
    mutation: true,
    limit: 80,
  });
  if (!auth.ok) return auth.response;

  const parsed = relationshipBenefitCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({
      request: req,
      statusCode: 400,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "create-invalid" },
    });
    return NextResponse.json(
      {
        error: "RELATIONSHIP_BENEFIT_INPUT_INVALID",
        message: parsed.error.issues[0]?.message || "Le formulaire d’avantage est incomplet.",
      },
      { status: 400 },
    );
  }

  try {
    const benefit = await createRelationshipBenefit({
      organizationId,
      actorUserId: auth.session.userId,
      input: parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RELATIONSHIP_BENEFIT_CREATED",
      entity: "EnterpriseRelationshipBenefit",
      entityId: benefit.id,
      request: req,
      metadata: {
        organizationId,
        code: benefit.code,
        status: benefit.status,
        assignmentMode: benefit.assignmentMode,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 201,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "create" },
    });
    return NextResponse.json({ ok: true, benefit, message: "Avantage enregistré." }, { status: 201 });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({
      request: req,
      statusCode: response.status,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits", action: "create-failed" },
    });
    return response;
  }
}
