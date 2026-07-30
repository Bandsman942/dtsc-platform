import { Prisma } from "@prisma/client";
import { MEETING_ACTIONS, REQUEST_ACTIONS, TASK_ACTIONS } from "@/lib/enterprise/core-v2/constants";
import { transitionEnterpriseMeeting, transitionEnterpriseRequest, transitionEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { ENTERPRISE_BUDGET_ACTIONS, ENTERPRISE_EXPENSE_ACTIONS, ENTERPRISE_REPORT_ACTIONS } from "@/lib/enterprise/finance/constants";
import { transitionEnterpriseBudget } from "@/lib/enterprise/finance/budget-service";
import { transitionEnterpriseExpense } from "@/lib/enterprise/finance/expense-service";
import { transitionEnterpriseReport } from "@/lib/enterprise/finance/report-service";
import { ENTERPRISE_PURCHASE_ACTIONS } from "@/lib/enterprise/procurement/constants";
import { transitionEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import type { WorkflowAssignmentStrategy, WorkflowEntityType } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import type { WorkflowDomainActionInput, WorkflowDomainActionResult, WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { prisma } from "@/lib/prisma";

const COMMON_PLACEHOLDERS = ["entity.id", "entity.reference", "entity.title", "entity.status", "entity.requesterName", "entity.departmentName", "workflow.name"] as const;

function snapshot<T extends { id: string; organizationId: string }>(value: T | null, entityType: WorkflowEntityType): WorkflowEntitySnapshot {
  if (!value) throw new EnterpriseWorkflowError(`${entityType} est introuvable dans cette entreprise.`, 404, "WORKFLOW_SOURCE_NOT_FOUND", "BUSINESS");
  return value as unknown as WorkflowEntitySnapshot;
}

function valueAt(entity: WorkflowEntitySnapshot, field: string) {
  if (field.includes(".") || field === "__proto__" || field === "constructor" || field === "prototype") {
    throw new EnterpriseWorkflowError("Ce champ conditionnel n’est pas autorisé.", 400, "WORKFLOW_CONDITION_FIELD_DENIED", "SECURITY");
  }
  return entity[field];
}

function entityUser(entity: WorkflowEntitySnapshot, strategy: WorkflowAssignmentStrategy) {
  const pick = (key: string) => typeof entity[key] === "string" && entity[key] ? String(entity[key]) : null;
  if (strategy === "ENTITY_REQUESTER") return pick("requestedByUserId");
  if (strategy === "ENTITY_ASSIGNEE") return pick("assignedToUserId");
  if (strategy === "ENTITY_BUYER") return pick("buyerUserId");
  if (strategy === "ENTITY_CREATOR") return pick("createdByUserId") || pick("generatedByUserId") || pick("organizerUserId") || pick("requestedByUserId");
  return null;
}

function templateValues(entity: WorkflowEntitySnapshot, workflowName: string) {
  return {
    "entity.id": entity.id,
    "entity.reference": entity.reference || entity.id,
    "entity.title": entity.title || entity.reference || entity.id,
    "entity.status": entity.status || "",
    "entity.requesterName": entity.requesterName || "",
    "entity.departmentName": entity.departmentName || "",
    "workflow.name": workflowName,
  };
}

function ensureAllowed(action: string, allowed: readonly string[], entityType: WorkflowEntityType) {
  if (!allowed.includes(action)) throw new EnterpriseWorkflowError(`L'action ${action} n'est pas autorisée pour ${entityType}.`, 400, "WORKFLOW_DOMAIN_ACTION_DENIED", "CONFIGURATION");
}

async function reloadResult(adapter: WorkflowEntityAdapter, input: WorkflowDomainActionInput): Promise<WorkflowDomainActionResult> {
  const entity = await adapter.loadEntity(input.organizationId, input.entityId);
  return { entityType: adapter.entityType, entityId: entity.id, status: typeof entity.status === "string" ? entity.status : null, revision: typeof entity.revision === "number" ? entity.revision : null };
}

const taskAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseTask",
  conditionFields: new Set(["status", "priority", "taskType", "departmentId", "assignedToUserId", "createdByUserId", "dueAt"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_TASK_CREATED", "ENTERPRISE_TASK_STARTED", "ENTERPRISE_TASK_BLOCKED", "ENTERPRISE_TASK_RESUMED", "ENTERPRISE_TASK_COMPLETED", "ENTERPRISE_TASK_CANCELLED"]),
  domainActions: new Set(TASK_ACTIONS),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseTask.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, title: true, status: true, priority: true, taskType: true, departmentId: true, assignedToUserId: true, createdByUserId: true, dueAt: true, revision: true } });
    return snapshot(item, "EnterpriseTask");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    ensureAllowed(input.action, TASK_ACTIONS, "EnterpriseTask");
    await transitionEnterpriseTask({ organizationId: input.organizationId, taskId: input.entityId, actorUserId: input.actorUserId, action: input.action as (typeof TASK_ACTIONS)[number], revision: input.revision, comment: input.comment });
    return reloadResult(taskAdapter, input);
  },
};

const requestAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseRequest",
  conditionFields: new Set(["status", "priority", "requestType", "departmentId", "assignedToUserId", "requestedByUserId", "dueAt"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_REQUEST_CREATED", "ENTERPRISE_REQUEST_SUBMITTED", "ENTERPRISE_REQUEST_REVIEW_STARTED", "ENTERPRISE_REQUEST_APPROVED", "ENTERPRISE_REQUEST_REJECTED", "ENTERPRISE_REQUEST_FULFILLED", "ENTERPRISE_REQUEST_CANCELLED"]),
  domainActions: new Set(REQUEST_ACTIONS),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseRequest.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, title: true, status: true, priority: true, requestType: true, departmentId: true, assignedToUserId: true, requestedByUserId: true, dueAt: true, revision: true } });
    return snapshot(item, "EnterpriseRequest");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    ensureAllowed(input.action, REQUEST_ACTIONS, "EnterpriseRequest");
    await transitionEnterpriseRequest({ organizationId: input.organizationId, requestId: input.entityId, actorUserId: input.actorUserId, action: input.action as (typeof REQUEST_ACTIONS)[number], revision: input.revision, comment: input.comment });
    return reloadResult(requestAdapter, input);
  },
};

const meetingAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseMeeting",
  conditionFields: new Set(["status", "departmentId", "organizerUserId", "locationMode", "startAt", "endAt"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_MEETING_CREATED", "ENTERPRISE_MEETING_STARTED", "ENTERPRISE_MEETING_COMPLETED", "ENTERPRISE_MEETING_CANCELLED"]),
  domainActions: new Set(MEETING_ACTIONS),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, title: true, status: true, departmentId: true, organizerUserId: true, locationMode: true, startAt: true, endAt: true, revision: true } });
    return snapshot(item, "EnterpriseMeeting");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    ensureAllowed(input.action, MEETING_ACTIONS, "EnterpriseMeeting");
    await transitionEnterpriseMeeting({ organizationId: input.organizationId, meetingId: input.entityId, actorUserId: input.actorUserId, action: input.action as (typeof MEETING_ACTIONS)[number], revision: input.revision, comment: input.comment });
    return reloadResult(meetingAdapter, input);
  },
};

const purchaseAdapter: WorkflowEntityAdapter = {
  entityType: "EnterprisePurchase",
  conditionFields: new Set(["status", "priority", "currency", "totalAmount", "departmentId", "supplierId", "budgetLineId", "requestedByUserId", "buyerUserId", "createdByUserId", "expectedAt"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_PURCHASE_CREATED", "ENTERPRISE_PURCHASE_SUBMITTED", "ENTERPRISE_PURCHASE_APPROVED", "ENTERPRISE_PURCHASE_REJECTED", "ENTERPRISE_PURCHASE_ORDERED", "ENTERPRISE_PURCHASE_RECEIVED", "ENTERPRISE_PURCHASE_CLOSED", "ENTERPRISE_PURCHASE_CANCELLED"]),
  domainActions: new Set(ENTERPRISE_PURCHASE_ACTIONS.filter((action) => action !== "SUBMIT")),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterprisePurchase.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, reference: true, title: true, status: true, priority: true, currency: true, totalAmount: true, departmentId: true, supplierId: true, budgetLineId: true, requestedByUserId: true, buyerUserId: true, createdByUserId: true, expectedAt: true, revision: true } });
    return snapshot(item, "EnterprisePurchase");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    const allowed = ENTERPRISE_PURCHASE_ACTIONS.filter((action) => action !== "SUBMIT");
    ensureAllowed(input.action, allowed, "EnterprisePurchase");
    await transitionEnterprisePurchase(input.organizationId, input.entityId, input.actorUserId, { action: input.action, revision: input.revision, comment: input.comment } as unknown as Parameters<typeof transitionEnterprisePurchase>[3]);
    return reloadResult(purchaseAdapter, input);
  },
};

const budgetAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseBudget",
  conditionFields: new Set(["status", "currency", "departmentId", "createdByUserId", "periodStart", "periodEnd"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_BUDGET_CREATED", "ENTERPRISE_BUDGET_SUBMITTED", "ENTERPRISE_BUDGET_APPROVED", "ENTERPRISE_BUDGET_REJECTED", "ENTERPRISE_BUDGET_CLOSED", "ENTERPRISE_BUDGET_CANCELLED"]),
  domainActions: new Set(ENTERPRISE_BUDGET_ACTIONS.filter((action) => action !== "SUBMIT")),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseBudget.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, reference: true, title: true, status: true, currency: true, departmentId: true, createdByUserId: true, periodStart: true, periodEnd: true, revision: true } });
    return snapshot(item, "EnterpriseBudget");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    const allowed = ENTERPRISE_BUDGET_ACTIONS.filter((action) => action !== "SUBMIT");
    ensureAllowed(input.action, allowed, "EnterpriseBudget");
    await transitionEnterpriseBudget(input.organizationId, input.entityId, input.actorUserId, { action: input.action, revision: input.revision, comment: input.comment } as unknown as Parameters<typeof transitionEnterpriseBudget>[3]);
    return reloadResult(budgetAdapter, input);
  },
};

const expenseAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseExpense",
  conditionFields: new Set(["status", "currency", "amount", "category", "departmentId", "supplierId", "purchaseId", "budgetLineId", "requestedByUserId", "createdByUserId", "expenseDate"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_EXPENSE_CREATED", "ENTERPRISE_EXPENSE_SUBMITTED", "ENTERPRISE_EXPENSE_APPROVED", "ENTERPRISE_EXPENSE_REJECTED", "ENTERPRISE_EXPENSE_CANCELLED"]),
  domainActions: new Set(ENTERPRISE_EXPENSE_ACTIONS.filter((action) => action !== "SUBMIT")),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseExpense.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, reference: true, title: true, status: true, currency: true, amount: true, category: true, departmentId: true, supplierId: true, purchaseId: true, budgetLineId: true, requestedByUserId: true, createdByUserId: true, expenseDate: true, revision: true } });
    return snapshot(item, "EnterpriseExpense");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    const allowed = ENTERPRISE_EXPENSE_ACTIONS.filter((action) => action !== "SUBMIT");
    ensureAllowed(input.action, allowed, "EnterpriseExpense");
    await transitionEnterpriseExpense(input.organizationId, input.entityId, input.actorUserId, { action: input.action, revision: input.revision, comment: input.comment } as unknown as Parameters<typeof transitionEnterpriseExpense>[3]);
    return reloadResult(expenseAdapter, input);
  },
};

const reportAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseReport",
  conditionFields: new Set(["status", "reportType", "currency", "generatedByUserId", "generatedAt", "periodStart", "periodEnd"]),
  placeholders: new Set(COMMON_PLACEHOLDERS),
  triggerEvents: new Set(["ENTERPRISE_REPORT_GENERATED"]),
  domainActions: new Set(ENTERPRISE_REPORT_ACTIONS),
  async loadEntity(organizationId, entityId) {
    const item = await prisma.enterpriseReport.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, reference: true, title: true, status: true, reportType: true, currency: true, generatedByUserId: true, generatedAt: true, periodStart: true, periodEnd: true, revision: true } });
    return snapshot(item, "EnterpriseReport");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser: entityUser,
  async executeDomainAction(input) {
    ensureAllowed(input.action, ENTERPRISE_REPORT_ACTIONS, "EnterpriseReport");
    await transitionEnterpriseReport(input.organizationId, input.entityId, input.actorUserId, { action: input.action, revision: input.revision } as unknown as Parameters<typeof transitionEnterpriseReport>[3]);
    return reloadResult(reportAdapter, input);
  },
};

const ADAPTERS: Record<WorkflowEntityType, WorkflowEntityAdapter> = {
  EnterpriseTask: taskAdapter,
  EnterpriseRequest: requestAdapter,
  EnterpriseMeeting: meetingAdapter,
  EnterprisePurchase: purchaseAdapter,
  EnterpriseBudget: budgetAdapter,
  EnterpriseExpense: expenseAdapter,
  EnterpriseReport: reportAdapter,
};

export function getWorkflowEntityAdapter(entityType: string) {
  const adapter = ADAPTERS[entityType as WorkflowEntityType];
  if (!adapter) throw new EnterpriseWorkflowError("Ce type d’objet n’est pas pris en charge par le moteur de workflow.", 400, "WORKFLOW_ENTITY_TYPE_UNSUPPORTED", "CONFIGURATION");
  return adapter;
}

export async function resolveWorkflowAssignment({
  organizationId,
  strategy,
  entity,
  userId,
  role,
  departmentId,
  previousStepActorUserId,
}: {
  organizationId: string;
  strategy: WorkflowAssignmentStrategy;
  entity: WorkflowEntitySnapshot;
  userId?: string;
  role?: string;
  departmentId?: string;
  previousStepActorUserId?: string | null;
}) {
  let candidate: string | null = null;
  if (strategy === "SPECIFIC_USER") candidate = userId || null;
  else if (strategy === "SPECIFIC_ROLE") {
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, role, status: "ACTIVE", removedAt: null }, orderBy: { joinedAt: "asc" }, select: { userId: true } });
    candidate = member?.userId || null;
  } else if (strategy === "DEPARTMENT_MANAGER") {
    const targetDepartmentId = departmentId || (typeof entity.departmentId === "string" ? entity.departmentId : null);
    const department = targetDepartmentId ? await prisma.enterpriseDepartment.findFirst({ where: { id: targetDepartmentId, organizationId, isActive: true }, select: { responsibleUserId: true } }) : null;
    candidate = department?.responsibleUserId || null;
  } else if (strategy === "PREVIOUS_STEP_ACTOR") candidate = previousStepActorUserId || null;
  else candidate = getWorkflowEntityAdapter(String(entity.workflowEntityType || entity.entityType || "") || inferEntityType(entity)).resolveEntityUser(entity, strategy);

  if (!candidate) throw new EnterpriseWorkflowError("Aucun utilisateur actif ne correspond à la règle d’assignation.", 409, "WORKFLOW_ASSIGNEE_NOT_FOUND", "CONFIGURATION");
  const active = await prisma.organizationMember.findFirst({ where: { organizationId, userId: candidate, status: "ACTIVE", removedAt: null }, select: { userId: true } });
  if (!active) throw new EnterpriseWorkflowError("Aucun utilisateur actif ne correspond à la règle d’assignation.", 409, "WORKFLOW_ASSIGNEE_NOT_FOUND", "CONFIGURATION");
  return candidate;
}

function inferEntityType(entity: WorkflowEntitySnapshot): WorkflowEntityType {
  if ("requestType" in entity) return "EnterpriseRequest";
  if ("taskType" in entity) return "EnterpriseTask";
  if ("locationMode" in entity) return "EnterpriseMeeting";
  if ("totalAmount" in entity) return "EnterprisePurchase";
  if ("amount" in entity && "expenseDate" in entity) return "EnterpriseExpense";
  if ("periodStart" in entity && "createdByUserId" in entity && !("reportType" in entity)) return "EnterpriseBudget";
  if ("reportType" in entity) return "EnterpriseReport";
  throw new EnterpriseWorkflowError("Impossible de résoudre l’adapter de l’objet.", 400, "WORKFLOW_ADAPTER_RESOLUTION_FAILED", "CONFIGURATION");
}

export function compareWorkflowCondition(left: unknown, operator: string, right: unknown) {
  const decimal = (value: unknown) => {
    try { return new Prisma.Decimal(value as Prisma.Decimal.Value); } catch { return null; }
  };
  if (operator === "EXISTS") return left !== null && left !== undefined;
  if (operator === "NOT_EXISTS") return left === null || left === undefined;
  if (operator === "IN" || operator === "NOT_IN") {
    const list = Array.isArray(right) ? right : [];
    const included = list.some((item) => String(item) === String(left));
    return operator === "IN" ? included : !included;
  }
  if (["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"].includes(operator)) {
    const a = decimal(left); const b = decimal(right);
    if (!a || !b) throw new EnterpriseWorkflowError("Cette condition exige des valeurs numériques valides.", 400, "WORKFLOW_CONDITION_TYPE_MISMATCH", "CONFIGURATION");
    if (operator === "GREATER_THAN") return a.gt(b);
    if (operator === "GREATER_THAN_OR_EQUAL") return a.gte(b);
    if (operator === "LESS_THAN") return a.lt(b);
    return a.lte(b);
  }
  const equal = left instanceof Date || right instanceof Date ? new Date(String(left)).getTime() === new Date(String(right)).getTime() : String(left ?? "") === String(right ?? "");
  return operator === "EQUALS" ? equal : operator === "NOT_EQUALS" ? !equal : false;
}
