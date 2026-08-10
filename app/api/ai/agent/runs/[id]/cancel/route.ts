import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { requestAiAgentCancellation } from "@/lib/ai/agent/persistence";
import { getActiveOrganizationId } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "ai_agent_cancel_origin_denied" } });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `ai-agent-cancel:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const cancelled = await requestAiAgentCancellation({ runId: id, userId: session.userId, organizationId });
  if (!cancelled) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { action: "ai_agent_cancel_not_found", runId: id } });
    return NextResponse.json({ error: "AGENT_RUN_NOT_CANCELLABLE" }, { status: 404 });
  }
  await writeApiLog({ request: req, statusCode: 202, userId: session.userId, startedAt, metadata: { action: "ai_agent_cancel_requested", runId: id } });
  return NextResponse.json({ ok: true, runId: id, status: "CANCELLATION_REQUESTED" }, { status: 202 });
}
