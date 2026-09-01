import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { classifyAiAgentFailure, getAiAgentClientFailureMessage } from "@/lib/ai/agent/failures";
import { resumeAiAgentRun, AiAgentResumeError } from "@/lib/ai/agent/resume";
import { getActiveOrganizationId } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 60;

function requestLocale(req: Request) {
  return req.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
}

function safeFailureResponse(req: Request, reasonCode: string, statusCode: number) {
  const failureCategory = classifyAiAgentFailure(reasonCode, statusCode === 429 ? "BUDGET_EXHAUSTED" : "FAILED") || "UNAVAILABLE";
  return NextResponse.json({
    error: "AGENT_RESUME_UNAVAILABLE",
    failureCategory,
    message: getAiAgentClientFailureMessage(failureCategory, requestLocale(req)),
  }, { status: statusCode });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "ai_agent_resume_origin_denied" } });
    return safeFailureResponse(req, "FORBIDDEN", 403);
  }

  const session = await getSession();
  if (!session) return safeFailureResponse(req, "UNAUTHORIZED", 401);
  const limited = await rateLimit(getRateLimitKey(req, `ai-agent-resume:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return safeFailureResponse(req, "RATE_LIMITED", 429);

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  try {
    const resumed = await resumeAiAgentRun({ runId: id, session, organizationId, request: req });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { action: "ai_agent_resume_started", runId: id, scope: resumed.scope },
    });
    return new Response(resumed.stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-AI-Execution": "AGENT_RESUME_V1",
        "X-AI-Agent-Run-Id": resumed.runId,
      },
    });
  } catch (error) {
    const statusCode = error instanceof AiAgentResumeError ? error.statusCode : 500;
    const reasonCode = error instanceof AiAgentResumeError ? error.code : "AGENT_RESUME_FAILED";
    await writeApiLog({
      request: req,
      statusCode,
      userId: session.userId,
      startedAt,
      metadata: { action: "ai_agent_resume_failed", runId: id, reasonCode },
    });
    return safeFailureResponse(req, reasonCode, statusCode);
  }
}
