import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { deriveTenantPermissionsFromCapabilities } from "@/lib/enterprise/governance/permission-catalog";
import { enterpriseOrganizationGuidedRoleSchema } from "@/lib/enterprise/governance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

function generatedRoleCode(label: string) {
  const slug = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "ROLE";
  return `CUSTOM_${slug}_${randomUUID().slice(0, 8).toUpperCase()}`;
}

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
  const parsed = enterpriseOrganizationGuidedRoleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || (parsed.data?.locale === "en" ? "Invalid role." : "Rôle invalide.") }, { status: 400 });

  let derived: Awaited<ReturnType<typeof deriveTenantPermissionsFromCapabilities>>;
  try {
    derived = await deriveTenantPermissionsFromCapabilities({ organizationId, capabilities: parsed.data.capabilities });
  } catch {
    return NextResponse.json({
      error: "CAPABILITY_NOT_ALLOWED",
      message: parsed.data.locale === "en"
        ? "One selected capability is not available in this company. Refresh the page and choose from the proposed services."
        : "Une capacité sélectionnée n’est pas disponible dans cette entreprise. Rechargez la page et choisissez uniquement parmi les services proposés.",
    }, { status: 403 });
  }

  const role = await prisma.enterpriseOrganizationRole.create({ data: {
    organizationId,
    code: generatedRoleCode(parsed.data.label),
    labelFr: parsed.data.label,
    labelEn: parsed.data.label,
    descriptionFr: parsed.data.description || null,
    descriptionEn: parsed.data.description || null,
    permissionsJson: derived.permissions as Prisma.InputJsonValue,
    modulesJson: derived.modules as Prisma.InputJsonValue,
    isActive: parsed.data.isActive,
    isSystem: false,
    createdByUserId: session.userId,
  } });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_ROLE_CREATED",
    entity: "EnterpriseOrganizationRole",
    entityId: role.id,
    request: req,
    reasonCode: "ROLE_CREATED_FROM_GUIDED_CAPABILITIES",
    riskLevel: "HIGH",
    after: role as unknown as Prisma.InputJsonValue,
    metadata: { organizationId, moduleCount: derived.modules.length, permissionCount: derived.permissions.length },
  });
  return NextResponse.json({ ok: true, role }, { status: 201 });
}