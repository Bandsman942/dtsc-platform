import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import type { MonetaryTotal } from "@/lib/enterprise/common/analytics";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseProject } from "@/lib/enterprise/projects-assets/projects";
import { enterpriseProjectCreateSchema } from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const openHighRisk = { status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } };
const activeProjects = ["ACTIVE", "IN_PROGRESS"];
const finishedProjects = ["COMPLETED", "CLOSED", "CANCELLED"];

async function projectMetrics(tx: Prisma.TransactionClient, organizationId: string, where: Prisma.EnterpriseProjectWhereInput, today: Date) {
  const [active, overdue, highRisks] = await Promise.all([
    tx.enterpriseProject.count({ where: { AND: [where, { status: { in: activeProjects } }] } }),
    tx.enterpriseProject.count({ where: { AND: [where, { targetEndDate: { lt: today }, status: { notIn: finishedProjects } }] } }),
    tx.enterpriseProjectRisk.count({ where: { organizationId, ...openHighRisk, project: where } }),
  ]);
  return { active, overdue, highRisks };
}

async function projectBudgetTotals(tx: Prisma.TransactionClient, where: Prisma.EnterpriseProjectWhereInput): Promise<MonetaryTotal[]> {
  const groups = await tx.enterpriseProject.groupBy({
    by: ["currency", "status"],
    where: { AND: [where, { indicativeBudget: { not: null }, currency: { not: null } }] },
    orderBy: [{ currency: "asc" }, { status: "asc" }],
    _sum: { indicativeBudget: true },
  });
  return groups.flatMap(({ currency, status, _sum }) => currency && /^[A-Z]{3}$/.test(currency) && _sum.indicativeBudget !== null
    ? [{ currencyCode: currency, status, metric: "projectIndicativeBudget", amount: _sum.indicativeBudget.toFixed() }]
    : []);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [writeAccess, manageAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "write" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "manage" }),
  ]);
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(url.searchParams.get("page"))) || 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(url.searchParams.get("pageSize"))) || 25));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;
  const generalWhere = { organizationId, archivedAt: null };
  const where: Prisma.EnterpriseProjectWhereInput = {
    ...generalWhere,
    ...((dates.from || dates.to) ? { createdAt: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const filtered = Boolean(dates.from || dates.to || status || search);
  const result = await prisma.$transaction(async (tx) => {
    const today = new Date(`${await resolveEnterpriseBusinessDate(tx, organizationId)}T00:00:00.000Z`);
    const [rawItems, total, metrics, filteredTotals, generalMetrics, generalTotals] = await Promise.all([
      tx.enterpriseProject.findMany({
        where,
        orderBy: [{ status: "asc" }, { targetEndDate: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { members: true, milestones: true, deliverables: true, risks: true, issues: true } } },
      }),
      tx.enterpriseProject.count({ where }),
      projectMetrics(tx, organizationId, where, today),
      projectBudgetTotals(tx, where),
      filtered ? projectMetrics(tx, organizationId, generalWhere, today) : null,
      filtered ? projectBudgetTotals(tx, generalWhere) : null,
    ]);
    const projectIds = rawItems.map((item) => item.id);
    const pageWhere = { ...generalWhere, id: { in: projectIds } };
    const [acceptedByProject, pageMetrics, pageTotals] = projectIds.length ? await Promise.all([
      tx.enterpriseProjectDeliverable.groupBy({
        by: ["projectId"],
        where: { organizationId, projectId: { in: projectIds }, status: "ACCEPTED" },
        _count: { _all: true },
      }),
      projectMetrics(tx, organizationId, pageWhere, today),
      projectBudgetTotals(tx, pageWhere),
    ]) : [[], { active: 0, overdue: 0, highRisks: 0 }, []] as const;
    const acceptedMap = new Map(acceptedByProject.map((item) => [item.projectId, item._count._all]));
    const items = rawItems.map((item) => ({
      ...item,
      progressPercent: item._count.deliverables > 0
        ? Math.round(((acceptedMap.get(item.id) || 0) / item._count.deliverables) * 100)
        : item.progressPercent,
    }));
    return {
      items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
      metrics, generalMetrics: generalMetrics ?? metrics, pageMetrics,
      filteredTotals, generalTotals: generalTotals ?? filteredTotals, pageTotals,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "projects", page } });
  return NextResponse.json({
    ...result,
    canWrite: Boolean(writeAccess),
    canManage: Boolean(manageAccess),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-project-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseProjectCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "PROJECT_INPUT_INVALID", req);
  try {
    const project = await createEnterpriseProject(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PROJECT_CREATED", entity: "EnterpriseProject", entityId: project.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "projects" } });
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PROJECT_CREATE_FAILED");
  }
}
