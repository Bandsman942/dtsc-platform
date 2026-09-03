import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertActiveCustomerEmployee, publishHrEvent } from "@/lib/enterprise/hr-payroll/helpers";
import type { attendanceCreateSchema, workScheduleCreateSchema } from "@/lib/enterprise/hr-payroll/time-schemas";
import { prisma } from "@/lib/prisma";

type WorkScheduleInput = z.infer<typeof workScheduleCreateSchema>;
type AttendanceInput = z.infer<typeof attendanceCreateSchema>;

export async function createEnterpriseWorkSchedule(organizationId: string, actorUserId: string, input: WorkScheduleInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    const overlap = await tx.enterpriseWorkSchedule.findFirst({
      where: {
        organizationId,
        employeeId: input.employeeId,
        status: "ACTIVE",
        archivedAt: null,
        scheduleType: input.scheduleType,
        ...(input.scheduleType === "WEEKLY" ? { dayOfWeek: input.dayOfWeek } : { scheduleDate: input.scheduleDate }),
        effectiveFrom: { lte: input.effectiveUntil || new Date("9999-12-31T00:00:00.000Z") },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: input.effectiveFrom } }],
        startMinute: { lt: input.endMinute },
        endMinute: { gt: input.startMinute },
      },
      select: { id: true },
    });
    if (overlap) throw new EnterpriseDomainError("WORK_SCHEDULE_OVERLAP", 409);

    const schedule = await tx.enterpriseWorkSchedule.create({
      data: {
        organizationId,
        employeeId: input.employeeId,
        scheduleType: input.scheduleType,
        dayOfWeek: input.scheduleType === "WEEKLY" ? input.dayOfWeek || null : null,
        scheduleDate: input.scheduleType === "DATE" ? input.scheduleDate || null : null,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        breakMinutes: input.breakMinutes,
        timezone: input.timezone,
        status: "ACTIVE",
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil || null,
        createdByUserId: actorUserId,
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseWorkSchedule",
      entityId: schedule.id,
      eventType: "WORK_SCHEDULE_CREATED",
      summary: "Horaire de travail planifié",
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { employeeId: schedule.employeeId, scheduleType: schedule.scheduleType },
    });
    return schedule;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createEnterpriseAttendance(organizationId: string, actorUserId: string, input: AttendanceInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    if (input.siteId) {
      const site = await tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);
    }
    if (input.status === "ABSENT" && (input.observedStartAt || input.observedEndAt)) throw new EnterpriseDomainError("ATTENDANCE_ABSENT_WITH_OBSERVED_TIME", 409);

    const existing = await tx.enterpriseAttendance.findFirst({
      where: { organizationId, employeeId: input.employeeId, attendanceDate: input.attendanceDate },
      select: { id: true },
    });
    if (existing) throw new EnterpriseDomainError("ATTENDANCE_ALREADY_RECORDED", 409);

    if (input.status !== "ABSENT") {
      const approvedLeave = await tx.enterpriseLeaveRequest.findFirst({
        where: {
          organizationId,
          employeeId: input.employeeId,
          status: "APPROVED",
          archivedAt: null,
          startDate: { lte: input.attendanceDate },
          endDate: { gte: input.attendanceDate },
        },
        select: { id: true, partialDay: true },
      });
      if (approvedLeave && !approvedLeave.partialDay) throw new EnterpriseDomainError("ATTENDANCE_APPROVED_LEAVE_CONFLICT", 409);
    }

    const attendance = await tx.enterpriseAttendance.create({
      data: {
        organizationId,
        employeeId: input.employeeId,
        attendanceDate: input.attendanceDate,
        observedStartAt: input.observedStartAt || null,
        observedEndAt: input.observedEndAt || null,
        status: input.status,
        source: input.source,
        siteId: input.siteId || null,
        notes: input.notes || null,
        recordedByUserId: actorUserId,
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseAttendance",
      entityId: attendance.id,
      eventType: "ATTENDANCE_RECORDED",
      summary: "Présence observée enregistrée",
      actorUserId,
      toStatus: attendance.status,
      metadataJson: { employeeId: attendance.employeeId, attendanceDate: attendance.attendanceDate.toISOString(), source: attendance.source },
    });
    return attendance;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
