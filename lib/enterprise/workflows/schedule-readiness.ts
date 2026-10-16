import { getWorkflowEntityAdapter } from "@/lib/enterprise/workflows/adapters";
import { getNextWorkflowOccurrence } from "@/lib/enterprise/workflows/advanced-schedule";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { resolveWorkflowExecutionUser } from "@/lib/enterprise/workflows/runtime-utils";
import { requireWorkflowSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

/**
 * WF-06S2C: conservative TECHNICAL anti-flood ceilings for a future activation
 * pathway. They are NOT commercial plan quotas, which must be resolved by #843.
 */
export const WORKFLOW_SCHEDULE_SAFETY = Object.freeze({
  maxSchedulesPerTenant: 50,
  maxSchedulesPerDefinition: 10,
  maxCatchUpMs: 24 * 60 * 60 * 1000,
});

/**
 * Advisory READ-ONLY assessment of one DISABLED schedule.
 *
 * IMPORTANT: this function is never an execution grant. Rights/source/version
 * and limits can change immediately after the query (TOCTOU). The future
 * transactional dispatcher MUST revalidate before any run/ERP side effect.
 * Never import this function from the existing worker or cron in #848.
 */
export async function assertDisabledWorkflowScheduleReadiness(input: {
  organizationId: string;
  scheduleId: string;
  asOf?: Date;
}) {
  const { organizationId, scheduleId } = input;
  if ([organizationId, scheduleId].some((part) => !part || part.length > 191)) {
    throw new EnterpriseWorkflowError(
      "Périmètre de vérification invalide.", 400, "WORKFLOW_PREFLIGHT_SCOPE_INVALID", "CONFIGURATION",
    );
  }
  const asOf = input.asOf ?? new Date();
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new EnterpriseWorkflowError(
      "Date de référence invalide.", 400, "WORKFLOW_PREFLIGHT_TIME_INVALID", "CONFIGURATION",
    );
  }

  const tenant = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!tenant) throw new EnterpriseWorkflowError(
    "L'entreprise cliente n'est plus active.", 403, "WORKFLOW_PREFLIGHT_TENANT_INACTIVE", "SECURITY",
  );

  const schedule = await prisma.enterpriseWorkflowSchedule.findFirst({
    where: { organizationId, id: scheduleId, status: "DISABLED" },
    include: {
      definition: {
        select: { id: true, status: true, archivedAt: true, currentVersionId: true, triggerEntityType: true },
      },
      version: { select: { id: true, status: true, definitionId: true } },
    },
  });
  if (!schedule) throw new EnterpriseWorkflowError(
    "Horaire désactivé introuvable.", 404, "WORKFLOW_PREFLIGHT_SCHEDULE_NOT_FOUND", "BUSINESS",
  );
  if (
    schedule.definition.status !== "ACTIVE"
    || schedule.definition.archivedAt !== null
    || schedule.definition.currentVersionId !== schedule.workflowVersionId
    || schedule.version.status !== "PUBLISHED"
    || schedule.version.definitionId !== schedule.workflowDefinitionId
  ) throw new EnterpriseWorkflowError(
    "La version du workflow n'est plus publiée et courante.", 409, "WORKFLOW_PREFLIGHT_VERSION_RETIRED", "BUSINESS",
  );
  const { sourceEntityType, sourceEntityId, executionActorUserId, mandateVerifiedAt } = schedule;
  if (
    !sourceEntityType || !sourceEntityId || !executionActorUserId || !mandateVerifiedAt
    || sourceEntityType !== schedule.definition.triggerEntityType
  ) throw new EnterpriseWorkflowError(
    "Un mandat de source et d'acteur vérifiable est requis.", 409, "WORKFLOW_PREFLIGHT_MANDATE_MISSING", "SECURITY",
  );

  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: executionActorUserId, status: "ACTIVE", removedAt: null },
    select: { userId: true },
  });
  if (!membership) throw new EnterpriseWorkflowError(
    "L'acteur métier n'est plus membre actif.", 403, "WORKFLOW_PREFLIGHT_ACTOR_REVOKED", "SECURITY",
  );

  // Tenant/module/plan entitlements must be LIVE, never inferred from
  // mandateVerifiedAt or a former creator/administrator role.
  const workflowDecision = await resolveEnterpriseModuleAccess({
    userId: executionActorUserId, organizationId, moduleCode: "WORKFLOWS", action: "read",
  });
  if (!workflowDecision.allowed) throw new EnterpriseWorkflowError(
    "L'abonnement ou le module Workflows n'est plus autorisé.",
    403, "WORKFLOW_PREFLIGHT_WORKFLOWS_DENIED", "SECURITY",
  );
  await requireWorkflowSourceAccess({
    userId: executionActorUserId, organizationId, sourceEntityType, action: "read",
  });

  const adapter = getWorkflowEntityAdapter(sourceEntityType);
  const entity = await adapter.loadEntity(organizationId, sourceEntityId);
  if (entity.organizationId !== organizationId || entity.id !== sourceEntityId) {
    throw new EnterpriseWorkflowError(
      "Source métier extérieure à l'entreprise.", 403, "WORKFLOW_PREFLIGHT_SOURCE_SCOPE_DENIED", "SECURITY",
    );
  }
  const actor = await resolveWorkflowExecutionUser({
    organizationId, startedByUserId: executionActorUserId, adapter, entity, action: "read",
  });
  if (actor !== executionActorUserId) throw new EnterpriseWorkflowError(
    "Acteur de l'exécution différent du mandat.", 403, "WORKFLOW_PREFLIGHT_ACTOR_MISMATCH", "SECURITY",
  );

  if (!schedule.nextRunAt || !Number.isFinite(schedule.nextRunAt.getTime())) {
    throw new EnterpriseWorkflowError(
      "Curseur horaire absent.", 409, "WORKFLOW_PREFLIGHT_CURSOR_MISSING", "CONFIGURATION",
    );
  }
  const config = {
    frequency: schedule.frequency, timeZone: schedule.timeZone,
    hour: schedule.hour, minute: schedule.minute,
    ...(schedule.frequency === "WEEKLY" ? { dayOfWeek: schedule.dayOfWeek } : {}),
  };
  const exact = getNextWorkflowOccurrence(
    config,
    new Date(schedule.nextRunAt.getTime() - 1),
    { organizationId, scheduleId, versionId: schedule.workflowVersionId },
  );
  if (!exact || exact.scheduledAt.getTime() !== schedule.nextRunAt.getTime()) {
    throw new EnterpriseWorkflowError(
      "Curseur incohérent avec les règles horaires et DST.",
      409, "WORKFLOW_PREFLIGHT_CURSOR_INCONSISTENT", "CONFIGURATION",
    );
  }
  if (asOf.getTime() - schedule.nextRunAt.getTime() > WORKFLOW_SCHEDULE_SAFETY.maxCatchUpMs) {
    throw new EnterpriseWorkflowError(
      "L'échéance est trop ancienne pour un rattrapage automatique.",
      409, "WORKFLOW_PREFLIGHT_CATCHUP_EXCEEDED", "BUSINESS",
    );
  }

  // Hard technical ceilings, NOT a plan quota. A later live dispatcher must
  // use atomic quota reservations and commercially authorized plan limits.
  const [tenantCount, definitionCount, existingReceipts] = await Promise.all([
    prisma.enterpriseWorkflowSchedule.count({ where: { organizationId } }),
    prisma.enterpriseWorkflowSchedule.count({
      where: { organizationId, workflowDefinitionId: schedule.workflowDefinitionId },
    }),
    prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { organizationId, scheduleId } }),
  ]);
  if (existingReceipts !== 0) throw new EnterpriseWorkflowError(
    "Cet horaire possède déjà une réservation à rapprocher avant activation.",
    409, "WORKFLOW_PREFLIGHT_UNRECONCILED_RECEIPTS", "BUSINESS",
  );
  if (tenantCount > WORKFLOW_SCHEDULE_SAFETY.maxSchedulesPerTenant
    || definitionCount > WORKFLOW_SCHEDULE_SAFETY.maxSchedulesPerDefinition) {
    throw new EnterpriseWorkflowError(
      "Trop d'horaires configurés. Réduisez la charge avant activation.",
      409, "WORKFLOW_PREFLIGHT_SAFETY_LIMIT", "BUSINESS",
    );
  }

  // Return metadata ONLY. Not a source snapshot or an authorization token.
  return Object.freeze({
    kind: "INERT_READINESS_ONLY" as const,
    organizationId, scheduleId,
    workflowVersionId: schedule.workflowVersionId,
    revision: schedule.revision,
    status: "DISABLED" as const,
    nextRunAt: schedule.nextRunAt,
  });
}
