import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { inventoryCountDecisionSchema } from "@/lib/enterprise/inventory/schemas";
import { decideEnterpriseInventoryCount } from "@/lib/enterprise/inventory/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; countId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-inventory-count-decision:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, countId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "approve" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inventoryCountDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision invalide." }, { status: 400 });
  try {
    const count = await decideEnterpriseInventoryCount(organizationId, countId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_INVENTORY_COUNT_${parsed.data.decision}`, entity: "EnterpriseInventoryCount", entityId: count.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory-counts", action: parsed.data.decision } });
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "INVENTORY_COUNT_DECISION_FAILED");
  }
}
