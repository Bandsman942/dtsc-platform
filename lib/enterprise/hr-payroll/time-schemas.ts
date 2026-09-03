import { z } from "zod";

export const workScheduleCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  scheduleType: z.enum(["WEEKLY", "DATE"]).default("WEEKLY"),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional().nullable(),
  scheduleDate: z.coerce.date().optional().nullable(),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(1).max(1440),
  breakMinutes: z.coerce.number().int().min(0).max(1439).default(0),
  timezone: z.string().trim().min(1).max(120),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.endMinute <= value.startMinute) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L’heure de fin doit être postérieure à l’heure de début.", path: ["endMinute"] });
  if (value.breakMinutes >= value.endMinute - value.startMinute) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La pause doit rester inférieure à la durée planifiée.", path: ["breakMinutes"] });
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin d’effet ne peut pas précéder le début.", path: ["effectiveUntil"] });
  if (value.scheduleType === "WEEKLY" && !value.dayOfWeek) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choisissez le jour de la semaine.", path: ["dayOfWeek"] });
  if (value.scheduleType === "DATE" && !value.scheduleDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choisissez la date planifiée.", path: ["scheduleDate"] });
});

export const attendanceCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  attendanceDate: z.coerce.date(),
  observedStartAt: z.coerce.date().optional().nullable(),
  observedEndAt: z.coerce.date().optional().nullable(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "PARTIAL", "REMOTE"]).default("PRESENT"),
  source: z.enum(["MANUAL", "IMPORT", "SYSTEM"]).default("MANUAL"),
  siteId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).superRefine((value, ctx) => {
  if ((value.observedStartAt == null) !== (value.observedEndAt == null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Renseignez ensemble l’heure d’arrivée et l’heure de départ.", path: [value.observedStartAt == null ? "observedStartAt" : "observedEndAt"] });
  if (value.observedStartAt && value.observedEndAt && value.observedEndAt <= value.observedStartAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L’heure de départ doit être postérieure à l’heure d’arrivée.", path: ["observedEndAt"] });
});

export const leaveRequestCancelSchema = z.object({
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(2000),
});
