import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prepareFinancialClose } from "@/lib/enterprise/accounting/close-service";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { closePrepareSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, status, search } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseFinancialCloseWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      fiscalPeriod: {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { fiscalYear: { code: { contains: search, mode: "insensitive" } } },
        ],
      },
    } : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseFinancialClose.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: { fiscalPeriod: { include: { fiscalYear: true } } },
    }),
    prisma.enterpriseFinancialClose.count({ where }),
  ]);
  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseFinancialClose",
      targetEntityId: { in: ids },
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true, approverUserId: true },
  }) : [];
  const assignedIds = new Set(approvals.filter((approval) => approval.approverUserId === auth.session.userId).map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => ({
    ...item,
    capabilities: {
      canSubmit: Boolean(capabilities.canSubmit && ["DRAFT", "BLOCKED"].includes(item.status) && item.requestedByUserId === auth.session.userId),
      canApprove: Boolean(capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id)),
      canClose: Boolean(capabilities.canManage && item.status === "APPROVED"),
      canReopen: Boolean(capabilities.canManage && item.status === "CLOSED"),
    },
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-close", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", "create", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = closePrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const close = await prepareFinancialClose(organizationId, parsed.data.fiscalPeriodId, auth.session.userId);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FINANCIAL_CLOSE_PREPARED", entity: "EnterpriseFinancialClose", entityId: close.id, request: req, metadata: { organizationId, fiscalPeriodId: close.fiscalPeriodId } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-close" } });
    return NextResponse.json({ ok: true, close }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_CLOSE_PREPARE_FAILED");
  }
}
