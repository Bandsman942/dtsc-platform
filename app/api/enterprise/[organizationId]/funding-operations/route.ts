import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { createFundingOperation } from "@/lib/enterprise/accounting/funding-service";
import { fundingOperationCreateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const fundingType = url.searchParams.get("fundingType")?.trim() || undefined;
  const where: Prisma.EnterpriseFundingOperationWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(fundingType ? { fundingType } : {}),
    ...(search ? {
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [rawItems, total] = await Promise.all([
    prisma.enterpriseFundingOperation.findMany({
      where,
      orderBy: [{ operationDate: "desc" }, { createdAt: "desc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, accountType: true, currencyCode: true } },
        cashSession: { select: { id: true, number: true, status: true, cashierUserId: true } },
        counterpartyLedgerAccount: { select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true } },
      },
    }),
    prisma.enterpriseFundingOperation.count({ where }),
  ]);

  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length
    ? await prisma.enterpriseApproval.findMany({
        where: {
          organizationId,
          targetEntityType: "EnterpriseFundingOperation",
          targetEntityId: { in: ids },
          archivedAt: null,
        },
        orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, targetEntityId: true, requestedByUserId: true, approverUserId: true, status: true },
      })
    : [];
  const approvalById = new Map<string, (typeof approvals)[number]>();
  for (const approval of approvals) if (!approvalById.has(approval.targetEntityId)) approvalById.set(approval.targetEntityId, approval);
  const approverIds = [...new Set(approvals.map((approval) => approval.approverUserId))];
  const users = approverIds.length
    ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => {
    const approval = approvalById.get(item.id);
    const assigned = approval?.status === "PENDING" && approval.approverUserId === auth.session.userId;
    return {
      ...item,
      approval: approval ? {
        id: approval.id,
        approverUserId: approval.approverUserId,
        approverName: names.get(approval.approverUserId) || "—",
        requestedByUserId: approval.requestedByUserId,
        status: approval.status,
        canAct: assigned,
      } : null,
      capabilities: {
        canApprove: Boolean(capabilities.canApprove && item.status === "DRAFT" && assigned),
        canReject: Boolean(capabilities.canApprove && item.status === "DRAFT" && assigned),
        canConfirm: Boolean(capabilities.canWrite && item.status === "APPROVED" && item.initiatedByUserId !== auth.session.userId && item.approvedByUserId !== auth.session.userId),
        canReverse: Boolean(capabilities.canManage && item.status === "CONFIRMED" && item.initiatedByUserId !== auth.session.userId && item.approvedByUserId !== auth.session.userId && item.confirmedByUserId !== auth.session.userId),
      },
    };
  });

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "funding-operations", recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = fundingOperationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "FUNDING_OPERATION_INPUT_INVALID");

  try {
    const funding = await createFundingOperation(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FUNDING_OPERATION_CREATED",
      entity: "EnterpriseFundingOperation",
      entityId: funding.id,
      request: req,
      metadata: {
        organizationId,
        fundingType: funding.fundingType,
        financialAccountId: funding.financialAccountId,
        cashSessionId: funding.cashSessionId,
        currencyCode: funding.currencyCode,
        amount: funding.amount.toFixed(),
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "funding-operations" } });
    return NextResponse.json({ ok: true, funding }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FUNDING_OPERATION_CREATE_FAILED");
  }
}
