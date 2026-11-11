import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailSitesForCapability } from "@/lib/enterprise/retail/site-access";
import { readRetailListDateRange } from "@/lib/enterprise/retail/list-date-range";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  let scope: Awaited<ReturnType<typeof retailSitesForCapability>>;
  try { scope = await retailSitesForCapability(organizationId, auth.session.userId, "VIEW_SALES"); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const { page, pageSize, status, search } = retailListParams(req);
  let from: Date | null;
  let toExclusive: Date | null;
  try {
    const range = await readRetailListDateRange(req, organizationId);
    from = range.from;
    toExclusive = range.toExclusive;
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_RETURN_LIST_FAILED");
  }
  const inclusiveTo = toExclusive ? new Date(toExclusive.getTime() - 1) : null;
  const where = {
    organizationId,
    ...((from || inclusiveTo) ? { createdAt: {
      ...(from ? { gte: from } : {}), ...(inclusiveTo ? { lte: inclusiveTo } : {}),
    } } : {}),
    ...(scope.isolationEnabled ? { sale: { siteId: { in: scope.siteIds } } } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" as const } }, { sale: { number: { contains: search, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: { include: { saleLine: { select: { description: true, quantity: true } } } },
        refunds: true,
        sale: { select: { id: true, number: true, soldAt: true, currencyCode: true } },
      },
    }),
    prisma.enterpriseRetailReturn.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-returns", action: "queue", page, status: status || null } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}
