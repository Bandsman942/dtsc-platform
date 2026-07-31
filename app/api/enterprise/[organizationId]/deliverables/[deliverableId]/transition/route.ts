import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { transitionEnterpriseProjectDeliverable } from "@/lib/enterprise/projects-assets/projects";
import { projectDeliverableTransitionSchema } from "@/lib/enterprise/projects-assets/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; deliverableId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-deliverable-transition:${session.userId}`), 150, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, deliverableId } = await params;
  const payload = await req.json().catch(() => null);
  const parsed = projectDeliverableTransitionSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const action = ["ACCEPT", "REQUEST_CHANGES", "REJECT"].includes(parsed.data.action) ? "manage" : "write";
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_DELIVERABLES", action });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const deliverable = await transitionEnterpriseProjectDeliverable(organizationId, deliverableId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_DELIVERABLE_${parsed.data.action}`, entity: "EnterpriseProjectDeliverable", entityId: deliverable.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "project-deliverables", action: parsed.data.action } });
    return NextResponse.json({ ok: true, deliverable });
  } catch (error) { return enterpriseDomainErrorResponse(error, "PROJECT_DELIVERABLE_TRANSITION_FAILED"); }
}
