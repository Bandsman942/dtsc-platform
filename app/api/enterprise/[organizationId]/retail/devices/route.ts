import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailDeviceProfiles, upsertRetailDeviceProfile } from "@/lib/enterprise/retail/customer-payments";
import { retailDeviceProfileUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const items = await listRetailDeviceProfiles(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-devices", action: "list", count: items.length } });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageDevices) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de configurer les périphériques POS." }, { status: 403 });
  const parsed = retailDeviceProfileUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Périphérique POS invalide." }, { status: 400 });
  try {
    const device = await upsertRetailDeviceProfile(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_DEVICE_UPSERTED", entity: "EnterpriseRetailDeviceProfile", entityId: device.id, request: req, metadata: { organizationId, siteId: device.siteId, code: device.code, deviceType: device.deviceType, connectionMode: device.connectionMode, status: device.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-devices", action: "upsert" } });
    return NextResponse.json({ ok: true, device });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_DEVICE_SAVE_FAILED");
  }
}
