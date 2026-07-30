import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function rowsFromSnapshot(reportType: string, snapshot: unknown) {
  const data = snapshot as Record<string, unknown>;
  if (reportType === "BUDGET_VS_ACTUAL" && Array.isArray(data.lines)) return { headers: ["budgetReference", "budgetTitle", "line", "category", "departmentId", "currency", "planned", "committed", "actual", "available", "utilizationPercent"], rows: (data.lines as Array<Record<string, unknown>>).map((item) => [item.budgetReference, item.budgetTitle, item.name, item.category, item.departmentId, item.currency, item.planned, item.committed, item.actual, item.available, item.utilizationPercent]) };
  if (reportType === "EXPENSE_SUMMARY" && Array.isArray(data.byCategory)) return { headers: ["currency", "category", "amount", "count"], rows: (data.byCategory as Array<Record<string, unknown>>).map((item) => [item.currency, item.category, item.amount, item.count]) };
  if (reportType === "PROCUREMENT_SUMMARY" && Array.isArray(data.byStatus)) return { headers: ["currency", "status", "amount", "count"], rows: (data.byStatus as Array<Record<string, unknown>>).map((item) => [item.currency, item.status, item.amount, item.count]) };
  const entries = Object.entries(data).map(([key, value]) => [key, value]);
  return { headers: ["metric", "value"], rows: entries };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }); const report = await prisma.enterpriseReport.findFirst({ where: { AND: [visibility, { id }] } }); if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 }); const table = rowsFromSnapshot(report.reportType, report.snapshotJson); const csv = [table.headers.map(cell).join(","), ...table.rows.map((row) => row.map(cell).join(","))].join("\n"); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id, export: "csv" } }); return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report.reference}.csv"`, "Cache-Control": "private, no-store" } });
}
