import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseProject } from "@/lib/enterprise/projects-assets/projects";
import { enterpriseProjectCreateSchema } from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const where: Prisma.EnterpriseProjectWhereInput = {
    organizationId,
    archivedAt: null,
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [items, total, active, overdue, risks] = await Promise.all([
    prisma.enterpriseProject.findMany({
      where,
      orderBy: [{ status: "asc" }, { targetEndDate: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { members: true, milestones: true, deliverables: true, risks: true, issues: true } } },
    }),
    prisma.enterpriseProject.count({ where }),
    prisma.enterpriseProject.count({ where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
    prisma.enterpriseProject.count({ where: { organizationId, archivedAt: null, targetEndDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } } }),
    prisma.enterpriseProjectRisk.count({ where: { organizationId, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "projects", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active, overdue, highRisks: risks }, canManage: access.canManage });
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Projet invalide." }, { status: 400 });
  try {
    const project = await createEnterpriseProject(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PROJECT_CREATED", entity: "EnterpriseProject", entityId: project.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "projects" } });
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PROJECT_CREATE_FAILED");
  }
}
