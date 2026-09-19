import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const context = await getEnterpriseBusinessContext(prisma, organizationId);
    const businessDate = formatEnterpriseBusinessDate(new Date(), context.timezone);
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, domain: "business-context" },
    });
    return NextResponse.json({ ...context, businessDate });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "ENTERPRISE_BUSINESS_CONTEXT_UNAVAILABLE";
    await writeApiLog({
      request: req,
      statusCode: 409,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, domain: "business-context", error: code },
    });
    return enterpriseDomainErrorResponse(error, "ENTERPRISE_BUSINESS_CONTEXT_UNAVAILABLE", req);
  }
}
