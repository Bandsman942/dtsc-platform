import { Prisma } from "@prisma/client";
import { decideEnterpriseApproval } from "@/lib/enterprise/core-v2/service";
import { decideEnterpriseBudgetApproval } from "@/lib/enterprise/finance/budget-service";
import { decideEnterpriseExpenseApproval } from "@/lib/enterprise/finance/expense-service";
import { decideEnterprisePurchaseApproval } from "@/lib/enterprise/procurement/purchase-service";
import { getWorkflowEntityAdapter, compareWorkflowCondition } from "@/lib/enterprise/workflows/adapters";
import { WORKFLOW_LIMITS, WORKFLOW_STEP_TYPES, type WorkflowStepType } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError, normalizeWorkflowError, safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { WORKFLOW_STEP_HANDLERS } from "@/lib/enterprise/workflows/steps";
import type { WorkflowStepHandlerContext, WorkflowStepHandlerResult } from "@/lib/enterprise/workflows/steps/types";
import { workflowConditionSchema } from "@/lib/enterprise/workflows/validators";
import { prisma } from "@/lib/prisma";

const ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "WAITING_TIME", "BLOCKED"];
const TERMINAL_RUN_STATUSES = ["COMPLETED", "REJECTED", "FAILED", "CANCELLED"];

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function outputOutcome(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "DEFAULT";
  const outcome = (value as Record<string, Prisma.JsonValue>).outcome;
  return typeof outcome === "string" ? outcome : "DEFAULT";
}

function payloadObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

async function timeline(input: { organizationId: string; runId: string; stepRunId?: string | null; eventType: string; status?: string | null; actorType?: "SYSTEM" | "USER"; actorUserId?: string | null; summary: string; metadata?: Prisma.InputJsonValue }) {
  return prisma.enterpriseWorkflowEvent.create({ data: { organizationId: input.organizationId, workflowRunId: input.runId, stepRunId: input.stepRunId || null, eventType: input.eventType, status: input.status || null, actorType: input.actorType || (input.actorUserId ? "USER" : "SYSTEM"), actorUserId: input.actorUserId || null, summary: input.summary, metadataJson: input.metadata } });
}

async function loadRun(runId: string) {
  const run = await prisma.enterpriseWorkflowRun.findUnique({
    where: { id: runId },
    include: {
      definition: true,
      version: {
        include: {
          steps: { orderBy: { position: "asc" } },
          transitions: { include: { fromStep: true, toStep: true }, orderBy: { priority: "asc" } },
        },
      },
    },
  });
  if (!run) throw new EnterpriseWorkflowError("Exécution de workflow introuvable.", 404, "WORKFLOW_RUN_NOT_FOUND", "BUSINESS");
  return run;
}

async function getOrCreateStepRun(organizationId: string, runId: string, stepId: string) {
  const existing = await prisma.enterpriseWorkflowStepRun.findFirst({ where: { organizationId, workflowRunId: runId, workflowStepId: stepId } });
  if (existing) return existing;
  try {
    return await prisma.enterpriseWorkflowStepRun.create({ data: { organizationId, workflowRunId: runId, workflowStepId: stepId, status: "PENDING" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.enterpriseWorkflowStepRun.findFirst({ where: { organizationId, workflowRunId: runId, workflowStepId: stepId } });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

async function selectNextStep(run: Awaited<ReturnType<typeof loadRun>>, fromStepId: string, outcome: string, entity: Awaited<ReturnType<ReturnType<typeof getWorkflowEntityAdapter>["loadEntity"]>>) {
  const adapter = getWorkflowEntityAdapter(run.sourceEntityType);
  const routes = run.version.transitions.filter((transition) => transition.fromStepId === fromStepId).sort((a, b) => a.priority - b.priority);
  for (const route of routes) {
    const routeOutcome = route.outcome || "DEFAULT";
    if (routeOutcome !== outcome && routeOutcome !== "DEFAULT") continue;
    if (route.conditionJson) {
      const condition = workflowConditionSchema.parse(route.conditionJson);
      if (!adapter.conditionFields.has(condition.field)) throw new EnterpriseWorkflowError("Une transition utilise un champ interdit.", 409, "WORKFLOW_TRANSITION_FIELD_DENIED", "CONFIGURATION");
      if (!compareWorkflowCondition(adapter.getConditionField(entity, condition.field), condition.operator, condition.value)) continue;
    }
    return route.toStep;
  }
  return null;
}

export async function executeWorkflowStep(context: WorkflowStepHandlerContext): Promise<WorkflowStepHandlerResult> {
  if (!(WORKFLOW_STEP_TYPES as readonly string[]).includes(context.step.stepType)) throw new EnterpriseWorkflowError("Type d’étape non pris en charge.", 409, "WORKFLOW_STEP_TYPE_UNSUPPORTED", "CONFIGURATION");
  const handler = WORKFLOW_STEP_HANDLERS[context.step.stepType as WorkflowStepType];
  return handler(context);
}

export async function startWorkflowRun({
  organizationId,
  workflowDefinitionId,
  sourceEntityType,
  sourceEntityId,
  triggerType,
  triggerEventId,
  startedByUserId,
}: {
  organizationId: string;
  workflowDefinitionId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  triggerType: string;
  triggerEventId?: string | null;
  startedByUserId?: string | null;
}) {
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({ where: { id: workflowDefinitionId, organizationId, status: "ACTIVE", archivedAt: null } });
  if (!definition || !definition.currentVersionId) throw new EnterpriseWorkflowError("Ce workflow ne possède aucune version publiée active.", 409, "WORKFLOW_NOT_PUBLISHED", "CONFIGURATION");
  if (definition.triggerEntityType && definition.triggerEntityType !== sourceEntityType) throw new EnterpriseWorkflowError("Le type de l’objet source ne correspond pas au workflow.", 400, "WORKFLOW_SOURCE_TYPE_MISMATCH", "SECURITY");
  if (triggerType === "MANUAL" && !definition.allowManualStart) throw new EnterpriseWorkflowError("Ce workflow n’autorise pas le lancement manuel.", 403, "WORKFLOW_MANUAL_START_DENIED", "SECURITY");
  const version = await prisma.enterpriseWorkflowVersion.findFirst({ where: { id: definition.currentVersionId, organizationId, definitionId: definition.id, status: "PUBLISHED" }, include: { steps: true } });
  if (!version) throw new EnterpriseWorkflowError("La version publiée est introuvable.", 409, "WORKFLOW_PUBLISHED_VERSION_MISSING", "CONFIGURATION");
  const start = version.steps.find((step) => step.stepType === "START");
  if (!start) throw new EnterpriseWorkflowError("La version publiée ne possède pas d’étape de départ.", 409, "WORKFLOW_START_MISSING", "CONFIGURATION");
  const adapter = getWorkflowEntityAdapter(sourceEntityType);
  await adapter.loadEntity(organizationId, sourceEntityId);
  if (startedByUserId) {
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: startedByUserId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) throw new EnterpriseWorkflowError("Le lanceur n’est pas un membre actif de l’entreprise.", 403, "WORKFLOW_STARTER_NOT_MEMBER", "SECURITY");
  }
  const active = await prisma.enterpriseWorkflowRun.findFirst({ where: { organizationId, workflowDefinitionId, sourceEntityType, sourceEntityId, status: { in: ACTIVE_RUN_STATUSES } } });
  if (active) return active;
  let run;
  try {
    run = await prisma.enterpriseWorkflowRun.create({ data: { organizationId, workflowDefinitionId, workflowVersionId: version.id, status: "RUNNING", triggerType, triggerEventId: triggerEventId || null, sourceEntityType, sourceEntityId, currentStepId: start.id, startedByUserId: startedByUserId || null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.enterpriseWorkflowRun.findFirst({ where: { organizationId, workflowDefinitionId, sourceEntityType, sourceEntityId, ...(triggerEventId ? { triggerEventId } : {}), status: { in: ACTIVE_RUN_STATUSES } } });
      if (existing) return existing;
    }
    throw error;
  }
  await timeline({ organizationId, runId: run.id, eventType: "ENTERPRISE_WORKFLOW_RUN_STARTED", status: "RUNNING", actorUserId: startedByUserId || null, summary: `Workflow « ${definition.name} » démarré.`, metadata: { sourceEntityType, sourceEntityId, workflowVersionId: version.id } });
  return advanceWorkflowRun(run.id);
}

export async function advanceWorkflowRun(runId: string) {
  for (let guard = 0; guard < WORKFLOW_LIMITS.maxSteps + 2; guard += 1) {
    const run = await loadRun(runId);
    if (TERMINAL_RUN_STATUSES.includes(run.status)) return run;
    if (run.status === "WAITING_APPROVAL") return run;
    if (run.status === "WAITING_TIME" && run.resumeAt && run.resumeAt.getTime() > Date.now()) return run;
    let step = run.version.steps.find((candidate) => candidate.id === run.currentStepId);
    if (!step) step = run.version.steps.find((candidate) => candidate.stepType === "START");
    if (!step) throw new EnterpriseWorkflowError("Étape courante introuvable.", 409, "WORKFLOW_CURRENT_STEP_MISSING", "CONFIGURATION");
    const adapter = getWorkflowEntityAdapter(run.sourceEntityType);
    const entity = await adapter.loadEntity(run.organizationId, run.sourceEntityId);
    let stepRun = await getOrCreateStepRun(run.organizationId, run.id, step.id);

    if (stepRun.status === "WAITING" && run.status === "WAITING_TIME" && (!run.resumeAt || run.resumeAt.getTime() <= Date.now())) {
      const reset = await prisma.enterpriseWorkflowStepRun.updateMany({ where: { id: stepRun.id, status: "WAITING" }, data: { status: "PENDING" } });
      if (reset.count !== 1) return loadRun(run.id);
      await prisma.enterpriseWorkflowRun.updateMany({ where: { id: run.id, status: "WAITING_TIME" }, data: { status: "RUNNING", resumeAt: null, revision: { increment: 1 } } });
      stepRun = { ...stepRun, status: "PENDING" };
    } else if (stepRun.status === "WAITING") return run;

    if (stepRun.status === "SUCCEEDED") {
      const next = await selectNextStep(run, step.id, outputOutcome(stepRun.outputJson), entity);
      if (!next && step.stepType !== "END") throw new EnterpriseWorkflowError("Aucune transition ne correspond au résultat de l’étape.", 409, "WORKFLOW_NEXT_STEP_MISSING", "CONFIGURATION");
      if (next) await prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: "RUNNING", currentStepId: next.id, resumeAt: null, revision: { increment: 1 } } });
      continue;
    }
    if (stepRun.status === "RUNNING") return run;

    const claimed = await prisma.enterpriseWorkflowStepRun.updateMany({
      where: { id: stepRun.id, status: { in: ["PENDING", "FAILED"] }, attemptCount: stepRun.attemptCount },
      data: { status: "RUNNING", startedAt: stepRun.startedAt || new Date(), attemptCount: { increment: 1 }, failureCategory: null, failureCode: null, failureMessage: null },
    });
    if (claimed.count !== 1) return loadRun(run.id);
    const runningStep = await prisma.enterpriseWorkflowStepRun.findUnique({ where: { id: stepRun.id } });
    if (!runningStep) throw new EnterpriseWorkflowError("L’étape courante est introuvable après son claim.", 409, "WORKFLOW_STEP_CLAIM_MISSING", "TERMINAL");
    await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: runningStep.id, eventType: "ENTERPRISE_WORKFLOW_STEP_STARTED", status: "RUNNING", summary: `Étape « ${step.name} » démarrée.` });
    try {
      const result = await executeWorkflowStep({ run, step, stepRun: runningStep, workflowName: run.definition.name, adapter, entity, previousStepActorUserId: run.decisionActorUserId });
      if (result.kind === "WAITING") {
        await prisma.$transaction([
          prisma.enterpriseWorkflowStepRun.update({ where: { id: runningStep.id }, data: { status: "WAITING", assignedUserId: result.assignedUserId || null, outputJson: result.output, failureCategory: null, failureCode: null, failureMessage: null } }),
          prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: result.runStatus, resumeAt: result.resumeAt || null, currentStepId: step.id, revision: { increment: 1 } } }),
        ]);
        await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: runningStep.id, eventType: "ENTERPRISE_WORKFLOW_STEP_WAITING", status: result.runStatus, summary: result.runStatus === "WAITING_APPROVAL" ? "Le workflow attend une validation." : "Le workflow attend l’échéance configurée.", metadata: result.resumeAt ? { resumeAt: result.resumeAt.toISOString() } : undefined });
        return loadRun(run.id);
      }
      if (result.kind === "END") {
        const finalStatus = result.outcome;
        await prisma.$transaction([
          prisma.enterpriseWorkflowStepRun.update({ where: { id: runningStep.id }, data: { status: "SUCCEEDED", completedAt: new Date(), outputJson: result.output, failureCategory: null, failureCode: null, failureMessage: null } }),
          prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: finalStatus, currentStepId: step.id, completedAt: new Date(), resumeAt: null, revision: { increment: 1 } } }),
        ]);
        await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: runningStep.id, eventType: "ENTERPRISE_WORKFLOW_RUN_COMPLETED", status: finalStatus, summary: finalStatus === "REJECTED" ? "Workflow terminé sur une décision négative." : "Workflow terminé avec succès." });
        return loadRun(run.id);
      }
      const output = { ...(result.output && typeof result.output === "object" && !Array.isArray(result.output) ? result.output as Record<string, Prisma.InputJsonValue> : {}), outcome: result.outcome || "DEFAULT" };
      const next = await selectNextStep(run, step.id, result.outcome || "DEFAULT", entity);
      if (!next) throw new EnterpriseWorkflowError("Aucune transition ne correspond au résultat de l’étape.", 409, "WORKFLOW_NEXT_STEP_MISSING", "CONFIGURATION");
      await prisma.$transaction([
        prisma.enterpriseWorkflowStepRun.update({ where: { id: runningStep.id }, data: { status: "SUCCEEDED", completedAt: new Date(), assignedUserId: result.assignedUserId || null, outputJson: inputJson(output), failureCategory: null, failureCode: null, failureMessage: null } }),
        prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: "RUNNING", currentStepId: next.id, decisionActorUserId: result.actorUserId || run.decisionActorUserId, resumeAt: null, revision: { increment: 1 } } }),
      ]);
      await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: runningStep.id, eventType: "ENTERPRISE_WORKFLOW_STEP_SUCCEEDED", status: "SUCCEEDED", actorUserId: result.actorUserId || null, summary: `Étape « ${step.name} » terminée.`, metadata: { outcome: result.outcome || "DEFAULT", nextStepCode: next.code } });
    } catch (error) {
      const failure = safeWorkflowFailureMessage(error);
      const canRetryNow = failure.category === "TRANSIENT" && runningStep.attemptCount < WORKFLOW_LIMITS.maxAttempts;
      const runStatus = canRetryNow ? "RUNNING" : (["BUSINESS", "CONFIGURATION"].includes(failure.category) ? "BLOCKED" : "FAILED");
      await prisma.$transaction([
        prisma.enterpriseWorkflowStepRun.update({ where: { id: runningStep.id }, data: { status: canRetryNow ? "PENDING" : "FAILED", failedAt: new Date(), failureCategory: failure.category, failureCode: failure.code, failureMessage: failure.message } }),
        prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: runStatus, failedAt: runStatus === "FAILED" ? new Date() : null, failureCategory: failure.category, failureCode: failure.code, failureMessage: failure.message, revision: { increment: 1 } } }),
      ]);
      await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: runningStep.id, eventType: canRetryNow ? "ENTERPRISE_WORKFLOW_STEP_RETRYING" : runStatus === "BLOCKED" ? "ENTERPRISE_WORKFLOW_RUN_BLOCKED" : "ENTERPRISE_WORKFLOW_RUN_FAILED", status: runStatus, summary: failure.message, metadata: { failureCategory: failure.category, failureCode: failure.code, workflowVersionId: run.workflowVersionId, entityType: run.sourceEntityType, entityId: run.sourceEntityId } });
      if (canRetryNow) continue;
      return loadRun(run.id);
    }
  }
  throw new EnterpriseWorkflowError("Le garde-fou d’exécution a interrompu ce workflow.", 409, "WORKFLOW_EXECUTION_GUARD_REACHED", "TERMINAL");
}

export async function resumeWorkflowFromApproval(approvalId: string, decisionActorUserId?: string | null) {
  const approval = await prisma.enterpriseApproval.findUnique({ where: { id: approvalId } });
  if (!approval?.workflowRunId || !approval.workflowStepRunId || approval.status === "PENDING") return null;
  const run = await prisma.enterpriseWorkflowRun.findFirst({ where: { id: approval.workflowRunId, organizationId: approval.organizationId } });
  if (!run || TERMINAL_RUN_STATUSES.includes(run.status)) return run;
  const stepRun = await prisma.enterpriseWorkflowStepRun.findFirst({ where: { id: approval.workflowStepRunId, organizationId: approval.organizationId, workflowRunId: run.id } });
  if (!stepRun) throw new EnterpriseWorkflowError("L’étape liée à la validation est introuvable.", 409, "WORKFLOW_APPROVAL_STEP_MISSING", "CONFIGURATION");
  if (stepRun.status !== "SUCCEEDED") {
    const updated = await prisma.enterpriseWorkflowStepRun.updateMany({
      where: { id: stepRun.id, status: "WAITING" },
      data: { status: "SUCCEEDED", completedAt: new Date(), assignedUserId: approval.approverUserId, outputJson: { approvalId: approval.id, decision: approval.status, outcome: approval.status } },
    });
    if (updated.count === 1) {
      await prisma.enterpriseWorkflowRun.updateMany({ where: { id: run.id, status: "WAITING_APPROVAL" }, data: { status: "RUNNING", decisionActorUserId: decisionActorUserId || approval.approverUserId, resumeAt: null, failureCategory: null, failureCode: null, failureMessage: null, revision: { increment: 1 } } });
      await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: stepRun.id, eventType: "ENTERPRISE_WORKFLOW_APPROVAL_DECIDED", status: approval.status, actorUserId: decisionActorUserId || approval.approverUserId, summary: `Validation ${approval.status.toLowerCase()}.`, metadata: { approvalId: approval.id } });
    }
  }
  return advanceWorkflowRun(run.id);
}

export async function retryWorkflowStep(runId: string, actorUserId: string, reason: string) {
  const run = await prisma.enterpriseWorkflowRun.findUnique({ where: { id: runId } });
  if (!run || !["BLOCKED", "FAILED"].includes(run.status)) throw new EnterpriseWorkflowError("Seul un workflow bloqué ou en échec peut être réessayé.", 409, "WORKFLOW_RETRY_NOT_ALLOWED", "BUSINESS");
  if (!run.currentStepId) throw new EnterpriseWorkflowError("Aucune étape courante à réessayer.", 409, "WORKFLOW_RETRY_STEP_MISSING", "CONFIGURATION");
  const stepRun = await prisma.enterpriseWorkflowStepRun.findFirst({ where: { workflowRunId: run.id, workflowStepId: run.currentStepId } });
  if (!stepRun || stepRun.attemptCount >= WORKFLOW_LIMITS.maxAttempts) throw new EnterpriseWorkflowError("Le nombre maximal de tentatives est atteint.", 409, "WORKFLOW_MAX_ATTEMPTS_REACHED", "TERMINAL");
  await prisma.$transaction([
    prisma.enterpriseWorkflowStepRun.update({ where: { id: stepRun.id }, data: { status: "PENDING", failedAt: null, failureCategory: null, failureCode: null, failureMessage: null } }),
    prisma.enterpriseWorkflowRun.update({ where: { id: run.id }, data: { status: "RUNNING", failedAt: null, failureCategory: null, failureCode: null, failureMessage: null, revision: { increment: 1 } } }),
  ]);
  await timeline({ organizationId: run.organizationId, runId: run.id, stepRunId: stepRun.id, eventType: "ENTERPRISE_WORKFLOW_RUN_RETRIED", status: "RUNNING", actorUserId, summary: reason });
  return advanceWorkflowRun(run.id);
}

export async function cancelWorkflowRun(runId: string, actorUserId: string, reason: string, revision: number, canManage: boolean) {
  const run = await prisma.enterpriseWorkflowRun.findUnique({ where: { id: runId } });
  if (!run || TERMINAL_RUN_STATUSES.includes(run.status)) throw new EnterpriseWorkflowError("Cette exécution ne peut plus être annulée.", 409, "WORKFLOW_CANCEL_NOT_ALLOWED", "BUSINESS");
  const changed = await prisma.enterpriseWorkflowRun.updateMany({ where: { id: run.id, revision, status: { in: ACTIVE_RUN_STATUSES } }, data: { status: "CANCELLED", cancelledAt: new Date(), resumeAt: null, failureCategory: null, failureCode: null, failureMessage: null, revision: { increment: 1 } } });
  if (changed.count !== 1) throw new EnterpriseWorkflowError("L’exécution a changé. Actualisez avant d’annuler.", 409, "WORKFLOW_REVISION_CONFLICT", "BUSINESS");
  await prisma.enterpriseWorkflowStepRun.updateMany({ where: { workflowRunId: run.id, status: { in: ["PENDING", "RUNNING", "WAITING", "FAILED"] } }, data: { status: "CANCELLED" } });
  const approvals = await prisma.enterpriseApproval.findMany({ where: { workflowRunId: run.id, organizationId: run.organizationId, status: "PENDING", archivedAt: null } });
  for (const approval of approvals) {
    try {
      if (approval.targetEntityType === "EnterprisePurchase") await decideEnterprisePurchaseApproval({ organizationId: run.organizationId, approvalId: approval.id, actorUserId, action: "CANCEL", revision: approval.revision, decisionComment: reason, canManage });
      else if (approval.targetEntityType === "EnterpriseBudget") await decideEnterpriseBudgetApproval({ organizationId: run.organizationId, approvalId: approval.id, actorUserId, action: "CANCEL", revision: approval.revision, decisionComment: reason, canManage });
      else if (approval.targetEntityType === "EnterpriseExpense") await decideEnterpriseExpenseApproval({ organizationId: run.organizationId, approvalId: approval.id, actorUserId, action: "CANCEL", revision: approval.revision, decisionComment: reason, canManage });
      else await decideEnterpriseApproval({ organizationId: run.organizationId, approvalId: approval.id, actorUserId, action: "CANCEL", revision: approval.revision, decisionComment: reason, canManage });
    } catch (error) {
      const normalized = normalizeWorkflowError(error);
      await timeline({ organizationId: run.organizationId, runId: run.id, eventType: "ENTERPRISE_WORKFLOW_APPROVAL_CANCEL_FAILED", status: "CANCELLED", actorUserId, summary: normalized.message, metadata: { approvalId: approval.id, failureCode: normalized.code } });
    }
  }
  await timeline({ organizationId: run.organizationId, runId: run.id, eventType: "ENTERPRISE_WORKFLOW_RUN_CANCELLED", status: "CANCELLED", actorUserId, summary: reason });
  return loadRun(run.id);
}

export async function resumeWaitingRuns(batchSize: number = WORKFLOW_LIMITS.workerBatchSize) {
  const due = await prisma.enterpriseWorkflowRun.findMany({ where: { status: "WAITING_TIME", resumeAt: { lte: new Date() } }, orderBy: { resumeAt: "asc" }, take: Math.min(batchSize, WORKFLOW_LIMITS.workerBatchSize), select: { id: true } });
  const results = [];
  for (const item of due) {
    const claimed = await prisma.enterpriseWorkflowRun.updateMany({ where: { id: item.id, status: "WAITING_TIME", resumeAt: { lte: new Date() } }, data: { status: "RUNNING", revision: { increment: 1 } } });
    if (claimed.count === 1) results.push(await advanceWorkflowRun(item.id));
  }
  return results;
}

export async function processWorkflowDomainEvent(eventId: string) {
  const event = await prisma.enterpriseDomainEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new EnterpriseWorkflowError("Événement métier introuvable.", 404, "WORKFLOW_DOMAIN_EVENT_NOT_FOUND", "BUSINESS");
  const payload = payloadObject(event.payloadJson);
  if (event.entityType === "EnterpriseApproval" && ["ENTERPRISE_APPROVAL_APPROVED", "ENTERPRISE_APPROVAL_REJECTED", "ENTERPRISE_APPROVAL_CANCELLED"].includes(event.eventType)) {
    await resumeWorkflowFromApproval(event.entityId, typeof payload.actorUserId === "string" ? payload.actorUserId : null);
    return [];
  }

  const triggerFilters: Prisma.EnterpriseWorkflowDefinitionWhereInput[] = [{ triggerEventType: event.eventType }];
  if (event.eventType.endsWith("_CREATED")) triggerFilters.push({ triggerType: "ENTITY_CREATED", triggerEventType: null });
  const fromStatus = typeof payload.fromStatus === "string" ? payload.fromStatus : null;
  const toStatus = typeof payload.toStatus === "string" ? payload.toStatus : null;
  if (fromStatus && toStatus && fromStatus !== toStatus) triggerFilters.push({ triggerType: "ENTITY_STATUS_CHANGED", triggerEventType: null });

  const definitions = await prisma.enterpriseWorkflowDefinition.findMany({
    where: {
      organizationId: event.organizationId,
      status: "ACTIVE",
      archivedAt: null,
      triggerEntityType: event.entityType,
      OR: triggerFilters,
    },
  });
  const runs = [];
  for (const definition of definitions) {
    try {
      runs.push(await startWorkflowRun({ organizationId: event.organizationId, workflowDefinitionId: definition.id, sourceEntityType: event.entityType, sourceEntityId: event.entityId, triggerType: "DOMAIN_EVENT", triggerEventId: event.id }));
    } catch (error) {
      const normalized = normalizeWorkflowError(error);
      if (normalized.code !== "WORKFLOW_SOURCE_NOT_FOUND") throw error;
    }
  }
  return runs;
}
