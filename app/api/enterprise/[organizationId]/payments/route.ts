import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { paymentCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, search, status } = financeListParams(req);
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const directionRaw = url.searchParams.get("direction")?.trim();
  const direction = directionRaw === "INBOUND" || directionRaw === "OUTBOUND" ? directionRaw : undefined;
  const unallocatedOnly = url.searchParams.get("unallocated") === "true";
  const workflowPending = url.searchParams.get("workflowPending") === "true";
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || undefined;
  const currencyCode = url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined;

  const where: Prisma.EnterprisePaymentWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(workflowPending ? { status: "PENDING_APPROVAL" } : status ? { status } : {}),
    ...(direction ? { direction } : {}),
    ...(unallocatedOnly ? { status: { in: ["CONFIRMED", "RECONCILED"] }, unallocatedAmount: { gt: 0 } } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };

  const [items, total, inbound, outbound, unallocated] = await Promise.all([
    prisma.enterprisePayment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { allocations: true, events: true } } },
    }),
    prisma.enterprisePayment.count({ where }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "INBOUND" }, _sum: { amount: true } }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "OUTBOUND" }, _sum: { amount: true } }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } }, _sum: { unallocatedAmount: true } }),
  ]);

  const assignedApprovals = items.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterprisePayment",
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
      canSubmit: capabilities.canSubmit && item.status === "DRAFT" && item.initiatedByUserId === auth.session.userId,
      canApprove: capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id),
      canCancel: capabilities.canSubmit && ["DRAFT", "PENDING_APPROVAL"].includes(item.status) && item.initiatedByUserId === auth.session.userId,
      canConfirm: capabilities.canWrite && item.status === "APPROVED",
      canReconcile: capabilities.canManage && item.status === "CONFIRMED",
      canReverse: capabilities.canManage && ["CONFIRMED", "RECONCILED"].includes(item.status),
      canAllocate: capabilities.canWrite && ["CONFIRMED", "RECONCILED"].includes(item.status) && item.unallocatedAmount.gt(0),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payments", page, direction, unallocatedOnly, workflowPending, recordId: Boolean(recordId) } });
  return NextResponse.json({
    items: resultItems,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: {
      inbound: inbound._sum.amount || new Prisma.Decimal(0),
      outbound: outbound._sum.amount || new Prisma.Decimal(0),
      unallocated: unallocated._sum.unallocatedAmount || new Prisma.Decimal(0),
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "create", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = paymentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const payment = await createEnterprisePayment(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PAYMENT_CREATED", entity: "EnterprisePayment", entityId: payment.id, request: req, metadata: { organizationId, number: payment.number, amount: payment.amount.toFixed(), currency: payment.currencyCode, direction: payment.direction, paymentType: payment.paymentType } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payments" } });
    return NextResponse.json({ ok: true, payment }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "PAYMENT_CREATE_FAILED");
  }
}
