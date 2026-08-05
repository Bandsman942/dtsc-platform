import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { enterpriseOrganizationRoleAssignmentSchema } from "@/lib/enterprise/governance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-role-assignment:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseOrganizationRoleAssignmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Affectation invalide." }, { status: 400 });
  const [member, role] = await Promise.all([
    prisma.organizationMember.findFirst({ where: { id: parsed.data.memberId, organizationId, status: "ACTIVE", removedAt: null }, select: { id: true, userId: true } }),
    prisma.enterpriseOrganizationRole.findFirst({ where: { id: parsed.data.roleId, organizationId, isActive: true, archivedAt: null }, select: { id: true, code: true } }),
  ]);
  if (!member || !role) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Le collaborateur et le rôle doivent appartenir à la même entreprise." }, { status: 400 });
  if (parsed.data.action === "ASSIGN") {
    const assignment = await prisma.enterpriseOrganizationMemberRole.upsert({
      where: { organizationId_memberId_roleId: { organizationId, memberId: member.id, roleId: role.id } },
      create: { organizationId, memberId: member.id, roleId: role.id, assignedByUserId: session.userId, reason: parsed.data.reason || null },
      update: { revokedAt: null, assignedByUserId: session.userId, assignedAt: new Date(), reason: parsed.data.reason || null },
    });
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_ROLE_ASSIGNED", entity: "EnterpriseOrganizationMemberRole", entityId: assignment.id, request: req, reasonCode: "ROLE_ASSIGNED", riskLevel: "HIGH", metadata: { memberId: member.id, roleId: role.id, roleCode: role.code } });
    return NextResponse.json({ ok: true, assignment });
  }
  const assignment = await prisma.enterpriseOrganizationMemberRole.findFirst({ where: { organizationId, memberId: member.id, roleId: role.id, revokedAt: null } });
  if (!assignment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const updated = await prisma.enterpriseOrganizationMemberRole.update({ where: { id: assignment.id }, data: { revokedAt: new Date(), reason: parsed.data.reason || assignment.reason } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_ROLE_REVOKED", entity: "EnterpriseOrganizationMemberRole", entityId: assignment.id, request: req, reasonCode: "ROLE_REVOKED", riskLevel: "HIGH", metadata: { memberId: member.id, roleId: role.id, roleCode: role.code } });
  return NextResponse.json({ ok: true, assignment: updated });
}
