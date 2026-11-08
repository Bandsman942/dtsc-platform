import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { enterpriseBusinessCalendarWindows, formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type SummaryRow = { siteId: string | null; status: string; closeCount: bigint; varianceCount: bigint };

/** Aggregate existing close and line records. This route never writes financial state. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "read");
  if (!auth.ok) return auth.response;
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null, role: { in: [...RETAIL_OWNER_ROLES] } },
    select: { id: true },
  });
  if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const timezone = organization.timezone || "UTC";
  const date = new URL(req.url).searchParams.get("date") || formatEnterpriseBusinessDate(new Date(), timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ message: "Invalid business date" }, { status: 400 });
  // The selected calendar date must be interpreted in the company's timezone.
  // Midnight offsets can differ across DST changes; never assume a 24-hour UTC day.
  const anchor = [`${date}T00:00:00.000Z`, `${date}T12:00:00.000Z`]
    .map((value) => new Date(value))
    .find((value) => !Number.isNaN(value.getTime()) && formatEnterpriseBusinessDate(value, timezone) === date);
  if (!anchor) return NextResponse.json({ message: "Invalid business date" }, { status: 400 });
  const { day } = enterpriseBusinessCalendarWindows(anchor, timezone);

  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT c."siteId" AS "siteId", c."status" AS "status",
           COUNT(DISTINCT c."id")::bigint AS "closeCount",
           COUNT(l."id") FILTER (WHERE ABS(l."differenceAmount") > 0.005)::bigint AS "varianceCount"
    FROM "EnterpriseRetailDailyClose" c
    LEFT JOIN "EnterpriseRetailDailyCloseLine" l
      ON l."organizationId" = c."organizationId" AND l."dailyCloseId" = c."id"
    WHERE c."organizationId" = ${organizationId}
      AND c."businessDate" >= ${day.gte} AND c."businessDate" < ${day.lt}
    GROUP BY c."siteId", c."status"
  `;
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-multistore-close-summary", date } });
  return NextResponse.json({
    date,
    rows: rows.map((row) => ({ siteId: row.siteId, status: row.status, closeCount: Number(row.closeCount), varianceCount: Number(row.varianceCount) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
