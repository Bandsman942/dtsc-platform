import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { payrollAmountTotals, payrollPageTotals } from "@/lib/enterprise/common/analytics";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { prepareEnterprisePayrollRun } from "@/lib/enterprise/hr-payroll/payroll";
import { payrollRunPrepareSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [approvalAccess, writeAccess, manageAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "approve" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "write" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "manage" }),
  ]);
  const url = new URL(req.url);
  const businessPeriod = financeBusinessDateRange(req);
  if (!businessPeriod.ok) return businessPeriod.response;
  const businessDateFilter = businessPeriod.from || businessPeriod.to ? { createdAt: { gte: businessPeriod.from || undefined, lte: businessPeriod.to || undefined } } : {};
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const status = url.searchParams.get("status")?.trim() || "";
  const payrollPeriodId = url.searchParams.get("payrollPeriodId")?.trim() || "";
  // Read permission alone never grants an enterprise-wide compensation register.
  // Only payroll managers have full scope; designated approvers/preparers see their runs.
  const actorScope: Prisma.EnterprisePayrollRunWhereInput = manageAccess ? {} : {
    OR: [
      ...(approvalAccess ? [{ approverUserId: session.userId }] : []),
      ...(writeAccess ? [{ preparedByUserId: session.userId }] : []),
    ],
  };
  const authorized = { organizationId, archivedAt: null, ...actorScope };
  const where: Prisma.EnterprisePayrollRunWhereInput = {
    ...authorized, ...businessDateFilter,
    ...(status ? { status } : {}), ...(payrollPeriodId ? { payrollPeriodId } : {}),
  };
  if (!manageAccess && !approvalAccess && !writeAccess) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs-self-only" } });
    return NextResponse.json({ items: [], pagination: { page, pageSize, total: 0, pageCount: 1 }, metrics: { pendingApproval: 0, approved: 0 }, canManage: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const [rawItems, total, filteredGroups, generalGroups] = await prisma.$transaction(async (tx) => {
    const aggregate = (scope: Prisma.EnterprisePayrollRunWhereInput) => tx.enterprisePayrollRun.groupBy({
      by: ["currency", "status"],
      where: scope,
      _sum: { grossAmount: true, bonusAmount: true, deductionAmount: true, netAmount: true },
      _count: { _all: true },
    });
    const general = aggregate(authorized);
    const hasFilters = Boolean(status || payrollPeriodId || businessPeriod.from || businessPeriod.to);
    return Promise.all([
      tx.enterprisePayrollRun.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          payrollPeriod: true,
          items: { include: { employee: { select: { employeeNumber: true, displayName: true } }, payslip: true } },
        },
      }),
      tx.enterprisePayrollRun.count({ where }),
      hasFilters ? aggregate(where) : general,
      general,
    ]);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const countByStatus = (status: string) => filteredGroups.reduce((sum, group) => sum + (group.status === status ? group._count._all : 0), 0);
  const items = rawItems.map((item) => ({
    ...item,
    canDecide: Boolean(approvalAccess && item.status === "PENDING_APPROVAL" && item.approverUserId === session.userId),
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs", page } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { pendingApproval: countByStatus("PENDING_APPROVAL"), approved: countByStatus("APPROVED") },
    filteredTotals: payrollAmountTotals(filteredGroups),
    generalTotals: payrollAmountTotals(generalGroups),
    pageTotals: payrollPageTotals(rawItems),
    canManage: access.canManage,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-payroll-run-prepare:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = payrollRunPrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Paie invalide." }, { status: 400 });
  try {
    const payrollRun = await prepareEnterprisePayrollRun(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PAYROLL_RUN_PREPARED", entity: "EnterprisePayrollRun", entityId: payrollRun.id, request: req, metadata: { organizationId, paymentCreated: false } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs" } });
    return NextResponse.json({ ok: true, payrollRun }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PAYROLL_RUN_PREPARE_FAILED", req);
  }
}
