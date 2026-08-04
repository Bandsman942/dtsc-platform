import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { enterpriseOrganizationRoleSchema } from "@/lib/enterprise/governance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const roles = await prisma.enterpriseOrganizationRole.findMany({
    where: { organizationId, archivedAt: null },
    include: { assignments: { where: { revokedAt: null }, select: { id: true, memberId: true, assignedAt: true } } },
    orderBy: [{ isSystem: "desc" }, { labelFr: "asc" }],
  });
  return NextResponse.json({ roles });
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-role:${session.userId}`), 50, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseOrganizationRoleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Rôle invalide." }, { status: 400 });
  const role = await prisma.enterpriseOrganizationRole.create({ data: {
    organizationId,
    code: parsed.data.code,
    labelFr: parsed.data.labelFr,
    labelEn: parsed.data.labelEn,
    descriptionFr: parsed.data.descriptionFr || null,
    descriptionEn: parsed.data.descriptionEn || null,
    permissionsJson: parsed.data.permissions as Prisma.InputJsonValue,
    modulesJson: parsed.data.modules as Prisma.InputJsonValue,
    isActive: parsed.data.isActive,
    isSystem: false,
    createdByUserId: session.userId,
  } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_ROLE_CREATED", entity: "EnterpriseOrganizationRole", entityId: role.id, request: req, reasonCode: "ROLE_CREATED", riskLevel: "HIGH", after: role as unknown as Prisma.InputJsonValue });
  return NextResponse.json({ ok: true, role }, { status: 201 });
}
