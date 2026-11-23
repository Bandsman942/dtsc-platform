import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeBusinessDateRange, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createSalesCreditNote } from "@/lib/enterprise/accounting/receivables-service";
import { creditNoteCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view");
  if (!auth.ok) return auth.response;
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = new URL(req.url).searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseSalesCreditNoteWhereInput = {
    organizationId,
    ...((dates.from || dates.to) ? { creditDate: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
      { salesInvoice: { number: { contains: search, mode: "insensitive" } } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseSalesCreditNote.findMany({
      where,
      orderBy: [{ creditDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { salesInvoice: true, items: true },
    }),
    prisma.enterpriseSalesCreditNote.count({ where }),
  ]);

  const approvals = items.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseSalesCreditNoteApproval",
      targetEntityId: { in: items.map((item) => item.id) },
      approverUserId: auth.session.userId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true },
  }) : [];
  const assignedIds = new Set(approvals.map((approval) => approval.targetEntityId));
  // A Retail credit belongs to the return/settlement domain, even when the
  // historical credit has no valid return binding yet. Never offer direct
  // Finance posting on a checkout invoice.
  const invoiceIds = [...new Set(items.map((item) => item.salesInvoiceId))];
  const [retailCheckouts, linkedReturns] = await Promise.all([
    invoiceIds.length ? prisma.enterpriseRetailInvoiceCheckout.findMany({
      where: { organizationId, salesInvoiceId: { in: invoiceIds } },
      select: { salesInvoiceId: true, siteId: true },
    }) : Promise.resolve([]),
    items.length ? prisma.enterpriseRetailInvoiceReturnRequest.findMany({
      where: { organizationId, salesCreditNoteId: { in: items.map((item) => item.id) } },
      select: { id: true, number: true, status: true, salesCreditNoteId: true },
    }) : Promise.resolve([]),
  ]);
  const retailByInvoice = new Map(retailCheckouts.map((checkout) => [checkout.salesInvoiceId, checkout]));
  const returnByCredit = new Map(linkedReturns.map((request) => [request.salesCreditNoteId, request]));
  const capabilities = auth.access.capabilities;
  const resultItems = items.map((item) => ({
    ...item,
    retailOrigin: retailByInvoice.has(item.salesInvoiceId) ? {
      invoiceId: item.salesInvoiceId,
      siteId: retailByInvoice.get(item.salesInvoiceId)!.siteId,
      returnRequestId: returnByCredit.get(item.id)?.id || null,
      returnNumber: returnByCredit.get(item.id)?.number || null,
      returnStatus: returnByCredit.get(item.id)?.status || "UNLINKED",
    } : null,
    capabilities: {
      canSubmit: capabilities.canSubmit && ["DRAFT", "REJECTED"].includes(item.status) && item.createdByUserId === auth.session.userId,
      canApprove: capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id),
      canReject: capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id),
      canPost: capabilities.canManage && item.status === "APPROVED" && !retailByInvoice.has(item.salesInvoiceId),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-credit-notes", page, recordId: Boolean(recordId) } });
  return NextResponse.json({ items: resultItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "create", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = creditNoteCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "SALES_CREDIT_NOTES_INPUT_INVALID", req);
  try {
    const creditNote = await createSalesCreditNote(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_SALES_CREDIT_NOTE_CREATED", entity: "EnterpriseSalesCreditNote", entityId: creditNote.id, request: req, metadata: { organizationId, number: creditNote.number, total: creditNote.grandTotal.toFixed(), currency: creditNote.currencyCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-credit-notes" } });
    return NextResponse.json({ ok: true, creditNote }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "SALES_CREDIT_NOTE_CREATE_FAILED");
  }
}
