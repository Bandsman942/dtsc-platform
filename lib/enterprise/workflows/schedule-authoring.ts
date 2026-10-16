import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workflowDailyWeeklyScheduleSchema, getNextWorkflowOccurrence } from "@/lib/enterprise/workflows/advanced-schedule";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

const idSchema = z.string().trim().min(1).max(191);

/**
 * WF-06S2A is authoring ONLY. There is intentionally no status, actor, source
 * entity ID or runnable flag in the request. Activation belongs to #843.
 */
export const disabledWorkflowScheduleCreateSchema = z.object({
  workflowDefinitionId: idSchema,
  workflowVersionId: idSchema,
  schedule: workflowDailyWeeklyScheduleSchema,
}).strict();

export type DisabledWorkflowScheduleCreateInput = z.infer<typeof disabledWorkflowScheduleCreateSchema>;

/**
 * Writes exactly one inert schedule, retaining the exact published version.
 * Caller MUST enforce getEnterpriseWorkflowAccess(canCreateDraft) and
 * requireWorkflowSourceAccess on the persisted definition before invoking.
 * The source-entity identity and executable actor remain deliberately absent.
 */
export async function createDisabledWorkflowSchedule(input: {
  organizationId: string;
  actorUserId: string;
  payload: DisabledWorkflowScheduleCreateInput;
  asOf?: Date;
}) {
  const { organizationId, actorUserId } = input;
  if (!organizationId || !actorUserId || organizationId.length > 191 || actorUserId.length > 191) {
    throw new EnterpriseWorkflowError("Périmètre de planification invalide.", 400, "WORKFLOW_SCHEDULE_SCOPE_INVALID", "CONFIGURATION");
  }
  const payload = disabledWorkflowScheduleCreateSchema.parse(input.payload);
  const asOf = input.asOf ?? new Date();
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new EnterpriseWorkflowError("Date de départ invalide.", 400, "WORKFLOW_SCHEDULE_INSTANT_INVALID", "CONFIGURATION");
  }
  const scheduleId = randomUUID();
  const occurrence = getNextWorkflowOccurrence(payload.schedule, asOf, {
    organizationId,
    scheduleId,
    versionId: payload.workflowVersionId,
  });
  if (!occurrence) {
    throw new EnterpriseWorkflowError("Aucune occurrence valide dans la fenêtre autorisée.", 400, "WORKFLOW_SCHEDULE_NEXT_MISSING", "CONFIGURATION");
  }
  return prisma.$transaction(async (tx) => {
    const definition = await tx.enterpriseWorkflowDefinition.findFirst({
      where: {
        id: payload.workflowDefinitionId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        currentVersionId: payload.workflowVersionId,
      },
      select: { id: true, triggerEntityType: true },
    });
    if (!definition) {
      throw new EnterpriseWorkflowError("Définition publiée introuvable ou remplacée.", 409, "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE", "BUSINESS");
    }
    if (!definition.triggerEntityType) {
      throw new EnterpriseWorkflowError("Le workflow ne définit aucun module source autorisé.", 400, "WORKFLOW_SCHEDULE_SOURCE_REQUIRED", "CONFIGURATION");
    }
    const version = await tx.enterpriseWorkflowVersion.findFirst({
      where: {
        organizationId,
        id: payload.workflowVersionId,
        definitionId: definition.id,
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    if (!version) {
      throw new EnterpriseWorkflowError("Version publiée introuvable.", 409, "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE", "BUSINESS");
    }
    const membership = await tx.organizationMember.findFirst({
      where: {
        organizationId,
        userId: actorUserId,
        status: "ACTIVE",
        removedAt: null,
        organization: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new EnterpriseWorkflowError("Vous n’êtes plus membre actif de cette entreprise.", 403, "WORKFLOW_MEMBERSHIP_REQUIRED", "SECURITY");
    }
    return tx.enterpriseWorkflowSchedule.create({
      data: {
        id: scheduleId,
        organizationId,
        workflowDefinitionId: definition.id,
        workflowVersionId: version.id,
        frequency: payload.schedule.frequency,
        timeZone: payload.schedule.timeZone,
        hour: payload.schedule.hour,
        minute: payload.schedule.minute,
        dayOfWeek: payload.schedule.frequency === "WEEKLY" ? payload.schedule.dayOfWeek : null,
        status: "DISABLED",
        nextRunAt: occurrence.scheduledAt,
        createdByUserId: actorUserId,
      },
      select: {
        id: true, organizationId: true, workflowDefinitionId: true,
        workflowVersionId: true, frequency: true, timeZone: true,
        hour: true, minute: true, dayOfWeek: true, status: true,
        nextRunAt: true, revision: true, createdAt: true,
      },
    });
  });
}
