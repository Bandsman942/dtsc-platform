import { z } from "zod";
import {
  WORKFLOW_ASSIGNMENT_STRATEGIES,
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_ENTITY_TYPES,
  WORKFLOW_LIMITS,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_TYPES,
} from "@/lib/enterprise/workflows/constants";

const codeSchema = z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/);
const idSchema = z.string().trim().min(1).max(191);
const boundedText = z.string().trim().max(WORKFLOW_LIMITS.maxTemplateLength);

export const workflowConditionSchema = z.object({
  field: z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9.]*$/),
  operator: z.enum(WORKFLOW_CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]).optional(),
});

export const workflowAssignmentSchema = z.object({
  strategy: z.enum(WORKFLOW_ASSIGNMENT_STRATEGIES),
  userId: idSchema.optional(),
  role: z.string().trim().min(1).max(80).optional(),
  departmentId: idSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.strategy === "SPECIFIC_USER" && !value.userId) ctx.addIssue({ code: "custom", message: "userId is required for SPECIFIC_USER", path: ["userId"] });
  if (value.strategy === "SPECIFIC_ROLE" && !value.role) ctx.addIssue({ code: "custom", message: "role is required for SPECIFIC_ROLE", path: ["role"] });
});

const startStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("START"), position: z.number().int().nonnegative(), configuration: z.object({}) });
const conditionStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("CONDITION"), position: z.number().int().nonnegative(), configuration: z.object({ condition: workflowConditionSchema }) });
const assignStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("ASSIGN"), position: z.number().int().nonnegative(), configuration: z.object({ assignment: workflowAssignmentSchema }) });
const approvalStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("CREATE_APPROVAL"), position: z.number().int().nonnegative(), configuration: z.object({ assignment: workflowAssignmentSchema, titleTemplate: boundedText.optional() }) });
const taskStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("CREATE_TASK"), position: z.number().int().nonnegative(), configuration: z.object({ titleTemplate: boundedText.min(1), descriptionTemplate: boundedText.optional(), taskType: z.string().trim().min(1).max(60).default("TASK"), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), assignment: workflowAssignmentSchema.optional(), dueInHours: z.number().int().positive().max(WORKFLOW_LIMITS.maxWaitHours).optional() }) });
const domainActionStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("DOMAIN_ACTION"), position: z.number().int().nonnegative(), configuration: z.object({ action: codeSchema, commentTemplate: boundedText.optional() }) });
const notificationStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("NOTIFICATION"), position: z.number().int().nonnegative(), configuration: z.object({ recipient: workflowAssignmentSchema, titleTemplate: boundedText.min(1), bodyTemplate: boundedText.min(1), targetUrl: z.string().trim().max(300).regex(/^\//).optional() }) });
const waitStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("WAIT_UNTIL"), position: z.number().int().nonnegative(), configuration: z.discriminatedUnion("mode", [z.object({ mode: z.literal("RELATIVE_HOURS"), hours: z.number().int().positive().max(WORKFLOW_LIMITS.maxWaitHours) }), z.object({ mode: z.literal("ENTITY_DATE"), field: z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9.]*$/) })]) });
const endStepSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(140), description: z.string().trim().max(500).optional(), stepType: z.literal("END"), position: z.number().int().nonnegative(), configuration: z.object({ outcome: z.enum(["COMPLETED", "REJECTED"]).default("COMPLETED") }) });

export const workflowStepSchema = z.discriminatedUnion("stepType", [startStepSchema, conditionStepSchema, assignStepSchema, approvalStepSchema, taskStepSchema, domainActionStepSchema, notificationStepSchema, waitStepSchema, endStepSchema]);

export const workflowTransitionSchema = z.object({
  fromStepCode: codeSchema,
  toStepCode: codeSchema,
  outcome: z.enum(["DEFAULT", "TRUE", "FALSE", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  condition: workflowConditionSchema.optional(),
});

const workflowDefinitionBaseSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  triggerType: z.enum(WORKFLOW_TRIGGER_TYPES),
  triggerEntityType: z.enum(WORKFLOW_ENTITY_TYPES).optional(),
  triggerEventType: codeSchema.optional(),
  allowManualStart: z.boolean().default(false),
  singleActiveRun: z.boolean().default(true),
});

export const workflowDefinitionCreateSchema = workflowDefinitionBaseSchema.extend({ code: codeSchema.optional() }).superRefine((value, ctx) => {
  if (value.triggerType !== "MANUAL" && !value.triggerEntityType) ctx.addIssue({ code: "custom", message: "triggerEntityType is required", path: ["triggerEntityType"] });
  if (value.triggerType === "DOMAIN_EVENT" && !value.triggerEventType) ctx.addIssue({ code: "custom", message: "triggerEventType is required", path: ["triggerEventType"] });
});

export const workflowDefinitionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  triggerType: z.enum(WORKFLOW_TRIGGER_TYPES).optional(),
  triggerEntityType: z.enum(WORKFLOW_ENTITY_TYPES).nullable().optional(),
  triggerEventType: codeSchema.nullable().optional(),
  allowManualStart: z.boolean().optional(),
  singleActiveRun: z.boolean().optional(),
});

export const workflowVersionSchema = z.object({
  steps: z.array(workflowStepSchema).min(2).max(WORKFLOW_LIMITS.maxSteps),
  transitions: z.array(workflowTransitionSchema).min(1).max(WORKFLOW_LIMITS.maxTransitions),
  configuration: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const workflowPublishSchema = z.object({ acknowledgeReadiness: z.literal(true) });
export const workflowManualStartSchema = z.object({ workflowDefinitionId: idSchema, sourceEntityType: z.enum(WORKFLOW_ENTITY_TYPES), sourceEntityId: idSchema });
export const workflowRetrySchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const workflowCancelSchema = z.object({ reason: z.string().trim().min(3).max(500), revision: z.number().int().positive() });

export type WorkflowVersionInput = z.infer<typeof workflowVersionSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type WorkflowTransitionInput = z.infer<typeof workflowTransitionSchema>;
