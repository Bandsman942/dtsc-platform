import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { leadTransitionSchema } from "@/lib/enterprise/crm-sales/schemas";
import { transitionEnterpriseLead } from "@/lib/enterprise/crm-sales/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; leadId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-lead-transition:${session.userId}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, leadId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = leadTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transition invalide." }, { status: 400 });
  try {
    const lead = await transitionEnterpriseLead(organizationId, leadId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_LEAD_TRANSITIONED", entity: "EnterpriseLead", entityId: lead.id, request: req, metadata: { organizationId, targetStatus: parsed.data.targetStatus } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "leads", action: "transition" } });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "LEAD_TRANSITION_FAILED");
  }
}
