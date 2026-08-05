import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { enterpriseReportViewSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const views = await prisma.enterpriseReportView.findMany({
    where: { organizationId, archivedAt: null, OR: [{ userId: session.userId }, { visibility: "ORGANIZATION" }] },
    orderBy: [{ isDefault: "desc" }, { isFavorite: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ views, canShare: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-view:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseReportViewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Vue invalide." }, { status: 400 });
  if (parsed.data.visibility === "ORGANIZATION" && !access.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (parsed.data.isDefault) await prisma.enterpriseReportView.updateMany({ where: { organizationId, userId: session.userId, reportType: parsed.data.reportType, archivedAt: null }, data: { isDefault: false } });
  const view = await prisma.enterpriseReportView.create({ data: {
    organizationId,
    userId: session.userId,
    reportType: parsed.data.reportType,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
    filtersJson: parsed.data.filters as Prisma.InputJsonValue | undefined,
    dimensionsJson: parsed.data.dimensions as Prisma.InputJsonValue | undefined,
    sortJson: parsed.data.sort as Prisma.InputJsonValue | undefined,
    isDefault: parsed.data.isDefault,
    isFavorite: parsed.data.isFavorite,
  } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_REPORT_VIEW_CREATED", entity: "EnterpriseReportView", entityId: view.id, request: req, reasonCode: "REPORT_VIEW_CREATED", metadata: { reportType: view.reportType, visibility: view.visibility } });
  return NextResponse.json({ ok: true, view }, { status: 201 });
}
