import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { prepareRetailInvoice, retailInvoicePrepareSchema } from "@/lib/enterprise/retail/invoice-checkout";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

// This entrypoint is intentionally owner-only *and* feature-gated. Invoicer
// and cashier access will be enabled only after the matching Finance payment
// allocation, stock-consumption and per-site list filters are complete.
async function authorizeCheckoutOwner(req: Request, organizationId: string, mutation: boolean) {
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", mutation ? "submit" : "read", { mutation, limit: 60 });
  if (!auth.ok) return auth;
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null, role: { in: [...RETAIL_OWNER_ROLES] } },
    select: { id: true },
  });
  if (!membership) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return auth;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeCheckoutOwner(req, organizationId, false);
  if (!auth.ok) return auth.response;
  const { page, pageSize, status } = retailListParams(req);
  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId") || undefined;
  const where = { organizationId, ...(siteId ? { siteId } : {}), ...(status ? { invoice: { status } } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailInvoiceCheckout.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { lines: true, invoice: { include: { items: true } }, site: { select: { id: true, name: true, code: true } } },
    }),
    prisma.enterpriseRetailInvoiceCheckout.count({ where }),
  ]);
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, checkoutReady: false }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeCheckoutOwner(req, organizationId, true);
  if (!auth.ok) return auth.response;
  const parsed = retailInvoicePrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_PREPARE_INPUT_INVALID", req);
  try {
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
