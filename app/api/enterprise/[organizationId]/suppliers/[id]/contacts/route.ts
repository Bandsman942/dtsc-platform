import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { addEnterpriseSupplierContact } from "@/lib/enterprise/procurement/supplier-service";
import { enterpriseSupplierContactCreateSchema } from "@/lib/enterprise/procurement/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-contact:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseSupplierContactCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Contact invalide." }, { status: 400 });
  try {
    const contact = await addEnterpriseSupplierContact(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SUPPLIER_CONTACT_CREATED", entity: "EnterpriseSupplier", entityId: id, request: req, metadata: { organizationId, contactId: contact.id } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "suppliers", supplierId: id } });
    return NextResponse.json({ ok: true, contact }, { status: 201 });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
