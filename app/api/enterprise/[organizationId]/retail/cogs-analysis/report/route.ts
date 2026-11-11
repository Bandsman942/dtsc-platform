import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { addEnterpriseOperationalEvent } from "@/lib/enterprise/procurement/shared";
import { isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { GET as getCogsAnalysis } from "@/app/api/enterprise/[organizationId]/retail/cogs-analysis/route";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const schema = z.object({
  from: z.string().refine(isCivilDate), to: z.string().refine(isCivilDate),
  siteId: z.string().max(191).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  status: z.enum(["TRACEABLE", "UNMATCHED", "AMBIGUOUS"]).optional(),
  search: z.string().trim().max(90).optional(),
}).strict();

/** Immutable Reports snapshot from the same server-side, permission-checked
 * ledger source as the on-screen reconciliation. Never trust client amounts. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const reports = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "submit" });
  if (!reports?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const inventory = await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!inventory.allowed) return NextResponse.json({ error: "Forbidden", message: "L'accès au module Stock est nécessaire pour archiver les preuves dans Rapports." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_COGS_FILTERS_INVALID", req);
  const filters = parsed.data;
  const query = new URLSearchParams({ from: filters.from, to: filters.to, page: "1", pageSize: "100" });
  if (filters.siteId) query.set("siteId", filters.siteId);
  if (filters.currency) query.set("currency", filters.currency);
  if (filters.status) query.set("status", filters.status);
  if (filters.search) query.set("search", filters.search);
  const sourceRequest = new Request(new URL(`/api/enterprise/${organizationId}/retail/cogs-analysis?${query}`, req.url), {
    method: "GET", headers: { cookie: req.headers.get("cookie") || "" },
  });
  const sourceResponse = await getCogsAnalysis(sourceRequest, { params: Promise.resolve({ organizationId }) });
  if (!sourceResponse.ok) return sourceResponse;
  const source = await sourceResponse.json();
  const generatedAt = new Date();
  const report = await prisma.$transaction(async (tx) => {
    const item = await tx.enterpriseReport.create({ data: {
      organizationId, reference: `RPT-${(await resolveEnterpriseBusinessDate(tx, organizationId)).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: "Traçabilité du coût des ventes RETAIL", reportType: "RETAIL_COGS_RECONCILIATION", status: "GENERATED",
      periodStart: new Date(`${filters.from}T00:00:00.000Z`), periodEnd: new Date(`${filters.to}T23:59:59.999Z`),
      currency: filters.currency || null, unitCode: filters.currency ? `CURRENCY:${filters.currency}` : null,
      generatedByUserId: session.userId, generatedAt, freshnessAt: generatedAt,
      sourceModule: "RETAIL_POS", sourcePolicyCode: "RETAIL_COGS_POSTED_GL_V1",
      schemaVersion: 1, calculationVersion: 1,
      metricDefinitionCodesJson: ["COGS_GL_POSTED", "COGS_INVENTORY_LINEAGE", "COGS_UNTRACED", "COGS_FULFILLMENT_COVERAGE"] as Prisma.InputJsonValue,
      filtersJson: filters as Prisma.InputJsonValue,
      snapshotJson: { schema: "retail-cogs/v1", analysis: source, from: filters.from, to: filters.to, detailLimit: 100,
        sourcePolicy: "Posted GL authoritative, evidence-only inventory linkage, all-currency separation" } as Prisma.InputJsonValue,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseReport", entityId: item.id,
      eventType: "ENTERPRISE_REPORT_GENERATED", summary: "Rapport de rapprochement du coût des ventes RETAIL généré.",
      actorUserId: session.userId, toStatus: "GENERATED", metadata: { reportType: "RETAIL_COGS_RECONCILIATION", sourcePolicyCode: "RETAIL_COGS_POSTED_GL_V1" } });
    return item;
  });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_RETAIL_COGS_REPORT_GENERATED",
    entity: "EnterpriseReport", entityId: report.id, request: req, reasonCode: "RETAIL_COGS_REPORT_SNAPSHOT", riskLevel: "MEDIUM",
    metadata: { siteFilter: Boolean(filters.siteId), currency: filters.currency || "ALL_SEPARATE", lineCount: source.totalLines } });
  await writeApiLog({ request: req, startedAt, statusCode: 201, userId: session.userId,
    metadata: { organizationId, domain: "retail-cogs-reports", reportId: report.id } });
  return NextResponse.json({ ok: true, reportId: report.id, reference: report.reference, targetUrl: "/enterprise-modules/REPORTS" }, { status: 201 });
}
