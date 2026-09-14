import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const report = await prisma.enterpriseReport.findFirst({ where: { AND: [visibility, { id }] } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filters = asObject(report.filtersJson);
  const departmentId = stringValue(filters.departmentId);
  const supplierId = stringValue(filters.supplierId);
  const budgetId = stringValue(filters.budgetId);
  const [links, events, generator, department, supplier, budget] = await Promise.all([
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseReport", sourceEntityId: id }, { targetEntityType: "EnterpriseReport", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseReport", entityId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.user.findUnique({ where: { id: report.generatedByUserId }, select: { name: true } }),
    departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: departmentId, organizationId }, select: { id: true, labelFr: true, labelEn: true } }) : Promise.resolve(null),
    supplierId ? prisma.enterpriseSupplier.findFirst({ where: { id: supplierId, organizationId }, select: { id: true, legalName: true, displayName: true } }) : Promise.resolve(null),
    budgetId ? prisma.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId }, select: { id: true, reference: true, title: true } }) : Promise.resolve(null),
  ]);

  const { sourcePolicyCode: _sourcePolicyCode, metricDefinitionCodesJson: _metricDefinitionCodesJson, generationKey: _generationKey, ...clientReport } = report;
  const filterReferences = {
    department: department ? { id: department.id, labelFr: department.labelFr, labelEn: department.labelEn } : null,
    supplier: supplier ? { id: supplier.id, label: supplier.displayName || supplier.legalName } : null,
    budget: budget ? { id: budget.id, label: `${budget.reference} · ${budget.title}` } : null,
  };
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id } });
  return NextResponse.json({
    report: clientReport,
    generatedByLabel: generator?.name || null,
    filterReferences,
    links,
    events,
    canManage: access.canManage,
  });
}
