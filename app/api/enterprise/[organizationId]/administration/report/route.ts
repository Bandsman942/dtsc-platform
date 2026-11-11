import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { getEnterpriseAdministrationDataset } from "@/lib/enterprise/enterprise-admin-loader";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { addEnterpriseOperationalEvent } from "@/lib/enterprise/procurement/shared";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const [adminAllowed, reportAccess] = await Promise.all([
    requireEnterpriseGovernanceAccess(session.userId, organizationId),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "REPORTS", action: "submit" }),
  ]);
  if (!adminAllowed || !reportAccess.allowed) return NextResponse.json({ error: "FORBIDDEN", message: "Les droits Administration et Rapports (création) sont nécessaires." }, { status: 403 });
  const limit = await rateLimit(getRateLimitKey(req, `enterprise-admin-report:${session.userId}`), 6, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de rapports administratifs générés récemment." }, { status: 429 });
  const dataset = await getEnterpriseAdministrationDataset(organizationId, session.userId, "fr");
  if (!dataset) return NextResponse.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
  const generatedAt = new Date();
  const rows = Object.entries(dataset.dashboard).map(([code, value]) => ({ code, value }));
  const report = await prisma.$transaction(async (tx) => {
    const entity = await tx.enterpriseReport.create({ data: {
      organizationId,
      reference: `RPT-${(await resolveEnterpriseBusinessDate(tx, organizationId)).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: `Administration entreprise — ${dataset.organization.name}`,
      reportType: "ENTERPRISE_ADMIN_OVERVIEW", status: "GENERATED",
      generatedByUserId: session.userId, generatedAt, freshnessAt: generatedAt,
      schemaVersion: 1, calculationVersion: 1, sourceModule: "ENTERPRISE_ADMINISTRATION",
      sourcePolicyCode: "ENTERPRISE_ADMIN_DASHBOARD_V1",
      metricDefinitionCodesJson: rows.map((row) => row.code) as Prisma.InputJsonValue,
      filtersJson: { scope: "ORGANIZATION", at: generatedAt.toISOString() } as Prisma.InputJsonValue,
      snapshotJson: {
        schema: "enterprise-admin-overview/v1", rows,
        context: { organizationName: dataset.organization.name, sectorCode: dataset.organization.sectorCode, plan: dataset.entitlements.planLabel, subscriptionStatus: dataset.entitlements.subscriptionStatus },
        alerts: dataset.configurationIssues.map((issue) => ({ code: issue.code, severity: issue.severity, moduleCode: issue.moduleCode || null })),
      } as Prisma.InputJsonValue,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseReport", entityId: entity.id, eventType: "ENTERPRISE_REPORT_GENERATED", summary: "Rapport Administration entreprise généré depuis les métriques canoniques.", actorUserId: session.userId, toStatus: "GENERATED", metadata: { reportType: "ENTERPRISE_ADMIN_OVERVIEW", sourcePolicyCode: "ENTERPRISE_ADMIN_DASHBOARD_V1" } });
    return entity;
  });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_ADMIN_REPORT_GENERATED", entity: "EnterpriseReport", entityId: report.id, request: req, reasonCode: "ENTERPRISE_ADMIN_CANONICAL_SNAPSHOT", riskLevel: "MEDIUM" });
  await writeApiLog({ request: req, startedAt, statusCode: 201, userId: session.userId, metadata: { organizationId, reportId: report.id, domain: "enterprise-admin-report" } });
  return NextResponse.json({ ok: true, reportId: report.id, reference: report.reference, targetUrl: "/enterprise-modules/REPORTS" }, { status: 201 });
}
