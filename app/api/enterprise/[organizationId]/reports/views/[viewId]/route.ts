import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { enterpriseReportViewUpdateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; viewId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, viewId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const existing = await prisma.enterpriseReportView.findFirst({ where: { id: viewId, organizationId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.userId !== session.userId && !access.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseReportViewUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Vue invalide." }, { status: 400 });
  if (parsed.data.visibility === "ORGANIZATION" && !access.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (parsed.data.isDefault) await prisma.enterpriseReportView.updateMany({ where: { organizationId, userId: existing.userId, reportType: parsed.data.reportType || existing.reportType, archivedAt: null }, data: { isDefault: false } });
  const view = await prisma.enterpriseReportView.update({ where: { id: viewId }, data: {
    ...(parsed.data.reportType !== undefined ? { reportType: parsed.data.reportType } : {}),
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
    ...(parsed.data.filters !== undefined ? { filtersJson: parsed.data.filters as Prisma.InputJsonValue } : {}),
    ...(parsed.data.dimensions !== undefined ? { dimensionsJson: parsed.data.dimensions as Prisma.InputJsonValue } : {}),
    ...(parsed.data.sort !== undefined ? { sortJson: parsed.data.sort as Prisma.InputJsonValue } : {}),
    ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
    ...(parsed.data.isFavorite !== undefined ? { isFavorite: parsed.data.isFavorite } : {}),
    ...(parsed.data.archived ? { archivedAt: new Date() } : {}),
  } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_REPORT_VIEW_UPDATED", entity: "EnterpriseReportView", entityId: view.id, request: req, reasonCode: parsed.data.archived ? "REPORT_VIEW_ARCHIVED" : "REPORT_VIEW_UPDATED", before: existing, after: view });
  return NextResponse.json({ ok: true, view });
}

export async function DELETE(req: Request, context: Params) {
  return PATCH(new Request(req.url, { method: "PATCH", headers: req.headers, body: JSON.stringify({ archived: true }) }), context);
}
