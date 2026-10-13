import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { classifyAiAgentFailure } from "@/lib/ai/agent/failures";
import { getAiAgentRunForUser } from "@/lib/ai/agent/persistence";
import { getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  if (session.activeContext === "ORGANIZATION" && (!organizationId || !await requireActiveOrganizationMembership(session, organizationId))) {
    return NextResponse.json({ error: "ORGANIZATION_ACCESS_DENIED" }, { status: 403 });
  }
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
    failureCategory: classifyAiAgentFailure(run.reasonCode, run.status),
    budgetReason: run.status === "BUDGET_EXHAUSTED"
      && ["MAX_STEPS", "MAX_TOKENS", "MAX_ESTIMATED_COST", "MAX_DURATION", "MAX_TOOL_CALLS"].includes(run.reasonCode || "")
      ? run.reasonCode
      : null,
    cancelRequestedAt: run.cancelRequestedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelledAt: run.cancelledAt,
    steps: run.steps.map((step) => ({
      id: step.id,
      stepIndex: step.stepIndex,
      kind: step.kind,
      status: step.status,
      toolCode: step.toolCode,
      inputTokens: step.inputTokens,
      outputTokens: step.outputTokens,
      totalTokens: step.totalTokens,
      estimatedCost: Number(step.estimatedCost),
      durationMs: step.durationMs,
      createdAt: step.createdAt,
      completedAt: step.completedAt,
    })),
  };
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "ai_agent_run_read", runId: run.id, status: run.status } });
  return NextResponse.json(payload);
}
