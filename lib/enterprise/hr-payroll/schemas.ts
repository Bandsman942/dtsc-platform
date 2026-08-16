import { z } from "zod";

export const employeeCreateSchema = z.object({
  organizationMemberId: z.string().trim().min(1).optional().nullable(),
  businessPartyId: z.string().trim().min(1).optional().nullable(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(200).optional().nullable(),
  workPhone: z.string().trim().max(80).optional().nullable(),
  positionId: z.string().trim().min(1).optional().nullable(),
  positionCode: z.string().trim().max(120).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  managerEmployeeId: z.string().trim().min(1).optional().nullable(),
  siteId: z.string().trim().min(1).optional().nullable(),
  hireDate: z.coerce.date(),
  employmentType: z.string().trim().max(120).optional().nullable(),
  baseCompensation: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  compensationCurrency: z.string().trim().toUpperCase().length(3).optional().nullable(),
});

export const employmentContractCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  contractType: z.string().trim().min(2).max(120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  probationEndDate: z.coerce.date().optional().nullable(),
  jobTitle: z.string().trim().max(240).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  siteId: z.string().trim().min(1).optional().nullable(),
  baseCompensation: z.coerce.number().nonnegative().max(1_000_000_000),
  compensationCurrency: z.string().trim().toUpperCase().length(3),
  payFrequency: z.enum(["MONTHLY", "BIWEEKLY", "WEEKLY", "DAILY", "HOURLY"]).default("MONTHLY"),
  standardHoursPerWeek: z.coerce.number().positive().max(168).optional().nullable(),
  terms: z.string().trim().max(12000).optional().nullable(),
  approverUserId: z.string().trim().min(1),
});

export const employmentContractUpdateSchema = employmentContractCreateSchema.omit({ employeeId: true }).extend({
  revision: z.coerce.number().int().positive(),
});

export const employmentContractDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const leaveRequestCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  leaveType: z.string().trim().min(2).max(120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  partialDay: z.boolean().default(false),
  startMinute: z.coerce.number().int().min(0).max(1439).optional().nullable(),
  endMinute: z.coerce.number().int().min(1).max(1440).optional().nullable(),
  reason: z.string().trim().max(4000).optional().nullable(),
  approverUserId: z.string().trim().min(1),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const timesheetEntrySchema = z.object({
  workDate: z.coerce.date(),
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
  breakMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  declaredMinutes: z.coerce.number().int().positive().max(1440),
  projectId: z.string().trim().min(1).optional().nullable(),
  milestoneId: z.string().trim().min(1).optional().nullable(),
  deliverableId: z.string().trim().min(1).optional().nullable(),
  taskId: z.string().trim().min(1).optional().nullable(),
  contractId: z.string().trim().min(1).optional().nullable(),
  businessPartyId: z.string().trim().min(1).optional().nullable(),
  catalogItemId: z.string().trim().min(1).optional().nullable(),
  serviceDescription: z.string().trim().max(1000).optional().nullable(),
  billable: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const timesheetCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  approverUserId: z.string().trim().min(1),
  entries: z.array(timesheetEntrySchema).min(1).max(500),
});

export const payrollPeriodCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(240),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  payDate: z.coerce.date().optional().nullable(),
});

export const payrollRunPrepareSchema = z.object({
  payrollPeriodId: z.string().trim().min(1),
  currency: z.string().trim().toUpperCase().length(3),
  employeeIds: z.array(z.string().trim().min(1)).min(1).max(2000),
  adjustments: z.array(z.object({
    employeeId: z.string().trim().min(1),
    bonusAmount: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
    bonusReason: z.string().trim().max(2000).optional().nullable(),
    deductionAmount: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
    deductionReason: z.string().trim().max(2000).optional().nullable(),
  })).max(2000).default([]),
});

export const payrollRunSubmitSchema = z.object({
  approverUserId: z.string().trim().min(1),
  revision: z.coerce.number().int().positive(),
});

export const payrollRunDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const payrollRunCancelSchema = z.object({
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(2000),
});
