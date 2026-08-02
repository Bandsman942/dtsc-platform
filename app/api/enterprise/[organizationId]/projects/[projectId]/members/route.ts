import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; projectId: string }> };
const memberSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ADD"), employeeId: z.string().trim().min(1), role: z.string().trim().min(2).max(120), allocationPercent: z.coerce.number().int().min(1).max(100).default(100) }),
  z.object({ action: z.literal("REMOVE"), employeeId: z.string().trim().min(1) }),
]);

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-project-member:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, projectId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = memberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Membre projet invalide." }, { status: 400 });
  const [project, employee] = await Promise.all([
    prisma.enterpriseProject.findFirst({ where: { id: projectId, organizationId, archivedAt: null }, select: { id: true } }),
    prisma.enterpriseEmployee.findFirst({ where: { id: parsed.data.employeeId, organizationId, employmentStatus: "ACTIVE", archivedAt: null }, select: { id: true } }),
  ]);
  if (!project || !employee) return NextResponse.json({ error: "Not found", message: "Le projet ou le collaborateur est introuvable dans cette entreprise." }, { status: 404 });
  if (parsed.data.action === "ADD") {
    const member = await prisma.enterpriseProjectMember.upsert({
      where: { organizationId_projectId_employeeId: { organizationId, projectId, employeeId: employee.id } },
      update: { role: parsed.data.role, allocationPercent: parsed.data.allocationPercent, status: "ACTIVE", endsAt: null },
      create: { organizationId, projectId, employeeId: employee.id, role: parsed.data.role, allocationPercent: parsed.data.allocationPercent, startsAt: new Date(), createdByUserId: session.userId },
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PROJECT_MEMBER_ADDED", entity: "EnterpriseProjectMember", entityId: member.id, request: req, metadata: { organizationId, projectId } });
  } else {
    const updated = await prisma.enterpriseProjectMember.updateMany({ where: { organizationId, projectId, employeeId: employee.id, status: "ACTIVE" }, data: { status: "REMOVED", endsAt: new Date() } });
    if (updated.count === 0) return NextResponse.json({ error: "Not found", message: "Ce collaborateur n’est pas actif dans le projet." }, { status: 404 });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PROJECT_MEMBER_REMOVED", entity: "EnterpriseProject", entityId: projectId, request: req, metadata: { organizationId, employeeId: employee.id } });
  }
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, projectId, action: parsed.data.action } });
  return NextResponse.json({ ok: true });
}
