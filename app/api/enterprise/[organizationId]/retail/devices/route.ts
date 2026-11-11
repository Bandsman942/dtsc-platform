import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { upsertRetailDeviceProfile } from "@/lib/enterprise/retail/customer-payments";
import { retailDeviceProfileUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { RETAIL_OWNER_ROLES, retailSitesForCapability } from "@/lib/enterprise/retail/site-access";
import { readRetailListDateRange } from "@/lib/enterprise/retail/list-date-range";
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
  const admin = await isRetailDeviceAdministrator(organizationId, auth.session.userId);
  const scope = admin ? null : await retailSitesForCapability(organizationId, auth.session.userId, "VIEW_SALES");
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page") || 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 12) || 12));
  const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
  const siteId = (url.searchParams.get("siteId") || "").trim();
  const deviceType = (url.searchParams.get("deviceType") || "").trim();
  let range: Awaited<ReturnType<typeof readRetailListDateRange>>;
  try { range = await readRetailListDateRange(req, organizationId); }
  catch (error) { return retailErrorResponse(error, "RETAIL_DEVICE_LIST_FAILED"); }
  if (siteId && !admin && !scope?.siteIds.includes(siteId)) return NextResponse.json({ error: "RETAIL_SITE_ACCESS_DENIED" }, { status: 403 });
  const where: Prisma.EnterpriseRetailDeviceProfileWhereInput = {
    organizationId, archivedAt: null,
    ...(admin ? (siteId ? { siteId } : {}) : { siteId: siteId || { in: scope?.siteIds || [] } }),
    ...(deviceType ? { deviceType } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { deviceType: { contains: search, mode: "insensitive" } }] } : {}),
    ...((range.from || range.toExclusive) ? { createdAt: { ...(range.from ? { gte: range.from } : {}),
      ...(range.toExclusive ? { lt: range.toExclusive } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailDeviceProfile.findMany({
      where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, code: true, name: true, siteId: true, deviceType: true, connectionMode: true,
        status: true, lastSeenAt: true, createdAt: true, updatedAt: true },
    }),
    prisma.enterpriseRetailDeviceProfile.count({ where }),
  ]);
  const permissions = admin ? await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId) : null;
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
    metadata: { organizationId, domain: "retail-devices", action: "list", page, pageSize, total } });
  return NextResponse.json({ items, canManage: Boolean(admin && permissions?.canManageDevices),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } },
    { headers: { "Cache-Control": "private, no-store" } });
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
