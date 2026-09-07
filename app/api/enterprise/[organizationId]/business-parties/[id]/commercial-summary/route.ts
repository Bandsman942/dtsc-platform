import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId, id } = await params;
  const partyAccess = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode: "CRM_CUSTOMERS",
    action: "read",
  });
  if (!partyAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pipelineAccess = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode: "CRM_PIPELINE",
    action: "read",
  });
  if (!pipelineAccess) {
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, domain: "business-party-commercial-summary", available: false },
    });
    return NextResponse.json({ available: false, canWrite: false, lead: null, opportunities: [] });
  }

  const party = await prisma.enterpriseBusinessParty.findFirst({
    where: { id, organizationId, archivedAt: null },
    select: { id: true, status: true },
  });
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [lead, opportunities] = await Promise.all([
    prisma.enterpriseLead.findFirst({
      where: {
        organizationId,
        businessPartyId: id,
        archivedAt: null,
        status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        expectedValue: true,
        currency: true,
        nextAction: true,
        nextActionAt: true,
        updatedAt: true,
      },
    }),
    prisma.enterpriseOpportunity.findMany({
      where: { organizationId, businessPartyId: id, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        estimatedValue: true,
        currency: true,
        probabilityPercent: true,
        nextAction: true,
        nextActionAt: true,
        expectedCloseDate: true,
      },
    }),
  ]);

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "business-party-commercial-summary", available: true },
  });

  return NextResponse.json({
    available: true,
    canWrite: Boolean(pipelineAccess.canWrite || pipelineAccess.canManage),
    partyActive: party.status === "ACTIVE",
    lead,
    opportunities,
  });
}
