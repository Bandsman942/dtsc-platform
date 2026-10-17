import type { WorkflowAssignmentStrategy, WorkflowEntityType } from "@/lib/enterprise/workflows/constants";
import type { EnterpriseApproval } from "@prisma/client";

export type WorkflowConditionFieldType = "STRING" | "NUMBER" | "DATE" | "BOOLEAN";

export function workflowConditionFields(fields: Record<string, WorkflowConditionFieldType>): ReadonlyMap<string, WorkflowConditionFieldType> {
  return new Map(Object.entries(fields));
}

export type WorkflowApprovalInput = {
  organizationId: string;
  entityId: string;
  actorUserId: string;
  approverUserId: string;
  revision?: number;
};

export type WorkflowEntitySnapshot = Record<string, unknown> & {
  id: string;
  organizationId: string;
  status?: string | null;
  revision?: number | null;
};

export type WorkflowAssignmentInput = {
  organizationId: string;
  strategy: WorkflowAssignmentStrategy;
  entity: WorkflowEntitySnapshot;
  userId?: string;
  role?: string;
  departmentId?: string;
  previousStepActorUserId?: string | null;
};

export type WorkflowDomainActionInput = {
  organizationId: string;
  entityId: string;
  actorUserId: string;
  action: string;
  revision: number;
  comment?: string | null;
};

export type WorkflowDomainActionResult = {
  entityType: WorkflowEntityType;
  entityId: string;
  status?: string | null;
  revision?: number | null;
};

export interface WorkflowEntityAdapter {
  entityType: WorkflowEntityType;
  conditionFields: ReadonlyMap<string, WorkflowConditionFieldType>;
  placeholders: ReadonlySet<string>;
  triggerEvents: ReadonlySet<string>;
  domainActions: ReadonlySet<string>;
  // Presence means the workflow can request this exact canonical approval.
  // Finance decision targets are deliberately not inferred from entity names.
  createApproval?(input: WorkflowApprovalInput): Promise<EnterpriseApproval>;
  /** Exact preexisting approvals attachable without creating a second ERP request. */
  canonicalApprovalTargets?: ReadonlySet<string>;
  loadEntity(organizationId: string, entityId: string): Promise<WorkflowEntitySnapshot>;
  getConditionField(entity: WorkflowEntitySnapshot, field: string): unknown;
  getTemplateValues(entity: WorkflowEntitySnapshot, workflowName: string): Record<string, unknown>;
  resolveEntityUser(entity: WorkflowEntitySnapshot, strategy: WorkflowAssignmentStrategy): string | null;
  executeDomainAction(input: WorkflowDomainActionInput): Promise<WorkflowDomainActionResult>;
}
