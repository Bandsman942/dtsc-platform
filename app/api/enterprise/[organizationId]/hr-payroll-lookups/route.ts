import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const ALLOWED = new Set(["HUMAN_RESOURCES", "TIME_ATTENDANCE", "PAYROLL_OPERATIONS"]);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const moduleCode = (new URL(req.url).searchParams.get("module") || "").toUpperCase();
  if (!ALLOWED.has(moduleCode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [members, employees, departments, positions, sites, financeConfiguration, financialAccountCurrencies, approval] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: { user: { name: "asc" } },
      take: 1000,
      select: { id: true, userId: true, role: true, positionCode: true, positionTitle: true, user: { select: { name: true, email: true } } },
    }),
    prisma.enterpriseEmployee.findMany({
      where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null },
      orderBy: { displayName: "asc" },
      take: 2000,
      select: { id: true, employeeNumber: true, displayName: true, workEmail: true, departmentId: true, positionId: true, siteId: true, organizationMemberId: true },
    }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }], take: 500, select: { id: true, departmentCode: true, labelFr: true, labelEn: true } }),
    prisma.enterprisePosition.findMany({ where: { organizationId, isActive: true }, orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }], take: 1000, select: { id: true, positionCode: true, labelFr: true, labelEn: true, departmentId: true } }),
    prisma.enterpriseSite.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, take: 500, select: { id: true, code: true, name: true, siteType: true } }),
    prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true, presentationCurrencyCode: true } }),
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, distinct: ["currencyCode"], take: 50, select: { currencyCode: true } }),
    listEnterpriseApprovalCandidates({ organizationId, requesterUserId: session.userId, moduleCode }).catch(() => ({ candidates: [], selfApprovalOverrideAvailable: false })),
  ]);

  const mappedMembers = members.map((member) => ({ id: member.userId, membershipId: member.id, label: member.user.name || member.user.email, email: member.user.email, role: member.role, positionCode: member.positionCode, positionTitle: member.positionTitle }));
  const approvers = approval.candidates.filter((candidate) => candidate.userId !== session.userId);
  const currencies = [...new Set([financeConfiguration?.functionalCurrencyCode, financeConfiguration?.presentationCurrencyCode, ...financialAccountCurrencies.map((item) => item.currencyCode)].filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase()))].sort();
  let modulePayload: Record<string, unknown> = {};

  if (moduleCode === "TIME_ATTENDANCE") {
    const [projects, tasks] = await Promise.all([
      prisma.enterpriseProject.findMany({ where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } }, orderBy: { name: "asc" }, take: 1500, select: { id: true, reference: true, name: true, status: true } }),
      prisma.enterpriseTask.findMany({ where: { organizationId, status: { notIn: ["DONE", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 1500, select: { id: true, title: true, status: true } }),
    ]);
    modulePayload = { projects, tasks };
  }

  if (moduleCode === "PAYROLL_OPERATIONS") {
    const payrollPeriods = await prisma.enterprisePayrollPeriod.findMany({ where: { organizationId }, orderBy: { periodStart: "desc" }, take: 250, select: { id: true, code: true, name: true, status: true, periodStart: true, periodEnd: true, payDate: true } });
    modulePayload = { payrollPeriods };
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "hr-payroll-lookups", moduleCode } });
  return NextResponse.json({ members: mappedMembers, employees, departments, positions, sites, approvers, currencies, ...modulePayload });
}
