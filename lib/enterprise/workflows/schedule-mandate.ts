import { z } from "zod";
import { getWorkflowEntityAdapter } from "@/lib/enterprise/workflows/adapters";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { resolveWorkflowExecutionUser } from "@/lib/enterprise/workflows/runtime-utils";
import { prisma } from "@/lib/prisma";

const id = z.string().trim().min(1).max(191);

/** Explicit author-self source mandate for a disabled schedule only. */
export const disabledScheduleMandateSchema = z.object({
  sourceEntityId: id,
  revision: z.number().int().positive(),
}).strict();

export type DisabledScheduleMandateInput = z.infer<typeof disabledScheduleMandateSchema>;

/**
 * WF-06S2B: a configuration attestation, never an execution authorization.
 * The route must enforce live WORKFLOWS edit and source module access.
 * The future scheduler MUST revalidate all rights, entity, and actor at RUN TIME.
 */
export async function bindDisabledScheduleMandate(input: {
  organizationId: string;
  scheduleId: string;
  actorUserId: string;
  payload: DisabledScheduleMandateInput;
}) {
  const { organizationId, scheduleId, actorUserId } = input;
  if ([organizationId, scheduleId, actorUserId].some((value) => !value || value.length > 191)) {
    throw new EnterpriseWorkflowError("Périmètre du mandat invalide.", 400, "WORKFLOW_MANDATE_SCOPE_INVALID", "CONFIGURATION");
  }
  const payload = disabledScheduleMandateSchema.parse(input.payload);
  // Preflight is tenant scoped, never trust entity type from the client.
  const schedule = await prisma.enterpriseWorkflowSchedule.findFirst({
    where: { id: scheduleId, organizationId, status: "DISABLED" },
    include: {
      definition: { select: { status: true, archivedAt: true, currentVersionId: true, triggerEntityType: true } },
      version: { select: { status: true, definitionId: true } },
    },
  });
  if (!schedule) throw new EnterpriseWorkflowError("Horaire désactivé introuvable.", 404, "WORKFLOW_MANDATE_SCHEDULE_NOT_FOUND", "BUSINESS");
  if (
    schedule.revision !== payload.revision
    || schedule.definition.status !== "ACTIVE"
    || schedule.definition.archivedAt !== null
    || !schedule.definition.triggerEntityType
    || schedule.definition.currentVersionId !== schedule.workflowVersionId
    || schedule.version.status !== "PUBLISHED"
    || schedule.version.definitionId !== schedule.workflowDefinitionId
  ) {
    throw new EnterpriseWorkflowError("Horaire ou version modifié. Rechargez les données.", 409, "WORKFLOW_MANDATE_VERSION_CONFLICT", "BUSINESS");
  }
  const sourceEntityType = schedule.definition.triggerEntityType;
  const adapter = getWorkflowEntityAdapter(sourceEntityType);
  const entity = await adapter.loadEntity(organizationId, payload.sourceEntityId);
  if (entity.id !== payload.sourceEntityId || entity.organizationId !== organizationId) {
    throw new EnterpriseWorkflowError("L'entité métier n'appartient pas à cette entreprise.", 403, "WORKFLOW_MANDATE_SOURCE_SCOPE_DENIED", "SECURITY");
  }
  // No arbitrary delegated identity: bind ONLY the session user; no SYSTEM actor.
  const executionActor = await resolveWorkflowExecutionUser({
    organizationId, startedByUserId: actorUserId, adapter, entity, action: "read",
  });
  if (executionActor !== actorUserId) {
    throw new EnterpriseWorkflowError("L'identité de l'acteur ne correspond pas.", 403, "WORKFLOW_MANDATE_ACTOR_DENIED", "SECURITY");
  }

  return prisma.$transaction(async (tx) => {
    // Re-read mutable eligibility inside the transaction and CAS the revision.
    const live = await tx.enterpriseWorkflowSchedule.findFirst({
      where: { organizationId, id: scheduleId, status: "DISABLED", revision: payload.revision },
      include: {
        definition: { select: { status: true, archivedAt: true, currentVersionId: true, triggerEntityType: true } },
        version: { select: { status: true, definitionId: true } },
      },
    });
    if (!live || live.definition.status !== "ACTIVE" || live.definition.archivedAt !== null
      || live.definition.currentVersionId !== live.workflowVersionId
      || live.definition.triggerEntityType !== sourceEntityType
      || live.version.status !== "PUBLISHED" || live.version.definitionId !== live.workflowDefinitionId) {
      throw new EnterpriseWorkflowError("Mandat obsolète ou version remplacée.", 409, "WORKFLOW_MANDATE_VERSION_CONFLICT", "BUSINESS");
    }
    const membership = await tx.organizationMember.findFirst({
      where: {
        organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null,
        organization: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) throw new EnterpriseWorkflowError("Mandat refusé : acteur non membre actif.", 403, "WORKFLOW_MANDATE_ACTOR_REVOKED", "SECURITY");
    const updated = await tx.enterpriseWorkflowSchedule.updateMany({
      where: { organizationId, id: scheduleId, status: "DISABLED", revision: payload.revision },
      data: {
        sourceEntityType, sourceEntityId: payload.sourceEntityId,
        executionActorUserId: actorUserId, mandateVerifiedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new EnterpriseWorkflowError("Modification simultanée de cet horaire.", 409, "WORKFLOW_MANDATE_REVISION_CONFLICT", "BUSINESS");
    }
    return tx.enterpriseWorkflowSchedule.findFirstOrThrow({
      where: { id: scheduleId, organizationId, status: "DISABLED" },
      select: {
        id: true, organizationId: true, workflowDefinitionId: true,
        workflowVersionId: true, status: true, revision: true,
        sourceEntityType: true, sourceEntityId: true, executionActorUserId: true,
        mandateVerifiedAt: true,
      },
    });
  });
}
