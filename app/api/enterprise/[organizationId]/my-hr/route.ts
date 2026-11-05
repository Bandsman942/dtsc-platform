import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getActiveEnterpriseSelfEmployee, hasEnterpriseSelfHrModule } from "@/lib/enterprise/hr-payroll/self-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  const { organizationId } = await params;
  const [payAccess, timeAccess] = await Promise.all([
    hasEnterpriseSelfHrModule(session, organizationId, "PAYROLL_OPERATIONS"),
    hasEnterpriseSelfHrModule(session, organizationId, "TIME_ATTENDANCE"),
  ]);
  if (!payAccess && !timeAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  const employee = await getActiveEnterpriseSelfEmployee(session, organizationId);
  if (!employee) return NextResponse.json({
    linked: false, payrollEnabled: Boolean(payAccess), timeEnabled: Boolean(timeAccess),
    canClock: false, canSubmitReport: false, payslips: [], timesheets: [], clockSessions: [],
    message: "EMPLOYEE_SELF_LINK_REQUIRED",
  }, { headers: privateHeaders });
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get("page")) || 1));
  const pageSize = Math.max(5, Math.min(25, Number(url.searchParams.get("pageSize")) || 10));
  const payslipWhere = {
    organizationId, status: "GENERATED",
    payrollItem: { is: { organizationId, employeeId: employee.id, payrollRun: { is: { organizationId, status: "APPROVED", archivedAt: null } } } },
  };
  const [payslips, totalPayslips, timesheets, clockSessions] = await Promise.all([
    payAccess ? prisma.enterprisePayslip.findMany({
      where: payslipWhere, orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, payslipNumber: true, generatedAt: true, status: true, currency: true,
        grossAmount: true, deductionAmount: true, netAmount: true,
        payrollItem: { select: { payrollRun: { select: {
          reference: true, approvedAt: true, payrollPeriod: { select: { name: true, periodStart: true, periodEnd: true, payDate: true } },
        } } } },
      },
    }) : Promise.resolve([]),
    payAccess ? prisma.enterprisePayslip.count({ where: payslipWhere }) : Promise.resolve(0),
    (timeAccess) ? prisma.enterpriseTimesheet.findMany({
      where: { organizationId, employeeId: employee.id, archivedAt: null },
      orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, reference: true, periodStart: true, periodEnd: true, status: true, totalDeclaredMinutes: true, totalApprovedMinutes: true, submittedAt: true, approvedAt: true, correctionComment: true, rejectionComment: true },
    }) : Promise.resolve([]),
    (timeAccess) ? prisma.enterpriseWorkClockSession.findMany({
      where: { organizationId, employeeId: employee.id },
      orderBy: { startedAt: "desc" }, take: 20,
      select: { id: true, startedAt: true, stoppedAt: true, workSummary: true, revision: true },
    }) : Promise.resolve([]),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr", page } });
  return NextResponse.json({
    linked: true, employee, payrollEnabled: Boolean(payAccess), timeEnabled: Boolean(timeAccess),
    canClock: Boolean(timeAccess), canSubmitReport: Boolean(timeAccess),
    payslips, payslipsPagination: { page, pageSize, total: totalPayslips, pages: Math.max(1, Math.ceil(totalPayslips / pageSize)) },
    timesheets, clockSessions,
  }, { headers: privateHeaders });
}
