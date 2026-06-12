import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();

export const healthAppointmentBaseSchema = z.object({
  patientId: z.string().trim().min(1),
  professionalId: z.union([z.literal(""), z.string().trim().min(1)]).optional(),
  departmentId: z.union([z.literal(""), z.string().trim().min(1)]).optional(),
  appointmentDate: z.coerce.date(),
  estimatedDurationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  reason: z.string().trim().min(3).max(300),
  description: optionalText(2000),
  appointmentType: z.enum(["GENERAL_CONSULTATION", "SPECIALIST_CONSULTATION", "FOLLOW_UP", "CHECKUP", "EMERGENCY", "LABORATORY", "NURSING_CARE", "VACCINATION", "PRENATAL", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  administrativeNotes: optionalText(3000),
  internalNotes: optionalText(3000),
});

export const healthAppointmentCreateSchema = healthAppointmentBaseSchema;
export const healthAppointmentUpdateSchema = healthAppointmentBaseSchema.partial();
export const healthAppointmentActionSchema = z.object({
  action: z.enum(["confirm", "wait", "start", "complete", "cancel", "mark_absent", "convert_consultation"]),
  reason: optionalText(1000),
});
