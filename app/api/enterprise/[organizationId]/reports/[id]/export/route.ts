import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function rowsFromSnapshot(reportType: string, snapshot: unknown) {
  const envelope = snapshot as Record<string, unknown>;
  const data = (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope) as Record<string, unknown>;
  if (reportType === "BUDGET_VS_ACTUAL" && Array.isArray(data.lines)) return { headers: ["budgetReference", "budgetTitle", "line", "category", "departmentId", "currency", "planned", "committed", "actual", "available", "variance", "utilizationPercent", "deepLink"], rows: (data.lines as Array<Record<string, unknown>>).map((item) => [item.budgetReference, item.budgetTitle, item.name, item.category, item.departmentId, item.currency, item.planned, item.committed, item.actual, item.available, item.variance, item.utilizationPercent, item.deepLink]) };
  if (reportType === "EXPENSE_SUMMARY" && Array.isArray(data.byCategory)) return { headers: ["currency", "category", "amount", "count"], rows: (data.byCategory as Array<Record<string, unknown>>).map((item) => [item.currency, item.category, item.amount, item.count]) };
  if (reportType === "PROCUREMENT_SUMMARY" && Array.isArray(data.byStatus)) return { headers: ["currency", "status", "amount", "count"], rows: (data.byStatus as Array<Record<string, unknown>>).map((item) => [item.currency, item.status, item.amount, item.count]) };
  const entries = Object.entries(data).map(([key, value]) => [key, value]);
  return { headers: ["metric", "value"], rows: entries };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }); const report = await prisma.enterpriseReport.findFirst({ where: { AND: [visibility, { id }] } }); if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 }); const table = rowsFromSnapshot(report.reportType, report.snapshotJson); const metadata = [
    ["reportReference", report.reference],
    ["reportTitle", report.title],
    ["reportType", report.reportType],
    ["periodStart", report.periodStart?.toISOString() || ""],
    ["periodEnd", report.periodEnd?.toISOString() || ""],
    ["currency", report.currency || ""],
    ["unitCode", report.unitCode || ""],
    ["sourcePolicyCode", report.sourcePolicyCode || ""],
    ["freshnessAt", report.freshnessAt?.toISOString() || report.generatedAt.toISOString()],
    ["generatedAt", report.generatedAt.toISOString()],
  ];
  const csv = [...metadata.map((row) => row.map(cell).join(",")), "", table.headers.map(cell).join(","), ...table.rows.map((row) => row.map(cell).join(","))].join("\n"); await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_REPORT_EXPORTED", entity: "EnterpriseReport", entityId: id, request: req, reasonCode: "REPORT_EXPORT_CSV", riskLevel: "MEDIUM", metadata: { format: "CSV", reportType: report.reportType, filters: report.filtersJson } }); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id, export: "csv" } }); return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report.reference}.csv"`, "Cache-Control": "private, no-store" } });
}
