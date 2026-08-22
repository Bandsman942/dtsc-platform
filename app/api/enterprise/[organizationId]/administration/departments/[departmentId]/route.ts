import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; departmentId: string }> };

const departmentUpdateSchema = z.object({
  labelFr: z.string().trim().min(2, "Indiquez le nom du département.").max(120),
  labelEn: z.string().trim().max(120).optional().default(""),
  descriptionFr: z.string().trim().max(1200).optional().default(""),
  descriptionEn: z.string().trim().max(1200).optional().default(""),
  responsibleUserId: z.string().trim().nullable().optional(),
  parentDepartmentId: z.string().trim().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

async function canManage(userId: string, organizationId: string) {
  return (await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" })).allowed;
}

async function mutationContext(req: Request, organizationId: string, userId: string) {
  if (!isSameOriginRequest(req)) return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 }) };
  if (!(await canManage(userId, organizationId))) return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à modifier les départements." }, { status: 403 }) };
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-departments:${userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "RATE_LIMITED", message: "Trop de modifications successives. Réessayez plus tard." }, { status: 429 }) };
  return { ok: true as const };
}

async function createsDepartmentCycle(organizationId: string, departmentId: string, parentDepartmentId: string) {
  let cursor: string | null = parentDepartmentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === departmentId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const ancestor = await prisma.enterpriseDepartment.findFirst({
      where: { id: cursor, organizationId },
      select: { parentDepartmentId: true },
    });
    if (!ancestor) return false;
    cursor = ancestor.parentDepartmentId;
  }
  return false;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const { organizationId, departmentId } = await params;
  const context = await mutationContext(req, organizationId, session.userId);
  if (!context.ok) return context.response;
  const parsed = departmentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Vérifiez les informations du département." }, { status: 400 });

  const current = await prisma.enterpriseDepartment.findFirst({ where: { id: departmentId, organizationId } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND", message: "Ce département est introuvable dans cette entreprise." }, { status: 404 });
  const responsibleUserId = parsed.data.responsibleUserId || null;
  const parentDepartmentId = parsed.data.parentDepartmentId || null;
  if (parentDepartmentId === departmentId) return NextResponse.json({ error: "INVALID_PARENT", message: "Un département ne peut pas être son propre parent." }, { status: 400 });
  const [responsibleMember, parentDepartment] = await Promise.all([
    responsibleUserId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: responsibleUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }) : Promise.resolve(null),
    parentDepartmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: parentDepartmentId, organizationId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (responsibleUserId && !responsibleMember) return NextResponse.json({ error: "INVALID_RESPONSIBLE", message: "Le responsable choisi n’est pas un collaborateur actif de cette entreprise." }, { status: 400 });
  if (parentDepartmentId && !parentDepartment) return NextResponse.json({ error: "INVALID_PARENT", message: "Le département parent choisi n’est plus disponible." }, { status: 400 });
  if (parentDepartmentId && await createsDepartmentCycle(organizationId, departmentId, parentDepartmentId)) {
    return NextResponse.json({ error: "DEPARTMENT_CYCLE", message: "Ce déplacement créerait un cycle dans la hiérarchie des départements." }, { status: 409 });
  }

  const updated = await prisma.enterpriseDepartment.update({
    where: { id: departmentId },
    data: {
      labelFr: parsed.data.labelFr,
      labelEn: parsed.data.labelEn || parsed.data.labelFr,
      descriptionFr: parsed.data.descriptionFr || null,
      descriptionEn: parsed.data.descriptionEn || parsed.data.descriptionFr || null,
      responsibleUserId,
      parentDepartmentId,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_DEPARTMENT_UPDATED",
    entity: "EnterpriseDepartment",
    entityId: updated.id,
    request: req,
    reasonCode: "DEPARTMENT_UPDATED",
    riskLevel: "LOW",
    before: current as unknown as Prisma.InputJsonValue,
    after: updated as unknown as Prisma.InputJsonValue,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, departmentId } });
  return NextResponse.json({ ok: true, department: updated, message: `Le département « ${updated.labelFr} » a été mis à jour.` });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const { organizationId, departmentId } = await params;
  const context = await mutationContext(req, organizationId, session.userId);
  if (!context.ok) return context.response;
  const current = await prisma.enterpriseDepartment.findFirst({ where: { id: departmentId, organizationId } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND", message: "Ce département est introuvable dans cette entreprise." }, { status: 404 });

  const linkedPositions = await prisma.enterprisePosition.findMany({
    where: { organizationId, departmentId },
    select: { id: true },
  });
  const positionIds = linkedPositions.map((position) => position.id);
  const [memberCount, childCount] = await Promise.all([
    positionIds.length
      ? prisma.organizationMember.count({ where: { organizationId, removedAt: null, positionId: { in: positionIds } } })
      : Promise.resolve(0),
    prisma.enterpriseDepartment.count({ where: { organizationId, parentDepartmentId: departmentId, isActive: true } }),
  ]);
  const positionCount = linkedPositions.length;
  const updated = await prisma.enterpriseDepartment.update({ where: { id: departmentId }, data: { isActive: false } });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_DEPARTMENT_DEACTIVATED",
    entity: "EnterpriseDepartment",
    entityId: updated.id,
    request: req,
    reasonCode: "DEPARTMENT_DEACTIVATED",
    riskLevel: "MEDIUM",
    metadata: { organizationId, departmentLabel: updated.labelFr, linkedPositions: positionCount, linkedMembers: memberCount, childDepartments: childCount },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, departmentId } });
  return NextResponse.json({
    ok: true,
    department: updated,
    message: positionCount + memberCount + childCount > 0
      ? `« ${updated.labelFr} » a été désactivé sans supprimer son historique ni ses rattachements.`
      : `« ${updated.labelFr} » a été désactivé.`,
  });
}
