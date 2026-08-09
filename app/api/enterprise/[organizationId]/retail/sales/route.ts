import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getRetailActiveCustomerIdFromCookieHeader } from "@/lib/enterprise/retail/active-customer";
import { retailCommercialContextSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import { executeCanonicalRetailSale } from "@/lib/enterprise/retail/sale-execution";
import { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, search, from, to } = retailListParams(req);
  const where: Prisma.EnterpriseRetailSaleWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(from || to ? { soldAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: "insensitive" } },
            { lines: { some: { description: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const metricFrom = from || new Date(new Date().setHours(0, 0, 0, 0));
  const metricTo = to || new Date();
  const [items, total, metrics] = await Promise.all([
    prisma.enterpriseRetailSale.findMany({
      where,
      orderBy: { soldAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lines: true, tenders: true, pricingDecisions: true, promotionRedemptions: true, returns: { include: { lines: true, refunds: true } } },
    }),
    prisma.enterpriseRetailSale.count({ where }),
    getRetailMetricsByCurrency(organizationId, metricFrom, metricTo, "RETAIL_POS"),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pos", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metricsByCurrency: metrics.sales });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const originalRaw = await req.json().catch(() => null);
  const rawObject = originalRaw && typeof originalRaw === "object" && !Array.isArray(originalRaw) ? (originalRaw as Record<string, unknown>) : null;
  const explicitCustomerId = typeof rawObject?.customerBusinessPartyId === "string" && rawObject.customerBusinessPartyId.trim() ? rawObject.customerBusinessPartyId.trim() : null;
  const activeCustomerId = getRetailActiveCustomerIdFromCookieHeader(req.headers.get("cookie"), organizationId);
  const raw = rawObject ? { ...rawObject, ...(explicitCustomerId || activeCustomerId ? { customerBusinessPartyId: explicitCustomerId || activeCustomerId } : {}) } : originalRaw;
  const parsed = retailSaleCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ticket invalide." }, { status: 400 });
  const commercialContext = retailCommercialContextSchema.safeParse(raw);
  if (!commercialContext.success) return NextResponse.json({ error: "Invalid commercial context", message: commercialContext.error.issues[0]?.message || "Contexte commercial invalide." }, { status: 400 });
  try {
    const permissions = await getRetailCommercialPermissions(auth.session.userId, organizationId);
    const { result, guarded, accounting, loyalty, promotionCount } = await executeCanonicalRetailSale({
      organizationId,
      actorUserId: auth.session.userId,
      input: parsed.data,
      commercialContext: commercialContext.data,
      permissions,
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_SALE_COMPLETED",
      entity: "EnterpriseRetailSale",
      entityId: result.sale.id,
      request: req,
      metadata: {
        organizationId,
        number: result.sale.number,
        total: result.sale.grandTotal.toFixed(),
        currency: result.sale.currencyCode,
        customerBusinessPartyId: result.sale.customerBusinessPartyId,
        customerContextSource: explicitCustomerId ? "REQUEST" : activeCustomerId ? "ACTIVE_POS_CONTEXT" : "WALK_IN",
        loyaltyEntryIds: loyalty.applied.map((entry) => entry.entryId),
        idempotent: result.idempotent,
        priceOverrideApplied: guarded.overrideApplied,
        overrideReason: guarded.overrideReason,
        pricingDecisionCount: guarded.decisions.length,
        promotionCount,
        saleJournalEntryId: accounting.saleJournalEntryId,
        inventoryValuationCount: accounting.inventoryPostings.length,
        inventoryJournalEntryIds: accounting.inventoryPostings.map((item) => item.journalEntryId),
      },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pos", action: "create", customerAttached: Boolean(result.sale.customerBusinessPartyId), loyaltyApplied: loyalty.applied.length, overrideApplied: guarded.overrideApplied, promotionCount, accountingPosted: true } });
    return NextResponse.json({ ok: true, ...result, accounting, loyalty, commercial: { promotionCount, pricingDecisionCount: guarded.decisions.length, overrideApplied: guarded.overrideApplied } }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SALE_CREATE_FAILED");
  }
}
