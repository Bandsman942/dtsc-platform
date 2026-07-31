import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { quoteTransitionSchema } from "@/lib/enterprise/crm-sales/schemas";
import { transitionEnterpriseQuote } from "@/lib/enterprise/crm-sales/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; quoteId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-quote-transition:${session.userId}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, quoteId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = quoteTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transition invalide." }, { status: 400 });
  try {
    const quote = await transitionEnterpriseQuote(organizationId, quoteId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_QUOTE_TRANSITIONED", entity: "EnterpriseQuote", entityId: quote.id, request: req, metadata: { organizationId, targetStatus: parsed.data.targetStatus } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "quotes", action: "transition" } });
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "QUOTE_TRANSITION_FAILED");
  }
}
