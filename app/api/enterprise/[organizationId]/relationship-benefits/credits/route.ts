import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

export async function GET(req: Request, { params }: Params) {
  const { organizationId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage");
  if (!auth.ok) return auth.response;
  const retail = await resolveEnterpriseModuleAccess({
    organizationId, userId: auth.session.userId, moduleCode: "RETAIL_POS", action: "read",
  });
  if (!retail.allowed) return NextResponse.json({ error: "RELATIONSHIP_CREDIT_RETAIL_DENIED", message: "L’accès Retail est requis." }, { status: 403 });
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId, status: "ACTIVE", userId: { not: null },
      activatedAt: { not: null }, userDecisionAt: { not: null }, organizationDecisionAt: { not: null } },
    select: { id: true, personIdentityId: true },
    take: 300,
  });
  const personIds = links.map((link) => link.personIdentityId);
  const [references, customers] = await Promise.all([
    prisma.enterprisePersonBusinessReference.findMany({
      where: { organizationId, personIdentityId: { in: personIds }, status: "ACTIVE", archivedAt: null },
      select: { personIdentityId: true, businessPartyId: true }, take: 600,
    }),
    prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
      select: { id: true, legalName: true, displayName: true }, take: 600,
    }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const linkByPerson = new Map<string, string[]>();
  for (const link of links) {
    linkByPerson.set(link.personIdentityId, [...(linkByPerson.get(link.personIdentityId) || []), link.id]);
  }
  const options = references.flatMap((ref) => {
    const customer = customerById.get(ref.businessPartyId);
    if (!customer || !ref.businessPartyId) return [];
    return (linkByPerson.get(ref.personIdentityId) || []).map((identityLinkId) => ({
      identityLinkId, businessPartyId: customer.id,
      customerName: customer.displayName || customer.legalName,
    }));
  });
  return NextResponse.json({ items: options });
}
