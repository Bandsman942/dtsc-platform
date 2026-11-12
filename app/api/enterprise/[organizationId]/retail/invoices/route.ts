import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prepareRetailInvoice, retailInvoicePrepareSchema } from "@/lib/enterprise/retail/invoice-checkout";
import { requireRetailSiteCapability, retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

// Owner can inspect the whole company; scoped staff see only assigned stores
// after the controlled invoice-checkout and site-isolation activation.
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
  const collectionsOnly = url.searchParams.get("view") === "collections";
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  if ((dateFrom && !isCivilDate(dateFrom)) || (dateTo && !isCivilDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    return retailErrorResponse(new EnterpriseRetailError("RETAIL_REPORT_DATE_INVALID", 400));
  }
  const permittedSites = collectionsOnly ? auth.visibility.collectibleSiteIds : auth.visibility.siteIds;
  if (siteId && !auth.visibility.isOwner && !permittedSites.includes(siteId)) {
    return retailErrorResponse(new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403));
  }
  // Exact dates are interpreted in the selected store's timezone, or in the
  // enterprise timezone for a company-wide report. Never use UTC midnight as
  // a substitute for a local business day.
  const [organization, filteredSite] = dateFrom || dateTo ? await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId }, select: { timezone: true } }),
    siteId ? prisma.enterpriseSite.findFirst({ where: { organizationId, id: siteId, status: "ACTIVE", archivedAt: null }, select: { timezone: true } }) : Promise.resolve(null),
  ]) : [null, null];
  const timezone = filteredSite?.timezone || organization?.timezone || "UTC";
  const invoiceDate: Prisma.DateTimeFilter = {
    ...(dateFrom ? { gte: civilMidnightUtc(dateFrom, timezone) } : {}),
    ...(dateTo ? { lt: civilMidnightUtc(followingCivilDate(dateTo), timezone) } : {}),
  };
  const invoiceConditions: Prisma.EnterpriseSalesInvoiceWhereInput = {
    ...(collectionsOnly ? { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } : status ? { status } : {}),
    ...(dateFrom || dateTo ? { invoiceDate } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { items: { some: { description: { contains: search, mode: "insensitive" } } } },
    ] } : {}),
  };
  const where: Prisma.EnterpriseRetailInvoiceCheckoutWhereInput = {
    organizationId,
    ...(auth.visibility.isOwner ? (siteId ? { siteId } : {}) : { siteId: siteId || { in: permittedSites } }),
    ...(collectionsOnly || status || search || dateFrom || dateTo ? { invoice: invoiceConditions } : {}),
  };
  const [items, total, sites, configuration] = await Promise.all([
    prisma.enterpriseRetailInvoiceCheckout.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { lines: true, invoice: { include: { items: true } }, site: { select: { id: true, name: true, code: true } } },
    }),
    prisma.enterpriseRetailInvoiceCheckout.count({ where }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(auth.visibility.isOwner ? {} : { id: { in: permittedSites } }) },
      take: 100,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, warehouses: { where: { status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } } },
    }),
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", page } });
  const settings = configuration?.settingsJson;
  const checkoutReady = Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && settings.invoiceCheckoutEnabled === true);
  const pendingInvoiceIds = items.filter((entry) => entry.invoice.status === "PENDING_APPROVAL").map((entry) => entry.invoice.id);
  const approvals = pendingInvoiceIds.length ? await prisma.enterpriseApproval.findMany({
    where: { organizationId, targetEntityType: "EnterpriseSalesInvoice", targetEntityId: { in: pendingInvoiceIds }, status: "PENDING", archivedAt: null },
    orderBy: { requestedAt: "desc" }, select: { targetEntityId: true, approverUserId: true },
  }) : [];
  const approverIds = [...new Set(approvals.map((row) => row.approverUserId))];
  const approvers = approverIds.length ? await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: approverIds }, status: "ACTIVE", removedAt: null },
    select: { userId: true, user: { select: { name: true, email: true } } },
  }) : [];
  const approverNames = new Map(approvers.map((member) => [member.userId, member.user.name || member.user.email || "—"]));
  const pendingApprovers = new Map<string, string>();
  for (const approval of approvals) {
    if (!pendingApprovers.has(approval.targetEntityId)) pendingApprovers.set(approval.targetEntityId, approverNames.get(approval.approverUserId) || "—");
  }
  const visibleItems = items.map((entry) => ({
    ...entry,
    invoice: { ...entry.invoice, pendingApproverName: pendingApprovers.get(entry.invoice.id) || null },
    canCancel: ["DRAFT", "REJECTED"].includes(entry.invoice.status) && (auth.visibility.isOwner || auth.visibility.cancellableSiteIds.includes(entry.siteId)),
    canSubmit: ["DRAFT", "REJECTED"].includes(entry.invoice.status) && entry.invoice.createdByUserId === auth.session.userId && (auth.visibility.isOwner || auth.visibility.submittableSiteIds.includes(entry.siteId)),
    canCollect: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(entry.invoice.status) && (auth.visibility.isOwner || auth.visibility.collectibleSiteIds.includes(entry.siteId)),
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
      request: req, metadata: { organizationId, siteId: result.checkout.siteId, warehouseId: result.checkout.warehouseId, idempotent: result.idempotent, invoiceStatus: result.invoice.status, stockWarningCount: result.stockWarnings.length },
    });
    await writeApiLog({ request: req, startedAt, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", action: "prepare", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PREPARE_FAILED");
  }
}
