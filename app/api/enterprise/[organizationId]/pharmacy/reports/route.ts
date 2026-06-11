import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReports } from "@/lib/pharmacy-report-access";
import { pharmacyReportFiltersSchema, pharmacySavedReportSchema } from "@/lib/pharmacy-report-validators";
import { createSavedReportView, getPharmacyReportsDataset } from "@/lib/pharmacy-reports";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; if (!(await canAccessPharmacyReports(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url); const parsed = pharmacyReportFiltersSchema.safeParse(Object.fromEntries(url.searchParams)); if (!parsed.success) return NextResponse.json({ error: "Invalid filters", message: "Les filtres du rapport sont invalides." }, { status: 400 });
  const financial = await canAccessPharmacyReports(session.userId, organizationId, "view_financial"); const sensitive = await canAccessPharmacyReports(session.userId, organizationId, "view_sensitive");
  const dataset = await getPharmacyReportsDataset(organizationId, parsed.data, { financial, sensitive }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json(dataset);
}
export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-report-view:${session.userId}`), 60, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params; if (!(await canAccessPharmacyReports(session.userId, organizationId, "manage_views"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacySavedReportSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Vue de rapport invalide." }, { status: 400 });
  const view = await createSavedReportView(organizationId, session.userId, parsed.data); await writeAuditLog({ userId: session.userId, action: "PHARMACY_REPORT_VIEW_CREATED", entity: "PharmacySavedReportView", entityId: view.id, request, metadata: { organizationId, reportType: view.reportType } }); await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, view }, { status: 201 });
}
