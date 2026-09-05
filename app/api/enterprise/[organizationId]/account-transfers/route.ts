import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createTreasuryTransfer } from "@/lib/enterprise/accounting/treasury-transfer-service";
import { accountTransferSchema } from "@/lib/enterprise/accounting/treasury-schemas";
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
  const where: Prisma.EnterpriseAccountTransferWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { number: { contains: search, mode: "insensitive" } } : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseAccountTransfer.findMany({
      where,
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
    }),
    prisma.enterpriseAccountTransfer.count({ where }),
  ]);
  const accountIds = [...new Set(rawItems.flatMap((item) => [item.sourceFinancialAccountId, item.targetFinancialAccountId]))];
  const transferIds = rawItems.map((item) => item.id);
  const [accounts, approvals] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, id: { in: accountIds } },
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true },
    }),
    transferIds.length
      ? prisma.enterpriseApproval.findMany({
          where: { organizationId, targetEntityType: "EnterpriseAccountTransfer", targetEntityId: { in: transferIds }, archivedAt: null },
          orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, targetEntityId: true, requestedByUserId: true, approverUserId: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const approvalByTransferId = new Map<string, (typeof approvals)[number]>();
  for (const approval of approvals) if (!approvalByTransferId.has(approval.targetEntityId)) approvalByTransferId.set(approval.targetEntityId, approval);
  const approverUserIds = [...new Set(approvals.map((approval) => approval.approverUserId))];
  const approvers = approverUserIds.length ? await prisma.user.findMany({ where: { id: { in: approverUserIds } }, select: { id: true, name: true } }) : [];
  const approverNameById = new Map(approvers.map((user) => [user.id, user.name]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => {
    const approval = approvalByTransferId.get(item.id);
    const assigned = approval?.status === "PENDING" && approval.approverUserId === auth.session.userId;
    return {
      ...item,
      sourceFinancialAccount: accountById.get(item.sourceFinancialAccountId) || null,
      targetFinancialAccount: accountById.get(item.targetFinancialAccountId) || null,
      approval: approval ? {
        id: approval.id,
        approverUserId: approval.approverUserId,
        approverName: approverNameById.get(approval.approverUserId) || "—",
        requestedByUserId: approval.requestedByUserId,
        status: approval.status,
        canAct: assigned,
      } : null,
      capabilities: {
        canApprove: Boolean(capabilities.canApprove && item.status === "DRAFT" && assigned),
        canReject: Boolean(capabilities.canApprove && item.status === "DRAFT" && assigned),
        canConfirm: Boolean(capabilities.canWrite && item.status === "APPROVED"),
      },
    };
  });

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-transfers", recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = accountTransferSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const transfer = await createTreasuryTransfer(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_ACCOUNT_TRANSFER_CREATED",
      entity: "EnterpriseAccountTransfer",
      entityId: transfer.id,
      request: req,
      metadata: {
        organizationId,
        sourceFinancialAccountId: transfer.sourceFinancialAccountId,
        targetFinancialAccountId: transfer.targetFinancialAccountId,
        sourceAmount: transfer.sourceAmount.toFixed(),
        targetAmount: transfer.targetAmount.toFixed(),
        sourceCurrency: transfer.sourceCurrencyCode,
        targetCurrency: transfer.targetCurrencyCode,
        exchangeRate: transfer.exchangeRate?.toFixed() || "1",
        approverUserId: parsed.data.approverUserId,
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-transfers" } });
    return NextResponse.json({ ok: true, transfer }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_TRANSFER_CREATE_FAILED");
  }
}
