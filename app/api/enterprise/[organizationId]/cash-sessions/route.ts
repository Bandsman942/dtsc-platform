import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { openCashSession } from "@/lib/enterprise/accounting/treasury-service";
import { cashSessionOpenSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseCashSessionWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { financialAccount: { code: { contains: search, mode: "insensitive" } } },
        { financialAccount: { name: { contains: search, mode: "insensitive" } } },
        { financialAccount: { currencyCode: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseCashSession.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
        _count: { select: { movements: true, counts: true, discrepancies: true } },
      },
    }),
    prisma.enterpriseCashSession.count({ where }),
  ]);
  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseCashSession",
      targetEntityId: { in: ids },
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true, approverUserId: true, requestedByUserId: true },
  }) : [];
  const assignedIds = new Set(approvals.filter((approval) => approval.approverUserId === auth.session.userId).map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => ({
    ...item,
    theoreticalClosingAmount: item.expectedClosingAmount,
    capabilities: {
      canClose: capabilities.canManage && item.status === "OPEN",
      canApprove: capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedIds.has(item.id),
      canReject: capabilities.canApprove && item.status === "PENDING_VALIDATION" && assignedIds.has(item.id),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions", hasSearch: Boolean(search), recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "create", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = cashSessionOpenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const session = await openCashSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_OPENED",
      entity: "EnterpriseCashSession",
      entityId: session.id,
      request: req,
      metadata: { organizationId, financialAccountId: session.financialAccountId, openingAmount: session.openingAmount.toFixed() },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions" } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_OPEN_FAILED");
  }
}
