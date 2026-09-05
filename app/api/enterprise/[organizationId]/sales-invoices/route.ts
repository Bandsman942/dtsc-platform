import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { assertSalesInvoiceSources } from "@/lib/enterprise/accounting/invoice-source-validation";
import { createSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { salesInvoiceCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const workflowPending = url.searchParams.get("workflowPending") === "true";
  const where: Prisma.EnterpriseSalesInvoiceWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(workflowPending ? { status: "PENDING_APPROVAL" } : status ? { status } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.enterpriseSalesInvoice.findMany({
      where,
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, receivable: true },
    }),
    prisma.enterpriseSalesInvoice.count({ where }),
  ]);
  const assignedApprovals = items.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseSalesInvoice",
      targetEntityId: { in: items.map((item) => item.id) },
      approverUserId: auth.session.userId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true },
  }) : [];
  const assignedIds = new Set(assignedApprovals.map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  const resultItems = items.map((item) => ({
    ...item,
    capabilities: {
      canSubmit: capabilities.canSubmit && item.status === "DRAFT" && item.createdByUserId === auth.session.userId,
      canApprove: capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id),
      canPost: capabilities.canManage && item.status === "APPROVED",
      canCreateCredit: capabilities.canCreate && ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(item.status),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-invoices", page, recordId: Boolean(recordId), workflowPending } });
  return NextResponse.json({ items: resultItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "create", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = salesInvoiceCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    await prisma.$transaction((tx) => assertSalesInvoiceSources(tx, organizationId, parsed.data));
    const invoice = await createSalesInvoice(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_SALES_INVOICE_CREATED", entity: "EnterpriseSalesInvoice", entityId: invoice.id, request: req, metadata: { organizationId, number: invoice.number, total: invoice.grandTotal.toFixed(), currency: invoice.currencyCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-invoices" } });
    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "SALES_INVOICE_CREATE_FAILED");
  }
}
