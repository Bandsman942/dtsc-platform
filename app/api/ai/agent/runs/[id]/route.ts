import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getAiAgentRunForUser } from "@/lib/ai/agent/persistence";
import { getActiveOrganizationId } from "@/lib/organizations";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const run = await getAiAgentRunForUser({ runId: id, userId: session.userId, organizationId });
  if (!run) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { action: "ai_agent_run_not_found" } });
    return NextResponse.json({ error: "AGENT_RUN_NOT_FOUND" }, { status: 404 });
  }

  const payload = {
    id: run.id,
    scope: run.scope,
    executionClass: run.executionClass,
    contextCode: run.contextCode,
    assistantCode: run.assistantCode,
    status: run.status,
    currentStep: run.currentStep,
    toolCallCount: run.toolCallCount,
    limits: {
      maxSteps: run.maxSteps,
      maxToolCalls: run.maxToolCalls,
      maxTokens: run.maxTokens,
      maxEstimatedCost: Number(run.maxEstimatedCost),
      maxDurationMs: run.maxDurationMs,
    },
    usage: {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      totalTokens: run.totalTokens,
      estimatedCost: Number(run.estimatedCost),
    },
    pendingConfirmationId: run.pendingConfirmationId,
    reasonCode: run.reasonCode,
    cancelRequestedAt: run.cancelRequestedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelledAt: run.cancelledAt,
    steps: run.steps.map((step) => ({
      ...step,
      estimatedCost: Number(step.estimatedCost),
    })),
  };
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "ai_agent_run_read", runId: run.id, status: run.status } });
  return NextResponse.json(payload);
}
