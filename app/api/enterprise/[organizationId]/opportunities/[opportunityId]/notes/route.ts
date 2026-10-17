import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog, writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { addEnterpriseOpportunityNote } from "@/lib/enterprise/crm-sales/service";
import { opportunityNoteCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; opportunityId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-opportunity-notes:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, opportunityId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = opportunityNoteCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Note invalide." }, { status: 400 });
  try {
    const result = await addEnterpriseOpportunityNote(organizationId, opportunityId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: "ENTERPRISE_OPPORTUNITY_NOTE_ADDED", entity: "EnterpriseOpportunity", entityId: opportunityId, request: req, metadata: { organizationId, noteId: result.note.id } }),
      writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "opportunities", action: "note" } }),
    ]);
    return NextResponse.json({ ok: true, revision: result.revision }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "OPPORTUNITY_NOTE_FAILED", req);
  }
}
