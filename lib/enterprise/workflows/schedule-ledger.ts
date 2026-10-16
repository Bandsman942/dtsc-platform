import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getNextWorkflowOccurrence } from "@/lib/enterprise/workflows/advanced-schedule";
import { prisma } from "@/lib/prisma";

/**
 * WF-06S1 inert ledger operation. No production route, cron, event dispatcher or
 * worker imports this module. STAGED is an internal testing state only.
 *
 * Future activation MUST add authenticated tenant/member/module/entitlement
 * checks, a permissioned source-entity contract, capped catch-up and an
 * outbox/run receipt committed in the same transaction. This reservation never
 * creates an ERP run or executes a business side effect.
 */
export async function reserveDueStagedWorkflowOccurrence(
  organizationId: string,
  scheduleId: string,
  asOf: Date,
) {
  if (!organizationId || !scheduleId || organizationId.length > 191 || scheduleId.length > 191) {
    throw new Error("WORKFLOW_SCHEDULE_SCOPE_INVALID");
  }
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new Error("WORKFLOW_SCHEDULE_INSTANT_INVALID");
  }

  return prisma.$transaction(async (tx) => {
    // PostgreSQL row locks serialize the cursor and receipt. SKIP LOCKED
    // prevents concurrent workers from waiting or creating duplicate rows.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "EnterpriseWorkflowSchedule"
      WHERE "organizationId" = ${organizationId}
        AND "id" = ${scheduleId}
        AND "status" = 'STAGED'
        AND "nextRunAt" <= ${asOf}
      FOR UPDATE SKIP LOCKED
    `);
    if (locked.length === 0) return null;

    const schedule = await tx.enterpriseWorkflowSchedule.findFirst({
      where: { organizationId, id: scheduleId, status: "STAGED" },
      include: {
        definition: { select: { id: true, status: true, archivedAt: true, currentVersionId: true } },
        version: { select: { id: true, status: true, definitionId: true } },
      },
    });
    if (!schedule?.nextRunAt) throw new Error("WORKFLOW_SCHEDULE_CURSOR_INVALID");
    if (
      schedule.definition.status !== "ACTIVE" ||
      schedule.definition.archivedAt !== null ||
      schedule.definition.currentVersionId !== schedule.workflowVersionId ||
      schedule.version.status !== "PUBLISHED" ||
      schedule.version.definitionId !== schedule.workflowDefinitionId
    ) throw new Error("WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE");

    const config = {
      frequency: schedule.frequency,
      timeZone: schedule.timeZone,
      hour: schedule.hour,
      minute: schedule.minute,
      ...(schedule.frequency === "WEEKLY" ? { dayOfWeek: schedule.dayOfWeek } : {}),
    };
    const scope = {
      organizationId,
      scheduleId,
      versionId: schedule.workflowVersionId,
    };
    const dueAt = schedule.nextRunAt;
    const exactDue = getNextWorkflowOccurrence(config, new Date(dueAt.getTime() - 1), scope);
    if (!exactDue || exactDue.scheduledAt.getTime() !== dueAt.getTime()) {
      // Never advance a corrupted cursor or normalize a non-existent DST time.
      throw new Error("WORKFLOW_SCHEDULE_CURSOR_INCONSISTENT");
    }
    const following = getNextWorkflowOccurrence(config, dueAt, scope);
    if (!following || following.scheduledAt.getTime() <= dueAt.getTime()) {
      throw new Error("WORKFLOW_SCHEDULE_NEXT_MISSING");
    }
    const inserted = await tx.enterpriseWorkflowScheduleOccurrence.createMany({
      data: [{
        id: randomUUID(),
        organizationId,
        scheduleId,
        workflowVersionId: schedule.workflowVersionId,
        localDate: exactDue.localDate,
        localTime: exactDue.localTime,
        timeZone: exactDue.timeZone,
        scheduledAt: dueAt,
        occurrenceKey: exactDue.occurrenceKey,
        status: "RESERVED",
      }],
      skipDuplicates: true,
    });
    const cursor = await tx.enterpriseWorkflowSchedule.updateMany({
      where: {
        id: scheduleId,
        organizationId,
        status: "STAGED",
        revision: schedule.revision,
        nextRunAt: dueAt,
      },
      data: {
        nextRunAt: following.scheduledAt,
        revision: { increment: 1 },
      },
    });
    if (cursor.count !== 1) throw new Error("WORKFLOW_SCHEDULE_CURSOR_CONFLICT");

    // If a previous reservation already exists, still advance the cursor.
    // The DB UNIQUE indexes are the final anti-duplication authority.
    return inserted.count === 1 ? {
      organizationId,
      scheduleId,
      workflowVersionId: schedule.workflowVersionId,
      occurrenceKey: exactDue.occurrenceKey,
      localDate: exactDue.localDate,
      localTime: exactDue.localTime,
      scheduledAt: exactDue.scheduledAt,
      nextRunAt: following.scheduledAt,
    } : null;
  });
}
