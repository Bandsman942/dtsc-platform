import type { WorkflowStepType } from "@/lib/enterprise/workflows/constants";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";
import { executeAssignStep } from "@/lib/enterprise/workflows/steps/assign";
import { executeConditionStep } from "@/lib/enterprise/workflows/steps/condition";
import { executeCreateApprovalStep } from "@/lib/enterprise/workflows/steps/create-approval";
import { executeCreateTaskStep } from "@/lib/enterprise/workflows/steps/create-task";
import { executeDomainActionStep } from "@/lib/enterprise/workflows/steps/domain-action";
import { executeEndStep } from "@/lib/enterprise/workflows/steps/end";
import { executeNotificationStep } from "@/lib/enterprise/workflows/steps/notification";
import { executeStartStep } from "@/lib/enterprise/workflows/steps/start";
import { executeWaitUntilStep } from "@/lib/enterprise/workflows/steps/wait-until";

export const WORKFLOW_STEP_HANDLERS: Record<WorkflowStepType, WorkflowStepHandler> = {
  START: executeStartStep,
  CONDITION: executeConditionStep,
  ASSIGN: executeAssignStep,
  CREATE_APPROVAL: executeCreateApprovalStep,
  CREATE_TASK: executeCreateTaskStep,
  DOMAIN_ACTION: executeDomainActionStep,
  NOTIFICATION: executeNotificationStep,
  WAIT_UNTIL: executeWaitUntilStep,
  END: executeEndStep,
};
