import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveCustomerEmployee,
  assertOrganizationApprover,
  hrReference,
  publishHrEvent,
} from "@/lib/enterprise/hr-payroll/helpers";
import type { approvalDecisionSchema, timesheetCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type TimesheetCreateInput = z.infer<typeof timesheetCreateSchema>;
type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export async function createEnterpriseTimesheet(organizationId: string, actorUserId: string, input: TimesheetCreateInput) {
  if (input.periodEnd < input.periodStart) throw new EnterpriseDomainError("TIMESHEET_PERIOD_INVALID");
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId);
    const overlap = await tx.enterpriseTimesheet.findFirst({
      where: {
        organizationId,
        employeeId: employee.id,
        archivedAt: null,
        status: { notIn: ["REJECTED"] },
        periodStart: { lte: input.periodEnd },
        periodEnd: { gte: input.periodStart },
      },
      select: { id: true },
    });
    if (overlap) throw new EnterpriseDomainError("TIMESHEET_PERIOD_OVERLAP", 409);

    for (const entry of input.entries) {
      if (entry.workDate < input.periodStart || entry.workDate > input.periodEnd) throw new EnterpriseDomainError("TIMESHEET_ENTRY_OUTSIDE_PERIOD");
      if (entry.startAt && entry.endAt && entry.endAt <= entry.startAt) throw new EnterpriseDomainError("TIMESHEET_ENTRY_TIME_INVALID");
      if (entry.projectId) {
        const project = await tx.enterpriseProject.findFirst({ where: { id: entry.projectId, organizationId, archivedAt: null }, select: { id: true } });
        if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
      }
    }
    const totalDeclaredMinutes = input.entries.reduce((sum, entry) => sum + entry.declaredMinutes, 0);
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
          create: input.entries.map((entry) => ({
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
  return prisma.$transaction(async (tx) => {
    const timesheet = await tx.enterpriseTimesheet.findFirst({ where: { id: timesheetId, organizationId, status: "SUBMITTED", archivedAt: null }, include: { entries: true } });
    if (!timesheet) throw new EnterpriseDomainError("TIMESHEET_NOT_FOUND", 404);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseTimesheet", targetEntityId: timesheet.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    if (approval.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);

    const targetStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const totalApprovedMinutes = input.decision === "APPROVE" ? timesheet.totalDeclaredMinutes : 0;
    if (input.decision === "APPROVE") {
      await tx.enterpriseTimesheetEntry.updateMany({ where: { organizationId, timesheetId: timesheet.id }, data: { approvedMinutes: { set: 0 } } });
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
        rejectionComment: input.decision === "REJECT" ? input.comment || null : null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: targetStatus, decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseTimesheet", entityId: timesheet.id, eventType: `TIMESHEET_${targetStatus}`, summary: `Timesheet ${timesheet.reference} ${targetStatus.toLowerCase()}`, actorUserId, fromStatus: "SUBMITTED", toStatus: targetStatus, metadataJson: { totalApprovedMinutes } });
    return tx.enterpriseTimesheet.findUniqueOrThrow({ where: { id: timesheet.id }, include: { entries: true } });
  });
}
