import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { archiveEnterpriseEmployee, updateEnterpriseEmployee } from "@/lib/enterprise/hr-payroll/employees";
import { employeeUpdateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { buildEnterpriseObjectDeepLink } from "@/lib/enterprise/cross-module/deep-links";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; employeeId: string }> };
const archiveSchema = z.object({ revision: z.number().int().positive() });

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, employeeId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [timeAccess, payrollAccess, projectAccess, assetAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
  ]);
  const employee = await prisma.enterpriseEmployee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      manager: { select: { id: true, displayName: true, employeeNumber: true } },
      site: { select: { id: true, name: true, timezone: true } },
      contracts: { where: { archivedAt: null }, orderBy: { versionNumber: "desc" }, take: 5,
        select: { id: true, reference: true, status: true, contractType: true, versionNumber: true, startDate: true, endDate: true } },
      _count: { select: { directReports: true, contracts: true, assignments: true, workSchedules: true, attendanceRecords: true,
        leaveRequests: true, timesheets: true, payrollItems: true, projectMemberships: true, assetAssignments: true } },
    },
  });
  if (!employee || (employee.archivedAt && !access.canAdminister)) return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });

  // Build exact object links only for modules independently authorized for this session.
  const [timesheets, leaves, payrollItems, projectMembers, assetAssignments] = await Promise.all([
    timeAccess ? prisma.enterpriseTimesheet.findMany({
      where: { organizationId, employeeId, archivedAt: null },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, reference: true, status: true, periodEnd: true },
    }) : Promise.resolve([]),
    timeAccess ? prisma.enterpriseLeaveRequest.findMany({
      where: { organizationId, employeeId, archivedAt: null },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, reference: true, status: true, startDate: true },
    }) : Promise.resolve([]),
    payrollAccess && access.canAdminister ? prisma.enterprisePayrollItem.findMany({
      where: { organizationId, employeeId, payrollRun: { status: "APPROVED" } },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, payrollRunId: true, payslip: { select: { id: true, payslipNumber: true, status: true } } },
    }) : Promise.resolve([]),
    projectAccess ? prisma.enterpriseProjectMember.findMany({
      where: { organizationId, employeeId },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { projectId: true, status: true, project: { select: { name: true } } },
    }) : Promise.resolve([]),
    assetAccess ? prisma.enterpriseAssetAssignment.findMany({
      where: { organizationId, employeeId },
      orderBy: { assignedAt: "desc" }, take: 5,
      select: { assetId: true, status: true, asset: { select: { name: true } } },
    }) : Promise.resolve([]),
  ]);

  const activities = [
    { key: "contracts", count: employee._count.contracts, items: employee.contracts.map((item) => ({
      title: item.reference, status: item.status, date: item.startDate,
      href: buildEnterpriseObjectDeepLink({ entityType: "EnterpriseEmploymentContract", entityId: item.id, moduleCode: "HUMAN_RESOURCES", tab: "CONTRACTS" }),
    })) },
    ...(timeAccess ? [
      { key: "timesheets", count: employee._count.timesheets, items: timesheets.map((item) => ({
        title: item.reference, status: item.status, date: item.periodEnd,
        href: buildEnterpriseObjectDeepLink({ entityType: "EnterpriseTimesheet", entityId: item.id }),
      })) },
      { key: "leave", count: employee._count.leaveRequests, items: leaves.map((item) => ({
        title: item.reference, status: item.status, date: item.startDate,
        href: buildEnterpriseObjectDeepLink({ entityType: "EnterpriseLeaveRequest", entityId: item.id, moduleCode: "TIME_ATTENDANCE" }),
      })) },
    ] : []),
    ...(payrollAccess && access.canAdminister ? [
      { key: "payroll", count: employee._count.payrollItems, items: payrollItems.map((item) => ({
        title: item.payslip?.payslipNumber || "—", status: item.payslip?.status || "—", date: null,
        href: buildEnterpriseObjectDeepLink({ entityType: "EnterprisePayslip", entityId: item.payslip?.id || item.payrollRunId }),
      })) },
    ] : []),
    ...(projectAccess ? [
      { key: "projects", count: employee._count.projectMemberships, items: projectMembers.map((item) => ({
        title: item.project.name, status: item.status, date: null,
        href: buildEnterpriseObjectDeepLink({ entityType: "EnterpriseProject", entityId: item.projectId }),
      })) },
    ] : []),
    ...(assetAccess ? [
      { key: "assets", count: employee._count.assetAssignments, items: assetAssignments.map((item) => ({
        title: item.asset.name, status: item.status, date: null,
        href: buildEnterpriseObjectDeepLink({ entityType: "EnterpriseAsset", entityId: item.assetId }),
      })) },
    ] : []),
  ];

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employee-detail" } });
  return NextResponse.json({
    employee: {
      ...employee,
      baseCompensation: access.canAdminister ? employee.baseCompensation : null,
      compensationCurrency: access.canAdminister ? employee.compensationCurrency : null,
      professionalInfoJson: access.canAdminister ? employee.professionalInfoJson : null,
      _count: {
        ...employee._count,
        timesheets: timeAccess ? employee._count.timesheets : 0,
        leaveRequests: timeAccess ? employee._count.leaveRequests : 0,
        payrollItems: payrollAccess && access.canAdminister ? employee._count.payrollItems : 0,
        projectMemberships: projectAccess ? employee._count.projectMemberships : 0,
        assetAssignments: assetAccess ? employee._count.assetAssignments : 0,
      },
    },
    activities,
    canEdit: access.canAdminister,
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employee-update:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, employeeId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = employeeUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYEE_UPDATE_INPUT_INVALID", req);
  try {
    const employee = await updateEnterpriseEmployee(organizationId, employeeId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYEE_UPDATED", entity: "EnterpriseEmployee", entityId: employee.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employees", action: "update" } });
    return NextResponse.json({ ok: true, employee });
  } catch (error) { return enterpriseDomainErrorResponse(error, "EMPLOYEE_UPDATE_FAILED", req); }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employee-archive:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, employeeId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = archiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYEE_ARCHIVE_INPUT_INVALID", req);
  try {
    const result = await archiveEnterpriseEmployee(organizationId, employeeId, session.userId, parsed.data.revision);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYEE_ARCHIVED", entity: "EnterpriseEmployee", entityId: employeeId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employees", action: "archive" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return enterpriseDomainErrorResponse(error, "EMPLOYEE_ARCHIVE_FAILED", req); }
}
