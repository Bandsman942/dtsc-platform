import { z } from "zod";
import { ENTERPRISE_REPORT_TYPES } from "@/lib/enterprise/finance/constants";

export const REPORT_SCHEDULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export const REPORT_SCHEDULE_PERIOD_MODES = ["ALL_AVAILABLE", "CURRENT_MONTH", "PREVIOUS_MONTH", "LAST_7_DAYS", "LAST_30_DAYS", "CUSTOM"] as const;
export const REPORT_SCHEDULE_DELIVERY_CHANNELS = ["ARCHIVE", "EMAIL"] as const;

const optionalId = z.string().trim().max(120).optional().or(z.literal(""));
const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

export const reportScheduleFiltersSchema = z.object({
  periodMode: z.enum(REPORT_SCHEDULE_PERIOD_MODES).default("PREVIOUS_MONTH"),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().or(z.literal("")),
  departmentId: optionalId,
  supplierId: optionalId,
  budgetId: optionalId,
  category: z.string().trim().max(120).optional().or(z.literal("")),
}).strict().superRefine((value, ctx) => {
  if (value.periodMode === "CUSTOM" && (!value.periodStart || !value.periodEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodStart"], message: "Une période personnalisée doit avoir une date de début et une date de fin." });
  }
  if (value.periodStart && value.periodEnd && value.periodStart > value.periodEnd) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "La fin de période doit être postérieure au début." });
  }
});

export const reportScheduleCreateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  reportType: z.enum(ENTERPRISE_REPORT_TYPES),
  reportTitle: z.string().trim().min(3).max(180),
  reportDescription: z.string().trim().max(2000).optional().or(z.literal("")),
  frequency: z.enum(REPORT_SCHEDULE_FREQUENCIES),
  timeZone: z.string().trim().min(1).max(80).default("UTC"),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59).default(0),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  filters: reportScheduleFiltersSchema,
  deliveryChannels: z.array(z.enum(REPORT_SCHEDULE_DELIVERY_CHANNELS)).min(1).max(2),
  recipientEmails: z.array(z.string().trim().email().max(254)).max(20).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.frequency === "WEEKLY" && value.dayOfWeek == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayOfWeek"], message: "Le jour de la semaine est obligatoire." });
  }
  if (value.frequency === "MONTHLY" && value.dayOfMonth == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayOfMonth"], message: "Le jour du mois est obligatoire." });
  }
  if (value.deliveryChannels.includes("EMAIL") && value.recipientEmails.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipientEmails"], message: "Ajoutez au moins un destinataire pour la livraison par e-mail." });
  }
});

export const reportScheduleUpdateSchema = z.object({
  action: z.enum(["ENABLE", "DISABLE", "ARCHIVE"]),
  revision: z.coerce.number().int().min(1),
}).strict();
