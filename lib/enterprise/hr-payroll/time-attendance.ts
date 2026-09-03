import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertActiveCustomerEmployee, publishHrEvent } from "@/lib/enterprise/hr-payroll/helpers";
import type { attendanceCreateSchema, workScheduleCreateSchema, workScheduleEndSchema } from "@/lib/enterprise/hr-payroll/time-schemas";
import { prisma } from "@/lib/prisma";

type WorkScheduleInput = z.infer<typeof workScheduleCreateSchema>;
type WorkScheduleEndInput = z.infer<typeof workScheduleEndSchema>;
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

export async function endEnterpriseWorkSchedule(organizationId: string, scheduleId: string, actorUserId: string, input: WorkScheduleEndInput) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.enterpriseWorkSchedule.findFirst({ where: { id: scheduleId, organizationId, status: "ACTIVE", archivedAt: null } });
    if (!schedule) throw new EnterpriseDomainError("WORK_SCHEDULE_NOT_ACTIVE", 404);
    if (input.effectiveUntil < schedule.effectiveFrom) throw new EnterpriseDomainError("WORK_SCHEDULE_END_BEFORE_START", 409);
    const updated = await tx.enterpriseWorkSchedule.updateMany({
      where: { id: schedule.id, organizationId, status: "ACTIVE", revision: input.revision, archivedAt: null },
      data: { status: "ENDED", effectiveUntil: input.effectiveUntil, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseWorkSchedule",
      entityId: schedule.id,
      eventType: "WORK_SCHEDULE_ENDED",
      summary: "Horaire de travail clôturé",
      actorUserId,
      fromStatus: "ACTIVE",
      toStatus: "ENDED",
      metadataJson: { employeeId: schedule.employeeId, effectiveUntil: input.effectiveUntil.toISOString(), reason: input.reason },
    });
    return tx.enterpriseWorkSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createEnterpriseAttendance(organizationId: string, actorUserId: string, input: AttendanceInput) {
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    const resolvedSiteId = input.siteId || employee.siteId || null;
    const site = resolvedSiteId
      ? await tx.enterpriseSite.findFirst({ where: { id: resolvedSiteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, timezone: true } })
      : null;
    if (resolvedSiteId && !site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);

    const hasLocalObservedTime = input.observedStartMinute != null && input.observedEndMinute != null;
    if (hasLocalObservedTime && !site?.timezone) throw new EnterpriseDomainError("ATTENDANCE_SITE_TIMEZONE_REQUIRED", 409);
    if (input.status === "ABSENT" && (input.observedStartAt || input.observedEndAt || hasLocalObservedTime)) throw new EnterpriseDomainError("ATTENDANCE_ABSENT_WITH_OBSERVED_TIME", 409);

    let observedStartAt = input.observedStartAt || null;
    let observedEndAt = input.observedEndAt || null;
    if (hasLocalObservedTime && site?.timezone) {
      const dateKey = input.attendanceDate.toISOString().slice(0, 10);
      try {
        observedStartAt = zonedMinuteToUtc(dateKey, Number(input.observedStartMinute), site.timezone);
        observedEndAt = zonedMinuteToUtc(dateKey, Number(input.observedEndMinute), site.timezone);
      } catch (error) {
        if (error instanceof RangeError) throw new EnterpriseDomainError("ATTENDANCE_SITE_TIMEZONE_INVALID", 409);
        throw error;
      }
    }

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
        observedStartAt,
        observedEndAt,
        status: input.status,
        source: input.source,
        siteId: resolvedSiteId,
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
      metadataJson: { employeeId: attendance.employeeId, attendanceDate: attendance.attendanceDate.toISOString(), source: attendance.source, siteId: resolvedSiteId, timezone: site?.timezone || null },
    });
    return attendance;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function zonedMinuteToUtc(dateKey: string, minuteOfDay: number, timezone: string) {
  const dayOffset = Math.floor(minuteOfDay / 1440);
  const normalizedMinute = minuteOfDay % 1440;
  const baseDate = new Date(`${dateKey}T00:00:00.000Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  const effectiveDateKey = baseDate.toISOString().slice(0, 10);
  const [year, month, day] = effectiveDateKey.split("-").map(Number);
  const hour = Math.floor(normalizedMinute / 60);
  const minute = normalizedMinute % 60;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    candidate -= represented - wallClockUtc;
  }
  return new Date(candidate);
}
