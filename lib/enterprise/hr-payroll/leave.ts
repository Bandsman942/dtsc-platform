import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveCustomerEmployee,
  assertOrganizationApprover,
  hrReference,
  publishHrEvent,
} from "@/lib/enterprise/hr-payroll/helpers";
import type { approvalDecisionSchema, leaveRequestCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type LeaveCreateInput = z.infer<typeof leaveRequestCreateSchema>;
type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export async function createEnterpriseLeaveRequest(organizationId: string, actorUserId: string, input: LeaveCreateInput) {
  if (input.endDate < input.startDate) throw new EnterpriseDomainError("LEAVE_DATE_RANGE_INVALID");
  if (input.partialDay && (input.startMinute === null || input.startMinute === undefined || input.endMinute === null || input.endMinute === undefined || input.endMinute <= input.startMinute)) {
    throw new EnterpriseDomainError("LEAVE_PARTIAL_TIME_INVALID");
  }
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId, "TIME_ATTENDANCE");
    const overlap = await tx.enterpriseLeaveRequest.findFirst({
      where: {
        organizationId,
        employeeId: employee.id,
        archivedAt: null,
        status: { in: ["SUBMITTED", "APPROVED"] },
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
      select: { id: true },
    });
    if (overlap) throw new EnterpriseDomainError("LEAVE_OVERLAP", 409);
    const request = await tx.enterpriseLeaveRequest.create({
      data: {
        organizationId,
        reference: hrReference("LEV"),
        employeeId: employee.id,
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        partialDay: input.partialDay,
        startMinute: input.startMinute ?? null,
        endMinute: input.endMinute ?? null,
        status: "SUBMITTED",
        reason: input.reason || null,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
        submittedAt: new Date(),
      },
    });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseLeaveRequest", targetEntityId: request.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseLeaveRequest", entityId: request.id, eventType: "LEAVE_SUBMITTED", summary: `Congé ${request.reference} soumis`, actorUserId, toStatus: "SUBMITTED" });
    return request;
  });
}

export async function decideEnterpriseLeaveRequest(organizationId: string, requestId: string, actorUserId: string, input: ApprovalDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.enterpriseLeaveRequest.findFirst({ where: { id: requestId, organizationId, status: "SUBMITTED", archivedAt: null } });
    if (!request) throw new EnterpriseDomainError("LEAVE_REQUEST_NOT_FOUND", 404);
    if (request.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    if (request.approverUserId !== actorUserId) throw new EnterpriseDomainError("NOT_LEAVE_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseLeaveRequest", targetEntityId: request.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const targetStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseLeaveRequest.updateMany({ where: { id: request.id, organizationId, revision: input.revision, status: "SUBMITTED" }, data: { status: targetStatus, decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: targetStatus, decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseLeaveRequest", entityId: request.id, eventType: `LEAVE_${targetStatus}`, summary: `Congé ${request.reference} ${targetStatus.toLowerCase()}`, actorUserId, fromStatus: "SUBMITTED", toStatus: targetStatus });
    return tx.enterpriseLeaveRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
}
