import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReports } from "@/lib/pharmacy-report-access";
import { pharmacyReportActionSchema } from "@/lib/pharmacy-report-validators";
import { archiveSavedReportView, createPharmacyReportSnapshot, getPharmacyReportsDataset, reportTypeToSection } from "@/lib/pharmacy-reports";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-report-action:${session.userId}`), 60, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, entity, id } = await params; if (!(await canAccessPharmacyReports(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const parsed = pharmacyReportActionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action de rapport invalide." }, { status: 400 });
  if (parsed.data.action === "archive-view") {
    if (!(await canAccessPharmacyReports(session.userId, organizationId, "manage_views"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); await archiveSavedReportView(organizationId, id, session.userId);
  } else if (parsed.data.action === "create-snapshot") {
    if (!(await canAccessPharmacyReports(session.userId, organizationId, "create_snapshot"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const reportType = parsed.data.reportType; if (!reportType || !parsed.data.snapshotName) return NextResponse.json({ error: "Invalid payload", message: "Le nom et le type du snapshot sont obligatoires." }, { status: 400 });
    const financial = await canAccessPharmacyReports(session.userId, organizationId, "view_financial"); const sensitive = await canAccessPharmacyReports(session.userId, organizationId, "view_sensitive"); const filters = parsed.data.filters || {}; const dataset = await getPharmacyReportsDataset(organizationId, filters, { financial, sensitive }); const reportSection = dataset.sections[reportTypeToSection(reportType)];
    await createPharmacyReportSnapshot(organizationId, session.userId, reportType, parsed.data.snapshotName, filters, reportSection, parsed.data.notes);
  } else {
    const view = await prisma.pharmacySavedReportView.findFirst({ where: { id, organizationId, status: "ACTIVE" } }); if (!view) return NextResponse.json({ error: "Not found", message: "Vue sauvegardée introuvable." }, { status: 404 });
  }
  await writeAuditLog({ userId: session.userId, action: `PHARMACY_REPORT_${parsed.data.action.toUpperCase().replaceAll("-", "_")}`, entity, entityId: id, request, metadata: { organizationId } }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true });
}
