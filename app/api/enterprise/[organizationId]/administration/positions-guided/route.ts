import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { deriveTenantPermissionsFromCapabilities } from "@/lib/enterprise/governance/permission-catalog";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

const capabilitySchema = z.object({
  moduleCode: z.string().trim().min(2).max(120).regex(/^[A-Z0-9_]+$/),
  actions: z.array(z.enum(["read", "submit", "write", "approve", "manage"])).max(5).default([]),
});

const guidedPositionSchema = z.object({
  positionId: z.string().trim().min(1).max(180).optional().or(z.literal("")),
  locale: z.enum(["fr", "en"]).default("fr"),
  label: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  departmentId: z.string().trim().max(180).optional().or(z.literal("")),
  hierarchyLevel: z.coerce.number().int().min(1).max(99).default(1),
  isKeyPosition: z.boolean().default(false),
  isActive: z.boolean().default(true),
  capabilities: z.array(capabilitySchema).max(200).default([]),
});

function generatedPositionCode(label: string) {
  const slug = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "POSITION";
  return `CUSTOM_${slug}_${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-position-guided:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = guidedPositionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Poste invalide / Invalid position." }, { status: 400 });

  const data = parsed.data;
  if (data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "INVALID_DEPARTMENT", message: data.locale === "en" ? "The selected department is not active in this company." : "Le département sélectionné n’est pas actif dans cette entreprise." }, { status: 400 });
  }

  let derived: Awaited<ReturnType<typeof deriveTenantPermissionsFromCapabilities>>;
  try {
    derived = await deriveTenantPermissionsFromCapabilities({ organizationId, capabilities: data.capabilities });
  } catch {
    return NextResponse.json({
      error: "CAPABILITY_NOT_ALLOWED",
      message: data.locale === "en"
        ? "One selected capability is not available in this company. Refresh the page and choose from the proposed services."
        : "Une capacité sélectionnée n’est pas disponible dans cette entreprise. Rechargez la page et choisissez uniquement parmi les services proposés.",
    }, { status: 403 });
  }

  const existing = data.positionId
    ? await prisma.enterprisePosition.findFirst({ where: { id: data.positionId, organizationId }, select: { id: true, positionCode: true, labelFr: true, labelEn: true, permissionsJson: true } })
    : null;
  if (data.positionId && !existing) return NextResponse.json({ error: "POSITION_NOT_FOUND", message: data.locale === "en" ? "This position no longer exists in this company." : "Ce poste n’existe plus dans cette entreprise." }, { status: 404 });

  const positionCode = existing?.positionCode || generatedPositionCode(data.label);
  const before = existing || undefined;
  const position = await prisma.enterprisePosition.upsert({
    where: { organizationId_positionCode: { organizationId, positionCode } },
    create: {
      organizationId,
      positionCode,
      labelFr: data.label,
      labelEn: data.label,
      descriptionFr: data.description || null,
      descriptionEn: data.description || null,
      departmentId: data.departmentId || null,
      hierarchyLevel: data.hierarchyLevel,
      isActive: data.isActive,
      isKeyPosition: data.isKeyPosition,
      permissionsJson: derived.permissions as Prisma.InputJsonValue,
    },
    update: {
      labelFr: data.label,
      labelEn: data.label,
      descriptionFr: data.description || null,
      descriptionEn: data.description || null,
      departmentId: data.departmentId || null,
      hierarchyLevel: data.hierarchyLevel,
      isActive: data.isActive,
      isKeyPosition: data.isKeyPosition,
      permissionsJson: derived.permissions as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: existing ? "ENTERPRISE_POSITION_UPDATED_GUIDED" : "ENTERPRISE_POSITION_CREATED_GUIDED",
    entity: "EnterprisePosition",
    entityId: position.id,
    request: req,
    reasonCode: "POSITION_CAPABILITIES_GUIDED",
    riskLevel: "HIGH",
    before: before as unknown as Prisma.InputJsonValue | undefined,
    after: position as unknown as Prisma.InputJsonValue,
    metadata: { organizationId, moduleCount: derived.modules.length, permissionCount: derived.permissions.length },
  });
  return NextResponse.json({ ok: true, position }, { status: existing ? 200 : 201 });
}
