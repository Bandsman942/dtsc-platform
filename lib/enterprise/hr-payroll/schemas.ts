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
}).superRefine((value, ctx) => {
  if ((value.baseCompensation == null) !== (value.compensationCurrency == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La rémunération et sa devise doivent être renseignées ensemble.", path: value.baseCompensation == null ? ["baseCompensation"] : ["compensationCurrency"] });
  }
});

export const EMPLOYMENT_CONTRACT_TYPES = ["EMPLOYMENT", "INDEFINITE", "FIXED_TERM", "CONSULTING", "INTERNSHIP"] as const;
export const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "UNPAID", "OTHER"] as const;

const employmentContractPayloadSchema = z.object({
  employeeId: z.string().trim().min(1).optional().nullable(),
  organizationMemberId: z.string().trim().min(1).optional().nullable(),
  contractType: z.enum(EMPLOYMENT_CONTRACT_TYPES),
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

function validateContractDates(value: { startDate: Date; endDate?: Date | null; probationEndDate?: Date | null }, ctx: z.RefinementCtx) {
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de fin ne peut pas précéder la date de début.", path: ["endDate"] });
  if (value.probationEndDate && value.probationEndDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin de période d’essai ne peut pas précéder le début du contrat.", path: ["probationEndDate"] });
  if (value.endDate && value.probationEndDate && value.probationEndDate > value.endDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La période d’essai doit se terminer avant la fin du contrat.", path: ["probationEndDate"] });
}

export const employmentContractCreateSchema = employmentContractPayloadSchema.superRefine((value, ctx) => {
  validateContractDates(value, ctx);
  const hasEmployee = Boolean(value.employeeId);
  const hasMember = Boolean(value.organizationMemberId);
  if (hasEmployee === hasMember) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sélectionnez exactement un collaborateur actif de l’entreprise.",
      path: hasEmployee ? ["organizationMemberId"] : ["employeeId"],
    });
  }
});
export const employmentContractUpdateSchema = employmentContractPayloadSchema.omit({ employeeId: true, organizationMemberId: true }).extend({ revision: z.coerce.number().int().positive() }).superRefine(validateContractDates);

function requireRejectionReason(value: { decision: "APPROVE" | "REJECT"; comment?: string | null }, ctx: z.RefinementCtx) {
  if (value.decision === "REJECT" && (!value.comment || value.comment.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un motif de refus est obligatoire.", path: ["comment"] });
  }
}

export const employmentContractDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
}).superRefine(requireRejectionReason);

export const leaveRequestCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  partialDay: z.boolean().default(false),
  startMinute: z.coerce.number().int().min(0).max(1439).optional().nullable(),
  endMinute: z.coerce.number().int().min(1).max(1440).optional().nullable(),
  reason: z.string().trim().max(4000).optional().nullable(),
  approverUserId: z.string().trim().min(1),
}).superRefine((value, ctx) => {
  if (value.endDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de fin ne peut pas précéder la date de début.", path: ["endDate"] });
  if (value.partialDay && (!Number.isInteger(value.startMinute) || !Number.isInteger(value.endMinute) || Number(value.endMinute) <= Number(value.startMinute))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indiquez une plage horaire valide pour l’absence partielle.", path: ["endMinute"] });
  }
  if (!value.partialDay && (value.startMinute != null || value.endMinute != null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les heures partielles ne sont autorisées que pour une absence partielle.", path: ["partialDay"] });
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
}).superRefine(requireRejectionReason);

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
}).superRefine((value, ctx) => {
  if ((value.startAt == null) !== (value.endAt == null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L’heure de début et l’heure de fin doivent être renseignées ensemble.", path: [value.startAt == null ? "startAt" : "endAt"] });
  if (value.startAt && value.endAt && value.endAt <= value.startAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L’heure de fin doit être postérieure à l’heure de début.", path: ["endAt"] });
  if (!value.startAt && value.breakMinutes >= value.declaredMinutes) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La pause ne peut pas couvrir toute la durée déclarée.", path: ["breakMinutes"] });
});

export const timesheetCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  approverUserId: z.string().trim().min(1),
  entries: z.array(timesheetEntrySchema).min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.periodEnd < value.periodStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin de période ne peut pas précéder le début.", path: ["periodEnd"] });
  value.entries.forEach((entry, index) => {
    if (entry.workDate < value.periodStart || entry.workDate > value.periodEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date travaillée doit appartenir à la période de la feuille de temps.", path: ["entries", index, "workDate"] });
  });
});

export const payrollPeriodCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(240),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  payDate: z.coerce.date().optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.periodEnd < value.periodStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin de période de paie ne peut pas précéder son début.", path: ["periodEnd"] });
  if (value.payDate && value.payDate < value.periodStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de paiement prévue ne peut pas précéder le début de la période.", path: ["payDate"] });
});

const payrollAdjustmentSchema = z.object({
  employeeId: z.string().trim().min(1),
  bonusAmount: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  bonusReason: z.string().trim().max(2000).optional().nullable(),
  deductionAmount: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  deductionReason: z.string().trim().max(2000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.bonusAmount > 0 && (!value.bonusReason || value.bonusReason.trim().length < 3)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Justifiez toute prime non nulle.", path: ["bonusReason"] });
  if (value.deductionAmount > 0 && (!value.deductionReason || value.deductionReason.trim().length < 3)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Justifiez toute retenue non nulle.", path: ["deductionReason"] });
});

export const payrollRunPrepareSchema = z.object({
  payrollPeriodId: z.string().trim().min(1),
  currency: z.string().trim().toUpperCase().length(3),
  employeeIds: z.array(z.string().trim().min(1)).min(1).max(2000),
  adjustments: z.array(payrollAdjustmentSchema).max(2000).default([]),
});

export const payrollRunSubmitSchema = z.object({
  approverUserId: z.string().trim().min(1),
  revision: z.coerce.number().int().positive(),
});

export const payrollRunDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
}).superRefine(requireRejectionReason);

export const payrollRunCancelSchema = z.object({
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(2000),
});