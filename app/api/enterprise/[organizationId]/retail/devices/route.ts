import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailDeviceProfiles, upsertRetailDeviceProfile } from "@/lib/enterprise/retail/customer-payments";
import { retailDeviceProfileUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

async function isRetailDeviceAdministrator(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null, role: { in: [...RETAIL_OWNER_ROLES] } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  if (!await isRetailDeviceAdministrator(organizationId, auth.session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Legacy callers remain compatible; new POS 2.0 consumers request explicit server pagination.
  const params = new URL(req.url).searchParams;
  if (!params.has("page") && !params.has("search") && !params.has("type")) {
    const items = await listRetailDeviceProfiles(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-devices", action: "list", count: items.length } });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const page = Math.max(1, Math.min(1000, Number(params.get("page") || "1") || 1));
  const pageSize = Math.max(5, Math.min(50, Number(params.get("pageSize") || "12") || 12));
  const search = (params.get("search") || "").trim().slice(0, 120);
  const type = (params.get("type") || "").trim().toUpperCase();
  const where: Prisma.EnterpriseRetailDeviceProfileWhereInput = {
    organizationId, archivedAt: null,
    ...(type ? { deviceType: type } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailDeviceProfile.findMany({ where, orderBy: [{ siteId: "asc" }, { deviceType: "asc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailDeviceProfile.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-devices", action: "list", count: items.length, page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  if (!await isRetailDeviceAdministrator(organizationId, auth.session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageDevices) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de configurer les périphériques POS." }, { status: 403 });
  const parsed = retailDeviceProfileUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_DEVICE_INPUT_INVALID", req);
  try {
    const device = await upsertRetailDeviceProfile(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_DEVICE_UPSERTED", entity: "EnterpriseRetailDeviceProfile", entityId: device.id, request: req, metadata: { organizationId, siteId: device.siteId, code: device.code, deviceType: device.deviceType, connectionMode: device.connectionMode, status: device.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-devices", action: "upsert" } });
    return NextResponse.json({ ok: true, device });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_DEVICE_SAVE_FAILED");
  }
}
