import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const parties = await prisma.enterpriseBusinessParty.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      roles: {
        some: {
          roleCode: { in: ["PROSPECT", "CUSTOMER"] },
          status: "ACTIVE",
          archivedAt: null,
        },
      },
      ...(search ? {
        OR: [
          { legalName: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { primaryEmail: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [{ legalName: "asc" }],
    take: 200,
    select: {
      id: true,
      code: true,
      partyType: true,
      legalName: true,
      displayName: true,
      primaryEmail: true,
      primaryPhone: true,
    },
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "crm-party-options", count: parties.length },
  });
  return NextResponse.json({ items: parties });
}
