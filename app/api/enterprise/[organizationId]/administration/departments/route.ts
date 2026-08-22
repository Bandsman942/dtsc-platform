import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

const departmentSchema = z.object({
  labelFr: z.string().trim().min(2, "Indiquez le nom du département.").max(120),
  labelEn: z.string().trim().max(120).optional().default(""),
  descriptionFr: z.string().trim().max(1200).optional().default(""),
  descriptionEn: z.string().trim().max(1200).optional().default(""),
  responsibleUserId: z.string().trim().nullable().optional(),
  parentDepartmentId: z.string().trim().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

function departmentCode(label: string) {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 48);
  return normalized || "DEPARTMENT";
}

async function canManage(userId: string, organizationId: string) {
  return (await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" })).allowed;
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canManage(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à créer un département." }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-departments:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de modifications successives. Réessayez plus tard." }, { status: 429 });
  const parsed = departmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Vérifiez les informations du département." }, { status: 400 });

  const responsibleUserId = parsed.data.responsibleUserId || null;
  const parentDepartmentId = parsed.data.parentDepartmentId || null;
  const [responsibleMember, parentDepartment] = await Promise.all([
    responsibleUserId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: responsibleUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }) : Promise.resolve(null),
    parentDepartmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: parentDepartmentId, organizationId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (responsibleUserId && !responsibleMember) return NextResponse.json({ error: "INVALID_RESPONSIBLE", message: "Le responsable choisi n’est pas un collaborateur actif de cette entreprise." }, { status: 400 });
  if (parentDepartmentId && !parentDepartment) return NextResponse.json({ error: "INVALID_PARENT", message: "Le département parent choisi n’est plus disponible." }, { status: 400 });

  const baseCode = departmentCode(parsed.data.labelFr);
  const collisionCount = await prisma.enterpriseDepartment.count({ where: { organizationId, departmentCode: { startsWith: baseCode } } });
  const code = collisionCount === 0 ? baseCode : `${baseCode}_${collisionCount + 1}`;
  const created = await prisma.enterpriseDepartment.create({
    data: {
      organizationId,
      departmentCode: code,
      labelFr: parsed.data.labelFr,
      labelEn: parsed.data.labelEn || parsed.data.labelFr,
      descriptionFr: parsed.data.descriptionFr || null,
      descriptionEn: parsed.data.descriptionEn || parsed.data.descriptionFr || null,
      responsibleUserId,
      parentDepartmentId,
      sortOrder: parsed.data.sortOrder,
      isActive: true,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_DEPARTMENT_CREATED",
    entity: "EnterpriseDepartment",
    entityId: created.id,
    request: req,
    reasonCode: "DEPARTMENT_CREATED",
    riskLevel: "LOW",
    metadata: { organizationId, departmentLabel: created.labelFr },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, departmentId: created.id } });
  return NextResponse.json({ ok: true, department: created, message: `Le département « ${created.labelFr} » a été créé.` }, { status: 201 });
}
