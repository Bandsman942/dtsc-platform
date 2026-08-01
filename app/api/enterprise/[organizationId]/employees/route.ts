import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseEmployee } from "@/lib/enterprise/hr-payroll/employees";
import { employeeCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const departmentId = url.searchParams.get("departmentId")?.trim() || "";
  const where: Prisma.EnterpriseEmployeeWhereInput = {
    organizationId,
    archivedAt: null,
    ...(status ? { employmentStatus: status } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(search ? {
      OR: [
        { employeeNumber: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { workEmail: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [rawItems, total, active, withoutContract] = await Promise.all([
    prisma.enterpriseEmployee.findMany({
      where,
      orderBy: [{ employmentStatus: "asc" }, { displayName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contracts: { where: { status: "ACTIVE", archivedAt: null }, orderBy: { versionNumber: "desc" }, take: 1 },
        _count: { select: { directReports: true, timesheets: true, leaveRequests: true } },
      },
    }),
    prisma.enterpriseEmployee.count({ where }),
    prisma.enterpriseEmployee.count({ where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE" } }),
    prisma.enterpriseEmployee.count({ where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE", contracts: { none: { status: "ACTIVE", archivedAt: null } } } }),
  ]);
  const references = rawItems.length ? await prisma.enterprisePersonBusinessReference.findMany({
    where: { organizationId, employeeId: { in: rawItems.map((item) => item.id) } },
    select: { employeeId: true, personIdentityId: true },
  }) : [];
  const identityLinks = references.length ? await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId, personIdentityId: { in: [...new Set(references.map((reference) => reference.personIdentityId))] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, personIdentityId: true, status: true, requestedRelationType: true, activatedAt: true, expiresAt: true },
  }) : [];
  const linkByPerson = new Map<string, (typeof identityLinks)[number]>();
  for (const link of identityLinks) if (!linkByPerson.has(link.personIdentityId)) linkByPerson.set(link.personIdentityId, link);
  const linkByEmployee = new Map(references.filter((reference) => reference.employeeId).map((reference) => [reference.employeeId as string, linkByPerson.get(reference.personIdentityId) || null]));
  const items = rawItems.map((item) => ({ ...item, identityLink: linkByEmployee.get(item.id) || null }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employees", page } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { active, withoutContract },
    canManage: access.canManage,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employee-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = employeeCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Employé invalide." }, { status: 400 });
  try {
    const employee = await createEnterpriseEmployee(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYEE_CREATED", entity: "EnterpriseEmployee", entityId: employee.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "employees" } });
    return NextResponse.json({ ok: true, employee }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (duplicate) return NextResponse.json({ error: "EMPLOYEE_DUPLICATE", message: "Ce membre ou numéro employé est déjà utilisé." }, { status: 409 });
    return enterpriseDomainErrorResponse(error, "EMPLOYEE_CREATE_FAILED");
  }
}
