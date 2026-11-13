import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { getEnterpriseGamingBookingAccess, getEnterpriseGamingReportAccess, getEnterpriseGamingSessionAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { GAMING_REPORT_TYPES, gamingReportGenerateSchema } from "@/lib/enterprise/gaming/report-schemas";
import { generateGamingReport } from "@/lib/enterprise/gaming/reports";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, reportAccess] = await Promise.all([
    getEnterpriseGamingReportAccess({ session, organizationId, action: "read" }),
    getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" }),
  ]);
  if (!gamingAccess || !reportAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const type = url.searchParams.get("type")?.trim() || "";
  const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: reportAccess.canSeeAll });
  const where: Prisma.EnterpriseReportWhereInput = {
    AND: [visibility, { sourceModule: "GAMING_REPORTS", ...(type ? { reportType: type } : { reportType: { in: [...GAMING_REPORT_TYPES] } }) }],
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseReport.findMany({ where, orderBy: { generatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, reference: true, title: true, description: true, reportType: true, status: true, periodStart: true, periodEnd: true, currency: true, freshnessAt: true, generatedAt: true, generatedByUserId: true } }),
    prisma.enterpriseReport.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-reports", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canCreate: gamingAccess.canCreate && reportAccess.canCreate, canManage: gamingAccess.canManage && reportAccess.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-report-generate:${session.userId}`), 30, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingReportGenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId } = await params;
  const [gamingAccess, reportAccess, stationsAccess, sessionsAccess, bookingsAccess, assetsAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingReportAccess({ session, organizationId, action: "submit" }),
    getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "submit" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingBookingAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
  ]);
  if (!gamingAccess || !reportAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (["GAMING_STATION_UTILIZATION", "GAMING_OFF_PEAK"].includes(parsed.data.reportType) && (!stationsAccess || !sessionsAccess)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parsed.data.reportType === "GAMING_BOOKINGS_NO_SHOW" && !bookingsAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parsed.data.reportType === "GAMING_INCIDENTS_MAINTENANCE" && !assetsAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parsed.data.reportType === "GAMING_REVENUE" && !financeAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await generateGamingReport({ organizationId, userId: session.userId, ...parsed.data });
  await Promise.allSettled([
    writeAuditLog({ userId: session.userId, organizationId, action: result.idempotent ? "ENTERPRISE_GAMING_REPORT_REPLAYED" : "ENTERPRISE_GAMING_REPORT_GENERATED", entity: "EnterpriseReport", entityId: result.report.id, request: req, reasonCode: "GAMING_REPORT_GENERATION", riskLevel: "MEDIUM", metadata: { reportType: parsed.data.reportType, periodDays: parsed.data.periodDays, idempotent: result.idempotent } }),
    writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-reports", reportType: parsed.data.reportType } }),
  ]);
  return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
}
