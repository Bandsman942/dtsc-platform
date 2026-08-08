import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { finalizeRetailSaleAccounting } from "@/lib/enterprise/retail/accounting";
import { getRetailMetricsByCurrency, prepareCommercialRetailSale } from "@/lib/enterprise/retail/commercial-guardrails";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailSale } from "@/lib/enterprise/retail/service";
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
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { lines: { some: { description: { contains: search, mode: "insensitive" } } } }] } : {}),
  };
  const metricFrom = from || new Date(new Date().setHours(0, 0, 0, 0));
  const metricTo = to || new Date();
  const [items, total, metrics] = await Promise.all([
    prisma.enterpriseRetailSale.findMany({ where, orderBy: { soldAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { lines: true, tenders: true } }),
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
  const raw = await req.json().catch(() => null);
  const parsed = retailSaleCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ticket invalide." }, { status: 400 });
  const overrideReason = raw && typeof raw === "object" && "overrideReason" in raw && typeof (raw as { overrideReason?: unknown }).overrideReason === "string" ? (raw as { overrideReason: string }).overrideReason : null;
  try {
    const guarded = await prepareCommercialRetailSale(organizationId, parsed.data, { allowOverride: Boolean(auth.access.canAdminister), overrideReason });
    const result = await createRetailSale(organizationId, auth.session.userId, guarded.input);
    const accounting = await finalizeRetailSaleAccounting(organizationId, auth.session.userId, result.sale.id);
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
        idempotent: result.idempotent,
        priceOverrideApplied: guarded.overrideApplied,
        overrideReason: guarded.overrideReason,
        overrideCount: guarded.overrides.length,
        saleJournalEntryId: accounting.saleJournalEntryId,
        inventoryValuationCount: accounting.inventoryPostings.length,
        inventoryJournalEntryIds: accounting.inventoryPostings.map((item) => item.journalEntryId),
      },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pos", action: "create", overrideApplied: guarded.overrideApplied, accountingPosted: true } });
    return NextResponse.json({ ok: true, ...result, accounting }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SALE_CREATE_FAILED");
  }
}