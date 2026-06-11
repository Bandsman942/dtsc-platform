import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreAccess } from "@/lib/enterprise/enterprise-core-access";
import {
  canUseRecordType,
  createEnterpriseCoreRecord,
  enterpriseCoreVisibilityWhere,
  isEnterpriseCoreModuleCode,
} from "@/lib/enterprise/enterprise-core";
import { enterpriseCoreCreateSchema } from "@/lib/enterprise/enterprise-core-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const url = new URL(req.url);
  const moduleCode = url.searchParams.get("moduleCode") || "";
  if (!isEnterpriseCoreModuleCode(moduleCode)) {
    return NextResponse.json({ error: "Invalid module", message: "Le module commun demandé est invalide." }, { status: 400 });
  }
  const access = await getEnterpriseCoreAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.enterpriseCoreRecord.findMany({
    where: enterpriseCoreVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll, moduleCode }),
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 100,
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 4 },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 4 },
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode } });
  return NextResponse.json({ records, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-core:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d’actions sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const parsed = enterpriseCoreCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: "Vérifiez les informations saisies." }, { status: 400 });
  }
  const data = parsed.data;
  if (!isEnterpriseCoreModuleCode(data.moduleCode) || !canUseRecordType(data.moduleCode, data.recordType)) {
    return NextResponse.json({ error: "Invalid record type", message: "Ce type d’élément ne correspond pas au module choisi." }, { status: 400 });
  }
  const coreModuleCode = data.moduleCode;
  const access = await getEnterpriseCoreAccess({ session, organizationId, moduleCode: coreModuleCode, action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const relatedUserIds = [data.assignedToUserId, data.validatorUserId].filter((value): value is string => Boolean(value));
  if (relatedUserIds.length) {
    const memberCount = await prisma.organizationMember.count({
      where: { organizationId, userId: { in: relatedUserIds }, status: "ACTIVE", removedAt: null },
    });
    if (memberCount !== new Set(relatedUserIds).size) {
      return NextResponse.json({ error: "Invalid collaborator", message: "Les responsables doivent être des collaborateurs actifs de cette entreprise." }, { status: 400 });
    }
  }
  if (data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "Invalid department", message: "Le département sélectionné est invalide." }, { status: 400 });
  }

  const dueAt = data.dueAt instanceof Date ? data.dueAt : undefined;
  const amount = typeof data.amount === "number" ? Number(data.amount) : undefined;
  const record = await createEnterpriseCoreRecord({
    organizationId,
    actorUserId: session.userId,
    data: {
      ...data,
      moduleCode: coreModuleCode,
      dueAt,
      amount,
      description: data.description || undefined,
      assignedToUserId: data.assignedToUserId || undefined,
      validatorUserId: data.validatorUserId || undefined,
      departmentId: data.departmentId || undefined,
      currency: data.currency || undefined,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_CORE_RECORD_CREATED",
    entity: "EnterpriseCoreRecord",
    entityId: record.id,
    request: req,
    metadata: { organizationId, moduleCode: data.moduleCode, recordType: data.recordType },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: data.moduleCode } });
  return NextResponse.json({ ok: true, record }, { status: 201 });
}
