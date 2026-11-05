import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getActiveEnterpriseSelfEmployee } from "@/lib/enterprise/hr-payroll/self-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  const { organizationId } = await params;
  const [payAccess, timeAccess, timeSubmitAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "read", includeMutationCapabilities: false }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "read", includeMutationCapabilities: false }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "submit", includeMutationCapabilities: false }),
  ]);
  if (!payAccess && !timeAccess && !timeSubmitAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  const employee = await getActiveEnterpriseSelfEmployee(session, organizationId);
  if (!employee) return NextResponse.json({
    linked: false, payrollEnabled: Boolean(payAccess), timeEnabled: Boolean(timeAccess || timeSubmitAccess),
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
    (timeAccess || timeSubmitAccess) ? prisma.enterpriseTimesheet.findMany({
      where: { organizationId, employeeId: employee.id, archivedAt: null },
      orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, reference: true, periodStart: true, periodEnd: true, status: true, totalDeclaredMinutes: true, totalApprovedMinutes: true, submittedAt: true, approvedAt: true, correctionComment: true, rejectionComment: true },
    }) : Promise.resolve([]),
    (timeAccess || timeSubmitAccess) ? prisma.enterpriseWorkClockSession.findMany({
      where: { organizationId, employeeId: employee.id },
      orderBy: { startedAt: "desc" }, take: 20,
      select: { id: true, startedAt: true, stoppedAt: true, workSummary: true, revision: true },
    }) : Promise.resolve([]),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr", page } });
  return NextResponse.json({
    linked: true, employee, payrollEnabled: Boolean(payAccess), timeEnabled: Boolean(timeAccess),
    canClock: Boolean(timeSubmitAccess), canSubmitReport: Boolean(timeSubmitAccess),
    payslips, payslipsPagination: { page, pageSize, total: totalPayslips, pages: Math.max(1, Math.ceil(totalPayslips / pageSize)) },
    timesheets, clockSessions,
  }, { headers: privateHeaders });
}
