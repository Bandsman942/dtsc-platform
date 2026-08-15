import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";
import { buildEnterpriseProfessionalReport } from "@/lib/reporting/enterprise-professional-report";

type Params = { params: Promise<{ organizationId: string; id: string }> };

const REPORT_TYPE_LABELS: Record<string, string> = {
  BUDGET_VS_ACTUAL: "Budget comparé au réalisé",
  EXPENSE_SUMMARY: "Synthèse des dépenses",
  PROCUREMENT_SUMMARY: "Synthèse des achats",
  FINANCE_OVERVIEW: "Vue d’ensemble financière",
};

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const [report, organization] = await Promise.all([
    prisma.enterpriseReport.findFirst({ where: { AND: [visibility, { id }] } }),
    prisma.organization.findFirst({ where: { id: organizationId }, select: { name: true } }),
  ]);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const model = buildEnterpriseProfessionalReport({
    locale: "fr",
    organizationName: organization?.name || "DTSC Platform",
    reference: report.reference,
    title: report.title,
    reportType: report.reportType,
    reportTypeLabel: REPORT_TYPE_LABELS[report.reportType] || "Rapport d’entreprise",
    generatedAt: report.generatedAt.toISOString(),
    periodStart: report.periodStart?.toISOString() || null,
    periodEnd: report.periodEnd?.toISOString() || null,
    currency: report.currency,
    snapshot: report.snapshotJson,
    filters: report.filtersJson,
  });
  const freshness = (report.freshnessAt || report.generatedAt).toLocaleString("fr-FR");

  const metadata: Array<[string, string]> = [
    ["Organisation", model.organizationName || "DTSC Platform"],
    ["Rapport", model.title],
    ["Type", REPORT_TYPE_LABELS[report.reportType] || "Rapport d’entreprise"],
    ["Référence", report.reference],
    ["Période", model.subtitle || ""],
    ["Fraîcheur des données", freshness],
    ["Généré", model.generatedLabel || ""],
    ...(model.filters || []).map((item): [string, string] => [item.label, item.value]),
  ];
  const csv = [
    ...metadata.map((row) => row.map(cell).join(",")),
    "",
    model.columns.map((column) => cell(column.label)).join(","),
    ...model.rows.map((row) => model.columns.map((column) => cell(row[column.key])).join(",")),
  ].join("\r\n");

  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_REPORT_EXPORTED",
    entity: "EnterpriseReport",
    entityId: id,
    request: req,
    reasonCode: "REPORT_EXPORT_CSV",
    riskLevel: "MEDIUM",
    metadata: { format: "CSV", reportType: report.reportType, filters: report.filtersJson },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id, export: "csv" } });
  return new NextResponse(`\ufeff${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.reference}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
