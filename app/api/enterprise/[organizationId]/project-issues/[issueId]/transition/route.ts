import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { transitionEnterpriseProjectIssue } from "@/lib/enterprise/projects-assets/project-controls";
import { projectIssueTransitionSchema } from "@/lib/enterprise/projects-assets/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; issueId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-project-issue-transition:${session.userId}`), 120, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, issueId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = projectIssueTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const issue = await transitionEnterpriseProjectIssue(organizationId, issueId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_PROJECT_ISSUE_${parsed.data.action}`, entity: "EnterpriseProjectIssue", entityId: issueId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, issueId, domain: "project-issues", action: parsed.data.action } });
    return NextResponse.json({ ok: true, issue });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PROJECT_ISSUE_TRANSITION_FAILED");
  }
}
