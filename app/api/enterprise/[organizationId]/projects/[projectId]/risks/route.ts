import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseProjectRisk } from "@/lib/enterprise/projects-assets/projects";
import { projectRiskCreateSchema } from "@/lib/enterprise/projects-assets/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; projectId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-project-risk:${session.userId}`), 150, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, projectId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = projectRiskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const risk = await createEnterpriseProjectRisk(organizationId, projectId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PROJECT_RISK_CREATED", entity: "EnterpriseProjectRisk", entityId: risk.id, request: req, metadata: { organizationId, projectId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, projectId, domain: "project-risks" } });
    return NextResponse.json({ ok: true, risk }, { status: 201 });
  } catch (error) { return enterpriseDomainErrorResponse(error, "PROJECT_RISK_CREATE_FAILED"); }
}
