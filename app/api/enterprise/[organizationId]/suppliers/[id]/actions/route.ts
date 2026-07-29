import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { transitionEnterpriseSupplier } from "@/lib/enterprise/procurement/supplier-service";
import { enterpriseSupplierActionSchema } from "@/lib/enterprise/procurement/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-action:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "manage" }); if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseSupplierActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Action invalide." }, { status: 400 });
  try {
    const supplier = await transitionEnterpriseSupplier(organizationId, id, session.userId, parsed.data);
    const auditAction = parsed.data.action === "SUSPEND" ? "ENTERPRISE_SUPPLIER_SUSPENDED" : parsed.data.action === "ARCHIVE" ? "ENTERPRISE_SUPPLIER_ARCHIVED" : "ENTERPRISE_SUPPLIER_UPDATED";
    await writeAuditLog({ userId: session.userId, action: auditAction, entity: "EnterpriseSupplier", entityId: id, request: req, metadata: { organizationId, action: parsed.data.action } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "suppliers", supplierId: id, action: parsed.data.action } });
    return NextResponse.json({ ok: true, supplier });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
