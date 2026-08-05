import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { enterpriseOrganizationRoleUpdateSchema } from "@/lib/enterprise/governance/validators";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; roleId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, roleId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const existing = await prisma.enterpriseOrganizationRole.findFirst({ where: { id: roleId, organizationId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = enterpriseOrganizationRoleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Rôle invalide." }, { status: 400 });
  if (existing.isSystem && (parsed.data.archived || parsed.data.code || parsed.data.permissions || parsed.data.modules)) {
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_SYSTEM_ROLE_CHANGE_BLOCKED", entity: "EnterpriseOrganizationRole", entityId: roleId, request: req, result: "DENIED", reasonCode: "ROLE_SYSTEM_PROTECTED", riskLevel: "CRITICAL" });
    return NextResponse.json({ error: "ROLE_SYSTEM_PROTECTED", message: "Ce rôle système critique ne peut pas être supprimé ni redéfini." }, { status: 409 });
  }
  const role = await prisma.enterpriseOrganizationRole.update({ where: { id: roleId }, data: {
    ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
    ...(parsed.data.labelFr !== undefined ? { labelFr: parsed.data.labelFr } : {}),
    ...(parsed.data.labelEn !== undefined ? { labelEn: parsed.data.labelEn } : {}),
    ...(parsed.data.descriptionFr !== undefined ? { descriptionFr: parsed.data.descriptionFr || null } : {}),
    ...(parsed.data.descriptionEn !== undefined ? { descriptionEn: parsed.data.descriptionEn || null } : {}),
    ...(parsed.data.permissions !== undefined ? { permissionsJson: parsed.data.permissions as Prisma.InputJsonValue } : {}),
    ...(parsed.data.modules !== undefined ? { modulesJson: parsed.data.modules as Prisma.InputJsonValue } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    ...(parsed.data.archived ? { archivedAt: new Date(), isActive: false } : {}),
  } });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_ROLE_UPDATED", entity: "EnterpriseOrganizationRole", entityId: role.id, request: req, reasonCode: parsed.data.archived ? "ROLE_ARCHIVED" : "ROLE_UPDATED", riskLevel: "HIGH", before: existing as unknown as Prisma.InputJsonValue, after: role as unknown as Prisma.InputJsonValue });
  return NextResponse.json({ ok: true, role });
}
