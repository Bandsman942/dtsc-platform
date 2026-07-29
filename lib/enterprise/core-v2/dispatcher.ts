import { createEnterpriseCoreRecord, type EnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import { isDedicatedCoreDomain } from "@/lib/enterprise/core-v2/constants";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseRequest, createEnterpriseTask } from "@/lib/enterprise/core-v2/service";

export type EnterpriseOperationalObjectInput = {
  moduleCode: EnterpriseCoreModuleCode;
  recordType: string;
  title: string;
  description?: string;
  priority: string;
  assignedToUserId?: string;
  validatorUserId?: string;
  departmentId?: string;
  dueAt?: Date;
  amount?: number;
  currency?: string;
  sourceModule?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sectorCode?: string;
  metadata?: Record<string, unknown>;
};

export async function createEnterpriseOperationalObject({
  organizationId,
  actorUserId,
  data,
}: {
  organizationId: string;
  actorUserId: string;
  data: EnterpriseOperationalObjectInput;
}) {
  if (data.moduleCode === "TASKS_OPERATIONS" && (data.recordType === "TASK" || data.recordType === "OPERATION")) {
    return {
      kind: "TASK" as const,
      record: await createEnterpriseTask(organizationId, actorUserId, {
        taskType: data.recordType,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignedToUserId: data.assignedToUserId,
        departmentId: data.departmentId,
        dueAt: data.dueAt,
        sourceModule: data.sourceModule,
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
      }),
    };
  }

  if (data.moduleCode === "INTERNAL_REQUESTS" && data.recordType === "INTERNAL_REQUEST") {
    return {
      kind: "REQUEST" as const,
      record: await createEnterpriseRequest(organizationId, actorUserId, {
        requestType: typeof data.metadata?.requestType === "string" ? data.metadata.requestType : "GENERAL",
        title: data.title,
        description: data.description || data.title,
        priority: data.priority,
        assignedToUserId: data.assignedToUserId,
        departmentId: data.departmentId,
        dueAt: data.dueAt,
        sourceModule: data.sourceModule,
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        initialStatus: "SUBMITTED",
      }),
    };
  }

  if (isDedicatedCoreDomain(data.moduleCode, data.recordType)) {
    throw new EnterpriseCoreV2Error(
      "Ce domaine utilise désormais son API métier dédiée. Utilisez les routes Tasks, Requests, Approvals ou Meetings.",
      409,
      "DEDICATED_DOMAIN_REQUIRED"
    );
  }

  return {
    kind: "LEGACY" as const,
    record: await createEnterpriseCoreRecord({ organizationId, actorUserId, data }),
  };
}
