import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createSupplierInvoice } from "@/lib/enterprise/accounting/payables-service";
import { supplierInvoiceCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const workflowPending = url.searchParams.get("workflowPending") === "true";
  const where: Prisma.EnterpriseSupplierInvoiceWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(workflowPending ? { status: { in: ["PENDING_REVIEW", "PENDING_APPROVAL"] } } : status ? { status } : {}),
    ...(search ? { number: { contains: search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.enterpriseSupplierInvoice.findMany({
      where,
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, payable: true, threeWayMatch: true },
    }),
    prisma.enterpriseSupplierInvoice.count({ where }),
  ]);
  const assignedApprovals = items.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: { in: ["EnterpriseSupplierInvoiceReview", "EnterpriseSupplierInvoiceApproval"] },
      targetEntityId: { in: items.map((item) => item.id) },
      approverUserId: auth.session.userId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true, targetEntityType: true },
  }) : [];
  const reviewIds = new Set(assignedApprovals.filter((approval) => approval.targetEntityType === "EnterpriseSupplierInvoiceReview").map((approval) => approval.targetEntityId));
  const approvalIds = new Set(assignedApprovals.filter((approval) => approval.targetEntityType === "EnterpriseSupplierInvoiceApproval").map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  const resultItems = items.map((item) => ({
    ...item,
    capabilities: {
      canSubmit: capabilities.canSubmit && item.status === "DRAFT" && item.createdByUserId === auth.session.userId,
      canReview: capabilities.canApprove && item.status === "PENDING_REVIEW" && reviewIds.has(item.id),
      canApprove: capabilities.canApprove && item.status === "PENDING_APPROVAL" && approvalIds.has(item.id),
      canReject: capabilities.canApprove && ((item.status === "PENDING_REVIEW" && reviewIds.has(item.id)) || (item.status === "PENDING_APPROVAL" && approvalIds.has(item.id))),
      canPost: capabilities.canManage && item.status === "APPROVED",
      canCreateCredit: capabilities.canCreate && ["POSTED", "PARTIALLY_PAID", "PAID"].includes(item.status),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "supplier-invoices", page, recordId: Boolean(recordId), workflowPending } });
  return NextResponse.json({ items: resultItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "create", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = supplierInvoiceCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const invoice = await createSupplierInvoice(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_SUPPLIER_INVOICE_CREATED", entity: "EnterpriseSupplierInvoice", entityId: invoice.id, request: req, metadata: { organizationId, number: invoice.number, total: invoice.grandTotal.toFixed(), currency: invoice.currencyCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "supplier-invoices" } });
    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "SUPPLIER_INVOICE_CREATE_FAILED");
  }
}
