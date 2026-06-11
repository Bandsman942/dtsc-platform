import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReports } from "@/lib/pharmacy-report-access";
import { pharmacyReportExportSchema } from "@/lib/pharmacy-report-validators";
import { getPharmacyReportsDataset, logReportExport, reportTypeToSection, rowsToCsv } from "@/lib/pharmacy-reports";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-report-export:${session.userId}`), 20, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'exports demandés." }, { status: 429 });
  const { organizationId } = await params; const parsed = pharmacyReportExportSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Demande d'export invalide." }, { status: 400 });
  const sensitiveType = ["CASH_PAYMENTS", "PRESCRIPTIONS", "QUALITY_INCIDENTS", "DOCUMENTS_COMPLIANCE"].includes(parsed.data.reportType); const action = sensitiveType ? "export_sensitive" : "export"; if (!(await canAccessPharmacyReports(session.userId, organizationId, action))) return NextResponse.json({ error: "Forbidden", message: "Vous n'avez pas la permission d'exporter ce rapport." }, { status: 403 });
  const financial = await canAccessPharmacyReports(session.userId, organizationId, "view_financial"); const sensitive = await canAccessPharmacyReports(session.userId, organizationId, "view_sensitive"); const dataset = await getPharmacyReportsDataset(organizationId, parsed.data.filters, { financial, sensitive }); const reportSection = dataset.sections[reportTypeToSection(parsed.data.reportType)]; const csv = rowsToCsv(reportSection.rows);
  const record = await logReportExport(organizationId, session.userId, parsed.data.reportType, parsed.data.filters, sensitiveType); await writeAuditLog({ userId: session.userId, action: "PHARMACY_REPORT_EXPORTED", entity: "PharmacyReportExport", entityId: record.id, request, metadata: { organizationId, reportType: parsed.data.reportType, sensitive: sensitiveType } }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rapport-pharmacie-${parsed.data.reportType.toLowerCase()}.csv"`, "Cache-Control": "private, no-store" } });
}
