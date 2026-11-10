import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog, writeApiLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { addEnterpriseOperationalEvent } from "@/lib/enterprise/procurement/shared";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { GET as readRetailSiteOverview } from "@/app/api/enterprise/[organizationId]/retail/site-overview/route";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const schema = z.object({ from: z.iso.datetime(), to: z.iso.datetime(), siteId: z.string().max(191).optional(), currency: z.string().length(3).regex(/^[A-Z]{3}$/).optional() }).strict();
type CurrencySummary = { currencyCode: string; values: Record<string, string> };

/** Generates a durable Reports snapshot from the exact authorized POS read
 * model used by the executive dashboard. The browser never supplies amounts. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const reports = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "submit" });
  if (!reports?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_REPORT_FILTERS_INVALID", req);
  const { from, to, siteId, currency } = parsed.data;
  const query = new URLSearchParams({ from, to, ...(siteId ? { siteId } : {}) });
  const sourceRequest = new Request(new URL(`/api/enterprise/${organizationId}/retail/site-overview?${query}`, req.url), { method: "GET", headers: { cookie: req.headers.get("cookie") || "" } });
  const result = await readRetailSiteOverview(sourceRequest, { params: Promise.resolve({ organizationId }) });
  if (!result.ok) return result;
  const source = await result.json() as {
    summaries: Array<{ siteId: string; currencies: CurrencySummary[] }>;
    corporate: CurrencySummary[];
    unallocatedPostedLedger: Array<{ currencyCode: string; journalLineCount: number }>;
    items: Array<{ id: string; code: string; name: string; stockAlerts: { lowStock: number; expiring: number; expired: number } }>;
    sourceAvailability: Record<string, boolean>;
  };
  const filterCurrencies = (rows: CurrencySummary[]) => rows.filter((row) => !currency || row.currencyCode === currency);
  const summaries = source.summaries.filter((row) => !siteId || row.siteId === siteId).map((row) => ({ site: source.items.find((site) => site.id === row.siteId)?.name || "", currencies: filterCurrencies(row.currencies) }));
  const stockWarnings = source.sourceAvailability.inventory ? source.items.filter((row) => !siteId || row.id === siteId).reduce((sum, row) => ({ lowStock: sum.lowStock + row.stockAlerts.lowStock, expiring: sum.expiring + row.stockAlerts.expiring, expired: sum.expired + row.stockAlerts.expired }), { lowStock: 0, expiring: 0, expired: 0 }) : null;
  const consolidated = siteId ? summaries.flatMap((row) => row.currencies) : filterCurrencies(source.corporate);
  if (!summaries.some((row) => row.currencies.length) && !consolidated.length) return NextResponse.json({ error: "RETAIL_REPORT_NO_DATA", message: "Aucune donnée pour ces filtres. Élargissez la période ou choisissez une autre devise." }, { status: 422 });
  const generatedAt = new Date();
  const report = await prisma.$transaction(async (tx) => {
    const entity = await tx.enterpriseReport.create({ data: {
      organizationId, reference: `RPT-${(await resolveEnterpriseBusinessDate(tx, organizationId)).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: "Pilotage financier RETAIL — Direction", reportType: "RETAIL_EXECUTIVE", status: "GENERATED", periodStart: new Date(from), periodEnd: new Date(to),
      currency: currency || null, unitCode: currency ? `CURRENCY:${currency}` : null,
      generatedByUserId: session.userId, generatedAt, freshnessAt: generatedAt, schemaVersion: 1, calculationVersion: 1,
      sourceModule: "RETAIL_POS", sourcePolicyCode: "RETAIL_CANONICAL_EXECUTIVE_V1", metricDefinitionCodesJson: ["POS_LEGACY", "FINANCE_INVOICE", "FINANCE_ALLOCATED_PAYMENT", "ACCOUNTING_POSTED_PNL", "MM_FEES", "TELCO_MARGIN", "TREASURY_BALANCE", "STOCK_ALERTS"] as Prisma.InputJsonValue,
      filtersJson: { from, to, siteId: siteId || null, currency: currency || null } as Prisma.InputJsonValue,
      snapshotJson: { schema: "retail-executive/v1", consolidated, summaries, stockWarnings, unallocatedPostedLedger: siteId ? [] : source.unallocatedPostedLedger, sourceAvailability: source.sourceAvailability } as unknown as Prisma.InputJsonValue,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseReport", entityId: entity.id, eventType: "ENTERPRISE_REPORT_GENERATED", summary: "Rapport financier RETAIL généré depuis le pilotage des boutiques.", actorUserId: session.userId, toStatus: "GENERATED", metadata: { reportType: "RETAIL_EXECUTIVE", sourcePolicyCode: "RETAIL_CANONICAL_EXECUTIVE_V1" } });
    return entity;
  });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_RETAIL_EXECUTIVE_REPORT_GENERATED", entity: "EnterpriseReport", entityId: report.id, request: req, reasonCode: "RETAIL_CANONICAL_REPORT_SNAPSHOT", riskLevel: "MEDIUM", metadata: { siteFilter: Boolean(siteId), currency: currency || "ALL_NATIVE" } });
  await writeApiLog({ request: req, startedAt, statusCode: 201, userId: session.userId, metadata: { organizationId, domain: "retail-executive-reports", reportId: report.id } });
  return NextResponse.json({ ok: true, reportId: report.id, reference: report.reference, targetUrl: `/enterprise-modules/REPORTS` }, { status: 201 });
}
