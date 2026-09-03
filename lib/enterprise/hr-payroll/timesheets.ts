import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveCustomerEmployee,
  assertOrganizationApprovalDecision,
  assertOrganizationApprover,
  hrReference,
  publishHrEvent,
} from "@/lib/enterprise/hr-payroll/helpers";
import type { approvalDecisionSchema, timesheetCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type TimesheetCreateInput = z.infer<typeof timesheetCreateSchema>;
type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
type TimesheetEntryInput = TimesheetCreateInput["entries"][number];

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function assertAllResolved(requested: string[], resolved: Array<{ id: string }>, code: string) {
  const ids = new Set(resolved.map((item) => item.id));
  if (requested.some((id) => !ids.has(id))) throw new EnterpriseDomainError(code, 404);
}

function normalizedDeclaredMinutes(entry: TimesheetEntryInput) {
  if (!entry.startAt || !entry.endAt) return entry.declaredMinutes;
  const elapsedMinutes = Math.round((entry.endAt.getTime() - entry.startAt.getTime()) / 60_000);
  const workedMinutes = elapsedMinutes - entry.breakMinutes;
  if (workedMinutes <= 0 || workedMinutes > 1440) throw new EnterpriseDomainError("TIMESHEET_ENTRY_DURATION_INVALID", 409);
  return workedMinutes;
}

async function assertTimesheetReferences(tx: Prisma.TransactionClient, organizationId: string, entries: TimesheetEntryInput[]) {
  const projectIds = unique(entries.map((entry) => entry.projectId));
  const milestoneIds = unique(entries.map((entry) => entry.milestoneId));
  const deliverableIds = unique(entries.map((entry) => entry.deliverableId));
  const taskIds = unique(entries.map((entry) => entry.taskId));
  const contractIds = unique(entries.map((entry) => entry.contractId));
  const businessPartyIds = unique(entries.map((entry) => entry.businessPartyId));
  const catalogItemIds = unique(entries.map((entry) => entry.catalogItemId));

  const [projects, milestones, deliverables, tasks, contracts, parties, catalogItems] = await Promise.all([
    projectIds.length ? tx.enterpriseProject.findMany({ where: { organizationId, id: { in: projectIds } }, select: { id: true } }) : [],
    milestoneIds.length ? tx.enterpriseProjectMilestone.findMany({ where: { organizationId, id: { in: milestoneIds } }, select: { id: true, projectId: true } }) : [],
    deliverableIds.length ? tx.enterpriseProjectDeliverable.findMany({ where: { organizationId, id: { in: deliverableIds } }, select: { id: true, projectId: true } }) : [],
    taskIds.length ? tx.enterpriseTask.findMany({ where: { organizationId, id: { in: taskIds } }, select: { id: true } }) : [],
    contractIds.length ? tx.enterpriseContract.findMany({ where: { organizationId, id: { in: contractIds } }, select: { id: true } }) : [],
    businessPartyIds.length ? tx.enterpriseBusinessParty.findMany({ where: { organizationId, id: { in: businessPartyIds } }, select: { id: true } }) : [],
    catalogItemIds.length ? tx.enterpriseCatalogItem.findMany({ where: { organizationId, id: { in: catalogItemIds } }, select: { id: true } }) : [],
  ]);

  assertAllResolved(projectIds, projects, "TIMESHEET_PROJECT_NOT_FOUND");
  assertAllResolved(milestoneIds, milestones, "TIMESHEET_MILESTONE_NOT_FOUND");
  assertAllResolved(deliverableIds, deliverables, "TIMESHEET_DELIVERABLE_NOT_FOUND");
  assertAllResolved(taskIds, tasks, "TIMESHEET_TASK_NOT_FOUND");
  assertAllResolved(contractIds, contracts, "TIMESHEET_CONTRACT_NOT_FOUND");
  assertAllResolved(businessPartyIds, parties, "TIMESHEET_PARTY_NOT_FOUND");
  assertAllResolved(catalogItemIds, catalogItems, "TIMESHEET_CATALOG_ITEM_NOT_FOUND");

  const milestoneProject = new Map(milestones.map((item) => [item.id, item.projectId]));
  const deliverableProject = new Map(deliverables.map((item) => [item.id, item.projectId]));
  for (const entry of entries) {
    if (entry.projectId && entry.milestoneId && milestoneProject.get(entry.milestoneId) !== entry.projectId) throw new EnterpriseDomainError("TIMESHEET_MILESTONE_PROJECT_MISMATCH", 409);
    if (entry.projectId && entry.deliverableId && deliverableProject.get(entry.deliverableId) !== entry.projectId) throw new EnterpriseDomainError("TIMESHEET_DELIVERABLE_PROJECT_MISMATCH", 409);
  }
}

export async function createEnterpriseTimesheet(organizationId: string, actorUserId: string, input: TimesheetCreateInput) {
  if (input.periodEnd < input.periodStart) throw new EnterpriseDomainError("TIMESHEET_PERIOD_INVALID");
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId, "TIME_ATTENDANCE");
    const overlap = await tx.enterpriseTimesheet.findFirst({
      where: {
        organizationId,
        employeeId: employee.id,
        archivedAt: null,
        status: { notIn: ["REJECTED", "CANCELLED"] },
        periodStart: { lte: input.periodEnd },
        periodEnd: { gte: input.periodStart },
      },
      select: { id: true },
    });
    if (overlap) throw new EnterpriseDomainError("TIMESHEET_PERIOD_OVERLAP", 409);

    await assertTimesheetReferences(tx, organizationId, input.entries);
    const entries = input.entries.map((entry) => {
      if (entry.workDate < input.periodStart || entry.workDate > input.periodEnd) throw new EnterpriseDomainError("TIMESHEET_ENTRY_OUTSIDE_PERIOD");
      const declaredMinutes = normalizedDeclaredMinutes(entry);
      return { ...entry, declaredMinutes };
    });
    const totalDeclaredMinutes = entries.reduce((sum, entry) => sum + entry.declaredMinutes, 0);

    const timesheet = await tx.enterpriseTimesheet.create({
      data: {
        organizationId,
        reference: hrReference("TS"),
        employeeId: employee.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "SUBMITTED",
        totalDeclaredMinutes,
        submittedAt: new Date(),
        approverUserId: input.approverUserId,
        entries: {
          create: entries.map((entry) => ({
            organizationId,
            workDate: entry.workDate,
            startAt: entry.startAt || null,
            endAt: entry.endAt || null,
            breakMinutes: entry.breakMinutes,
            declaredMinutes: entry.declaredMinutes,
            projectId: entry.projectId || null,
            milestoneId: entry.milestoneId || null,
            deliverableId: entry.deliverableId || null,
            taskId: entry.taskId || null,
            contractId: entry.contractId || null,
            businessPartyId: entry.businessPartyId || null,
            catalogItemId: entry.catalogItemId || null,
            serviceDescription: entry.serviceDescription || null,
            billable: entry.billable,
            notes: entry.notes || null,
          })),
        },
      },
      include: { entries: { orderBy: [{ workDate: "asc" }, { createdAt: "asc" }] } },
    });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseTimesheet", targetEntityId: timesheet.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseTimesheet", entityId: timesheet.id, eventType: "TIMESHEET_SUBMITTED", summary: `Timesheet ${timesheet.reference} soumis`, actorUserId, toStatus: "SUBMITTED", metadataJson: { totalDeclaredMinutes } });
    return timesheet;
  });
}

export async function decideEnterpriseTimesheet(organizationId: string, timesheetId: string, actorUserId: string, input: ApprovalDecisionInput) {
  const pending = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseTimesheet", targetEntityId: timesheetId, status: "PENDING", archivedAt: null },
    select: { requestedByUserId: true, approverUserId: true },
  });
  if (!pending) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  await assertOrganizationApprovalDecision({
    organizationId,
    requesterUserId: pending.requestedByUserId,
    approverUserId: pending.approverUserId,
    actorUserId,
    moduleCode: "TIME_ATTENDANCE",
  });

  return prisma.$transaction(async (tx) => {
    const timesheet = await tx.enterpriseTimesheet.findFirst({ where: { id: timesheetId, organizationId, status: "SUBMITTED", archivedAt: null }, include: { entries: true } });
    if (!timesheet) throw new EnterpriseDomainError("TIMESHEET_NOT_FOUND", 404);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseTimesheet", targetEntityId: timesheet.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);

    const targetStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const totalApprovedMinutes = input.decision === "APPROVE" ? timesheet.totalDeclaredMinutes : 0;
    if (input.decision === "APPROVE") {
      for (const entry of timesheet.entries) {
        await tx.enterpriseTimesheetEntry.update({ where: { id: entry.id }, data: { approvedMinutes: entry.declaredMinutes } });
      }
    }
    const updated = await tx.enterpriseTimesheet.updateMany({
      where: { id: timesheet.id, organizationId, revision: input.revision, status: "SUBMITTED" },
      data: {
        status: targetStatus,
        totalApprovedMinutes,
        approvedAt: input.decision === "APPROVE" ? new Date() : null,
        rejectedAt: input.decision === "REJECT" ? new Date() : null,
        rejectionComment: input.decision === "REJECT" ? input.comment : null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: targetStatus, decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseTimesheet", entityId: timesheet.id, eventType: `TIMESHEET_${targetStatus}`, summary: `Timesheet ${timesheet.reference} ${targetStatus.toLowerCase()}`, actorUserId, fromStatus: "SUBMITTED", toStatus: targetStatus, metadataJson: { totalApprovedMinutes } });
    return tx.enterpriseTimesheet.findUniqueOrThrow({ where: { id: timesheet.id }, include: { entries: true } });
  });
}
