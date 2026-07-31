import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { linkEnterpriseSupplierToBusinessParty, supplierPartyLinkSchema } from "@/lib/enterprise/procurement/common-domain-adapter";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; supplierId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-party-link:${session.userId}`), 100, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, supplierId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = supplierPartyLinkSchema.safeParse({ ...body, supplierId });
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const result = await linkEnterpriseSupplierToBusinessParty(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SUPPLIER_PARTY_LINKED", entity: "EnterpriseSupplierPartyLink", entityId: result.link.id, request: req, metadata: { organizationId, supplierId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, supplierId, domain: "supplier-party-links" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return enterpriseDomainErrorResponse(error, "SUPPLIER_PARTY_LINK_FAILED"); }
}
