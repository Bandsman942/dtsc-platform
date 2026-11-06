import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prepareRetailInvoice, retailInvoicePrepareSchema } from "@/lib/enterprise/retail/invoice-checkout";
import { requireRetailSiteCapability, retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

// Owner can inspect the whole company; scoped staff see only assigned stores,
// and only after *both* rollout flags have been explicitly enabled.
async function authorizeCheckoutAccess(req: Request, organizationId: string, mutation: boolean) {
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", mutation ? "submit" : "read", { mutation, limit: 60 });
  if (!auth.ok) return auth;
  try {
    const visibility = await retailInvoiceVisibleSites(organizationId, auth.session.userId);
    return { ...auth, visibility };
  } catch (error) {
    return { ok: false as const, response: retailErrorResponse(error, "RETAIL_INVOICE_ACCESS_DENIED") };
  }
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeCheckoutAccess(req, organizationId, false);
  if (!auth.ok) return auth.response;
  const { page, pageSize, status } = retailListParams(req);
  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId") || undefined;
  if (siteId && !auth.visibility.isOwner && !auth.visibility.siteIds.includes(siteId)) {
    return retailErrorResponse(new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403));
  }
  const where: Prisma.EnterpriseRetailInvoiceCheckoutWhereInput = {
    organizationId,
    ...(auth.visibility.isOwner ? (siteId ? { siteId } : {}) : { siteId: siteId || { in: auth.visibility.siteIds } }),
    ...(status ? { invoice: { status } } : {}),
  };
  const [items, total, sites, configuration] = await Promise.all([
    prisma.enterpriseRetailInvoiceCheckout.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { lines: true, invoice: { include: { items: true } }, site: { select: { id: true, name: true, code: true } } },
    }),
    prisma.enterpriseRetailInvoiceCheckout.count({ where }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(auth.visibility.isOwner ? {} : { id: { in: auth.visibility.siteIds } }) },
      take: 100,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, warehouses: { where: { status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } } },
    }),
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", page } });
  const settings = configuration?.settingsJson;
  const checkoutReady = Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && settings.invoiceCheckoutEnabled === true);
  const visibleItems = items.map((entry) => ({
    ...entry,
    canCancel: entry.invoice.status === "DRAFT" && (auth.visibility.isOwner || auth.visibility.cancellableSiteIds.includes(entry.siteId)),
  }));
  return NextResponse.json({ items: visibleItems, sites, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, checkoutReady }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeCheckoutAccess(req, organizationId, true);
  if (!auth.ok) return auth.response;
  const parsed = retailInvoicePrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_PREPARE_INPUT_INVALID", req);
  try {
    if (!auth.visibility.isOwner && !auth.visibility.siteIds.includes(parsed.data.siteId)) {
      throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    await requireRetailSiteCapability(organizationId, auth.session.userId, parsed.data.siteId, "PREPARE_INVOICE", prisma, { requireAssignment: true });
    const result = await prepareRetailInvoice(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_PREPARED", entity: "EnterpriseSalesInvoice", entityId: result.invoice.id,
      request: req, metadata: { organizationId, siteId: result.checkout.siteId, warehouseId: result.checkout.warehouseId, idempotent: result.idempotent, invoiceStatus: result.invoice.status },
    });
    await writeApiLog({ request: req, startedAt, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", action: "prepare", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PREPARE_FAILED");
  }
}
