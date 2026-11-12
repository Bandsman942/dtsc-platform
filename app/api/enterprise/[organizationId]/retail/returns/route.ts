import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailSitesForCapability } from "@/lib/enterprise/retail/site-access";
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
  const queryParams = new URL(req.url).searchParams;
  const from = queryParams.get("from") || "", to = queryParams.get("to") || "";
  if ([from, to].some((v) => v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + "T00:00:00.000Z")))) || (from && to && from > to)) {
    return NextResponse.json({ error: "RETAIL_DATE_RANGE_INVALID", message: "Vérifiez la période des retours." }, { status: 400 });
  }
  const where = {
    ...(from || to ? { createdAt: {
      ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
      ...(to ? { lt: new Date(Date.parse(to + "T00:00:00.000Z") + 86_400_000) } : {}),
    } } : {}),
    organizationId,
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
