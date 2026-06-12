import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalId = z.union([z.literal(""), z.string().trim().min(1)]).optional();
const optionalCapacity = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().min(1).max(500).optional());

export const healthStaffBaseSchema = z.object({
  organizationMemberId: z.string().trim().min(1),
  enterprisePositionId: z.string().trim().min(1),
  enterpriseDepartmentId: z.string().trim().min(1),
  healthSpecialtyId: optionalId,
  supervisorStaffId: optionalId,
  professionalNumber: optionalText(200),
  professionalOrder: optionalText(300),
  experienceLevel: optionalText(200),
  competenceArea: optionalText(1000),
  availabilityStatus: z.enum(["AVAILABLE", "UNAVAILABLE", "ON_LEAVE", "ON_CALL", "IN_CONSULTATION", "SUSPENDED"]).default("AVAILABLE"),
  usualWorkDays: z.array(z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])).max(7).optional(),
  usualStartTime: optionalText(10),
  usualEndTime: optionalText(10),
  dailyCapacity: optionalCapacity,
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VALIDATION", "ARCHIVED"]).default("ACTIVE"),
  permissions: z.array(z.string().trim().min(1).max(150)).max(100).optional(),
  notes: optionalText(3000),
});
export const healthStaffCreateSchema = healthStaffBaseSchema;
export const healthStaffUpdateSchema = healthStaffBaseSchema.partial();
export const healthStaffActionSchema = z.object({ action: z.enum(["suspend", "reactivate", "archive"]), reason: z.string().trim().min(3).max(2000) });
export const healthSpecialtySchema = z.object({ code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/), labelFr: z.string().trim().min(2).max(200), labelEn: optionalText(200), description: optionalText(1000), isActive: z.boolean().optional(), sortOrder: z.coerce.number().int().min(0).max(10000).optional() });
