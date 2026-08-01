import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { storageLocationCreateSchema, storageLocationUpdateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseStorageLocation, updateEnterpriseStorageLocation } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const items = await prisma.enterpriseStorageLocation.findMany({
    where: { organizationId, archivedAt: null, ...(warehouseId ? { warehouseId } : {}) },
    orderBy: [{ warehouseId: "asc" }, { parentLocationId: "asc" }, { code: "asc" }],
    include: { warehouse: { select: { id: true, code: true, name: true, site: { select: { id: true, code: true, name: true } } } } },
    take: 500,
  });
  return NextResponse.json({ items, pagination: { page: 1, pageSize: items.length, total: items.length, pageCount: 1 }, canManage: access.canManage });
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
    const entity = await updateEnterpriseStorageLocation(organizationId, entityId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STORAGE_LOCATION_UPDATED", entity: "EnterpriseStorageLocation", entityId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, action: "update" } });
    return NextResponse.json({ ok: true, entity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const conflict = message === "REVISION_CONFLICT";
    return NextResponse.json({ error: message, message: conflict ? "L’élément a été modifié par un autre utilisateur. Actualisez avant de réessayer." : "Modification impossible." }, { status: conflict ? 409 : 400 });
  }
}
