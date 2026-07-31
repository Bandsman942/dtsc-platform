import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { postEnterprisePurchaseReceiptToInventory, receiptInventoryPostSchema } from "@/lib/enterprise/procurement/common-domain-adapter";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; receiptId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-receipt-inventory-post:${session.userId}`), 100, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, receiptId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = receiptInventoryPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const result = await postEnterprisePurchaseReceiptToInventory(organizationId, receiptId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PURCHASE_RECEIPT_POSTED", entity: "EnterprisePurchaseReceiptOperationalLink", entityId: result.receiptLink.id, request: req, metadata: { organizationId, receiptId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, receiptId, domain: "purchase-receipts" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return enterpriseDomainErrorResponse(error, "PURCHASE_RECEIPT_POST_FAILED"); }
}
