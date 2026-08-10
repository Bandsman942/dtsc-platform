import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { markAiAgentReadyAfterConfirmation } from "@/lib/ai/agent/persistence";
import { confirmAiToolConfirmation, getPendingAiToolConfirmation } from "@/lib/ai/tools/confirmation";
import { executeAiTool } from "@/lib/ai/tools/execute";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ confirmationId: z.string().uuid() }).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "ai_tool_confirm_origin_denied" } });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `ai-tool-confirm:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const organizationId = session.activeContext === "ORGANIZATION" ? session.activeOrganizationId || null : null;
  const baseContext = { session, userId: session.userId, organizationId, request: req };
  const pending = await getPendingAiToolConfirmation({ confirmationId: parsed.data.confirmationId, context: baseContext });
  if (!pending || !pending.argumentsJson) {
    return NextResponse.json({ error: "CONFIRMATION_NOT_FOUND_OR_EXPIRED" }, { status: 404 });
  }

  const context = {
    ...baseContext,
    conversationId: pending.conversationId,
    turnId: pending.turnId,
  };
  const confirmed = await confirmAiToolConfirmation({
    confirmationId: pending.id,
    toolCode: pending.toolCode,
    args: pending.argumentsJson,
    context,
  });
  if (!confirmed) return NextResponse.json({ error: "CONFIRMATION_INVALID_OR_EXPIRED" }, { status: 409 });

  const execution = await executeAiTool({
    toolCode: pending.toolCode,
    args: pending.argumentsJson,
    context,
    confirmationId: pending.id,
  });
  if (execution.ok) {
    await markAiAgentReadyAfterConfirmation({ confirmationId: pending.id, userId: session.userId });
  }
  const statusCode = execution.ok ? 200 : execution.status === "DENIED" ? 403 : 409;
  await writeApiLog({
    request: req,
    statusCode,
    userId: session.userId,
    startedAt,
    metadata: {
      action: "ai_tool_confirm_execute",
      toolCode: pending.toolCode,
      confirmationId: pending.id,
      executionStatus: execution.status,
      auditId: execution.auditId || null,
      agentRunReady: execution.ok,
    },
  });
  return NextResponse.json(execution, { status: statusCode });
}
