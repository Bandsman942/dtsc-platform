import type { WorkflowAssignmentStrategy, WorkflowEntityType } from "@/lib/enterprise/workflows/constants";

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
  conditionFields: ReadonlySet<string>;
  placeholders: ReadonlySet<string>;
  triggerEvents: ReadonlySet<string>;
  domainActions: ReadonlySet<string>;
  loadEntity(organizationId: string, entityId: string): Promise<WorkflowEntitySnapshot>;
  getConditionField(entity: WorkflowEntitySnapshot, field: string): unknown;
  getTemplateValues(entity: WorkflowEntitySnapshot, workflowName: string): Record<string, unknown>;
  resolveEntityUser(entity: WorkflowEntitySnapshot, strategy: WorkflowAssignmentStrategy): string | null;
  executeDomainAction(input: WorkflowDomainActionInput): Promise<WorkflowDomainActionResult>;
}
