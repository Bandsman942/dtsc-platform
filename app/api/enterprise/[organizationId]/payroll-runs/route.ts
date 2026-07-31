import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
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
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const status = url.searchParams.get("status")?.trim() || "";
  const payrollPeriodId = url.searchParams.get("payrollPeriodId")?.trim() || "";
  const where = { organizationId, archivedAt: null, ...(status ? { status } : {}), ...(payrollPeriodId ? { payrollPeriodId } : {}) };
  const [items, total, pendingApproval, approved] = await Promise.all([
    prisma.enterprisePayrollRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        payrollPeriod: true,
        items: { include: { employee: { select: { employeeNumber: true, displayName: true } }, payslip: true } },
      },
    }),
    prisma.enterprisePayrollRun.count({ where }),
    prisma.enterprisePayrollRun.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } }),
    prisma.enterprisePayrollRun.count({ where: { organizationId, archivedAt: null, status: "APPROVED" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { pendingApproval, approved }, canManage: access.canManage });
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Paie invalide." }, { status: 400 });
  try {
    const payrollRun = await prepareEnterprisePayrollRun(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PAYROLL_RUN_PREPARED", entity: "EnterprisePayrollRun", entityId: payrollRun.id, request: req, metadata: { organizationId, paymentCreated: false } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs" } });
    return NextResponse.json({ ok: true, payrollRun }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PAYROLL_RUN_PREPARE_FAILED");
  }
}
