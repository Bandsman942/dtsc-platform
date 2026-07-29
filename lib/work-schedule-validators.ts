import { z } from "zod";
import { SCHEDULE_EXCEPTION_TYPES } from "@/lib/work-schedule";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateOnlySchema = z.coerce.date();

function validTimeRange(data: { startTime?: string; endTime?: string }) {
  return !data.startTime || !data.endTime || data.startTime < data.endTime;
}

function validEffectiveRange(data: { effectiveFrom?: Date | null; effectiveUntil?: Date | null }) {
  return !data.effectiveFrom || !data.effectiveUntil || data.effectiveUntil >= data.effectiveFrom;
}

export const weeklyAvailabilityCreateSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  locationMode: z.enum(["Site DTSC", "Télétravail", "Hybride", "Non défini"]).default("Non défini"),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
  effectiveFrom: dateOnlySchema.optional().nullable(),
  effectiveUntil: dateOnlySchema.optional().nullable(),
}).strict().refine(validTimeRange, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
}).refine(validEffectiveRange, {
  message: "La date de fin d'effet doit être postérieure à la date de début.",
  path: ["effectiveUntil"],
});

export const weeklyAvailabilityUpdateSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Hybride", "Non défini"]).optional(),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
  effectiveFrom: dateOnlySchema.optional().nullable(),
  effectiveUntil: dateOnlySchema.optional().nullable(),
}).strict().refine(validTimeRange, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
}).refine(validEffectiveRange, {
  message: "La date de fin d'effet doit être postérieure à la date de début.",
  path: ["effectiveUntil"],
});

export const scheduleExceptionCreateSchema = z.object({
  type: z.enum(SCHEDULE_EXCEPTION_TYPES),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  reason: z.string().trim().max(800).optional().or(z.literal("")),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"]).default("Non défini"),
}).strict().refine((data) => data.endDateTime > data.startDateTime, {
  message: "La fin de l'exception doit être après le début.",
  path: ["endDateTime"],
});

export const scheduleExceptionUpdateSchema = z.object({
  type: z.enum(SCHEDULE_EXCEPTION_TYPES).optional(),
  startDateTime: z.coerce.date().optional(),
  endDateTime: z.coerce.date().optional(),
  reason: z.string().trim().max(800).optional().or(z.literal("")),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"]).optional(),
}).strict().refine((data) => !data.startDateTime || !data.endDateTime || data.endDateTime > data.startDateTime, {
  message: "La fin de l'exception doit être après le début.",
  path: ["endDateTime"],
});
