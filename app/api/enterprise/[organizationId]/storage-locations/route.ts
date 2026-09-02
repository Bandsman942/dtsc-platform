import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { assertStorageLocationCanBecomeInactive, locationIntegrityMessage } from "@/lib/enterprise/master-data/location-integrity";
import { storageLocationCreateSchema, storageLocationUpdateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseStorageLocation, updateEnterpriseStorageLocation } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseStorageLocationWhereInput = {
    organizationId,
    archivedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { barcode: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseStorageLocation.findMany({
      where,
      orderBy: [{ warehouseId: "asc" }, { parentLocationId: "asc" }, { code: "asc" }],
      include: { warehouse: { select: { id: true, code: true, name: true, site: { select: { id: true, code: true, name: true } } } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.enterpriseStorageLocation.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "storage-locations", page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-storage-location-create:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = storageLocationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Emplacement invalide." }, { status: 400 });
  try {
    const location = await createEnterpriseStorageLocation(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STORAGE_LOCATION_CREATED", entity: "EnterpriseStorageLocation", entityId: location.id, request: req, metadata: { organizationId, warehouseId: parsed.data.warehouseId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "storage-locations" } });
    return NextResponse.json({ ok: true, location }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "STORAGE_LOCATION_DUPLICATE" : "STORAGE_LOCATION_CREATE_FAILED", message: duplicate ? "Cet emplacement existe déjà dans l’entrepôt." : "Création de l’emplacement impossible." }, { status: duplicate ? 409 : 400 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null) as (Record<string, unknown> & { locationId?: string }) | null;
  const entityId = typeof raw?.locationId === "string" ? raw.locationId : "";
  const parsed = storageLocationUpdateSchema.safeParse(raw);
  if (!entityId || !parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.success ? "Référence manquante." : parsed.error.issues[0]?.message || "Emplacement invalide." }, { status: 400 });
  try {
    if (parsed.data.status === "INACTIVE") await prisma.$transaction((tx) => assertStorageLocationCanBecomeInactive(tx, organizationId, entityId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const entity = await updateEnterpriseStorageLocation(organizationId, entityId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STORAGE_LOCATION_UPDATED", entity: "EnterpriseStorageLocation", entityId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, action: "update" } });
    return NextResponse.json({ ok: true, entity });
  } catch (error) {
    const integrityMessage = locationIntegrityMessage(error);
    if (integrityMessage) return NextResponse.json({ error: error instanceof Error ? error.message : "STORAGE_LOCATION_INTEGRITY_CONFLICT", message: integrityMessage }, { status: 409 });
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const conflict = message === "REVISION_CONFLICT";
    return NextResponse.json({ error: message, message: conflict ? "L’élément a été modifié par un autre utilisateur. Actualisez avant de réessayer." : "Modification impossible." }, { status: conflict ? 409 : 400 });
  }
}
