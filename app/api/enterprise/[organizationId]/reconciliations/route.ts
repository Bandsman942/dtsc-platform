import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createReconciliationSession } from "@/lib/enterprise/accounting/treasury-service";
import { reconciliationCreateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const statusFilter: Prisma.EnterpriseReconciliationSessionWhereInput = status === "OPEN"
    ? { status: { in: ["DRAFT", "IN_PROGRESS"] } }
    : status ? { status } : {};
  const where: Prisma.EnterpriseReconciliationSessionWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...statusFilter,
    ...(search ? {
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { financialAccount: { code: { contains: search, mode: "insensitive" } } },
        { financialAccount: { name: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseReconciliationSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
        _count: { select: { matches: true } },
      },
    }),
    prisma.enterpriseReconciliationSession.count({ where }),
  ]);
  const statementIds = [...new Set(rawItems.map((item) => item.bankStatementId).filter(Boolean) as string[])];
  const statements = statementIds.length ? await prisma.enterpriseBankStatement.findMany({
    where: { organizationId, id: { in: statementIds } },
    select: { id: true, reference: true, statementDate: true, periodStart: true, periodEnd: true, currencyCode: true, closingBalance: true },
  }) : [];
  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length ? await prisma.enterpriseApproval.findMany({
    where: { organizationId, targetEntityType: "EnterpriseReconciliationSession", targetEntityId: { in: ids }, status: "PENDING", archivedAt: null },
    select: { targetEntityId: true, approverUserId: true, requestedByUserId: true },
  }) : [];
  const assignedIds = new Set(approvals.filter((approval) => approval.approverUserId === auth.session.userId).map((approval) => approval.targetEntityId));
  const statementById = new Map(statements.map((statement) => [statement.id, statement]));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => ({
    ...item,
    differenceAmount: item.reconciledDifference,
    bankStatement: item.bankStatementId ? statementById.get(item.bankStatementId) || null : null,
    capabilities: {
      canMatch: Boolean(capabilities.canManage && ["DRAFT", "IN_PROGRESS"].includes(item.status)),
      canSubmit: Boolean(capabilities.canSubmit && ["DRAFT", "IN_PROGRESS"].includes(item.status) && item.preparedByUserId === auth.session.userId),
      canApprove: Boolean(capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedIds.has(item.id)),
      canReject: Boolean(capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedIds.has(item.id)),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "reconciliations", hasSearch: Boolean(search), recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "create", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = reconciliationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    if (parsed.data.bankStatementId) {
      const importReady = await prisma.enterpriseBankStatement.findFirst({
        where: {
          id: parsed.data.bankStatementId,
          organizationId,
          financialAccountId: parsed.data.financialAccountId,
          status: "IMPORTED",
        },
        select: { id: true },
      });
      if (!importReady) return NextResponse.json({ error: "RECONCILIATION_STATEMENT_NOT_READY", message: "Le relevé bancaire doit être complètement importé avant le rapprochement." }, { status: 409 });
    }
    const session = await createReconciliationSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RECONCILIATION_CREATED",
      entity: "EnterpriseReconciliationSession",
      entityId: session.id,
      request: req,
      metadata: { organizationId, financialAccountId: session.financialAccountId, bankStatementId: session.bankStatementId },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "reconciliations" } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "RECONCILIATION_CREATE_FAILED");
  }
}
