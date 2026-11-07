import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse, enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { receiveEnterpriseStockTransfer } from "@/lib/enterprise/inventory/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; transferId: string }> };
const schema = z.object({ revision: z.number().int().positive(), comment: z.string().trim().max(2000).optional() }).strict();

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-stock-transfer-receive:${session.userId}`), 90, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, transferId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "STOCK_TRANSFER_RECEIVE_INPUT_INVALID", req);
  try {
    const transfer = await receiveEnterpriseStockTransfer(organizationId, transferId, session.userId, parsed.data.revision, parsed.data.comment);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STOCK_TRANSFER_RECEIVED", entity: "EnterpriseStockTransfer", entityId: transfer.id, request: req, metadata: { organizationId, receivedByUserId: session.userId, transferReference: transfer.reference } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-transfers", action: "receive" } });
    return NextResponse.json({ ok: true, transfer });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "STOCK_TRANSFER_RECEIVE_FAILED", req);
  }
}
