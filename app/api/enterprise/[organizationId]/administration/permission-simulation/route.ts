import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { enterprisePermissionSimulationSchema } from "@/lib/enterprise/governance/validators";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterprisePermissionSimulationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Simulation invalide." }, { status: 400 });
  const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: parsed.data.userId, status: "ACTIVE", removedAt: null }, select: { id: true, role: true, positionCode: true } });
  if (!member) return NextResponse.json({ error: "NOT_FOUND", message: "Collaborateur actif introuvable." }, { status: 404 });
  const decision = await resolveEnterpriseModuleAccess({ userId: parsed.data.userId, organizationId, moduleCode: parsed.data.moduleCode, action: parsed.data.action });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_PERMISSION_SIMULATED", entity: "OrganizationMember", entityId: member.id, request: req, reasonCode: decision.code, riskLevel: "MEDIUM", metadata: { subjectUserId: parsed.data.userId, moduleCode: parsed.data.moduleCode, action: parsed.data.action, allowed: decision.allowed } });
  return NextResponse.json({ simulation: { userId: parsed.data.userId, memberId: member.id, role: member.role, positionCode: member.positionCode, moduleCode: parsed.data.moduleCode, action: parsed.data.action, allowed: decision.allowed, reasonCode: decision.code, reason: decision.message, canonicalCode: decision.canonicalCode } });
}
