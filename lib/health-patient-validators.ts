import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();

export const healthPatientBaseSchema = z.object({
  fullName: z.string().trim().min(3).max(180),
  sex: z.enum(["FEMALE", "MALE", "OTHER", "NOT_SPECIFIED"]),
  birthDate: z.union([z.literal(""), z.coerce.date().max(new Date())]).optional(),
  phonePrimary: z.string().trim().min(5).max(80),
  phoneSecondary: optionalText(80),
  email: z.union([z.literal(""), z.string().trim().email().max(180)]).optional(),
  address: z.string().trim().min(3).max(300),
  city: optionalText(120),
  country: optionalText(120),
  emergencyContactName: z.string().trim().min(3).max(180),
  emergencyContactRelationship: optionalText(100),
  emergencyContactPhone: z.string().trim().min(5).max(80),
  emergencyContactAddress: optionalText(300),
  profession: optionalText(140),
  maritalStatus: optionalText(80),
  bloodGroup: optionalText(20),
  knownAllergies: optionalText(3000),
  importantHistory: optionalText(5000),
  chronicTreatments: optionalText(5000),
  medicalNotes: optionalText(5000),
  administrativeNotes: optionalText(3000),
  insuranceKnown: z.boolean().default(false),
  insuranceReference: optionalText(180),
  registrationSource: z.enum(["RECEPTION", "CONSULTATION", "EMERGENCY", "EXTERNAL_REFERRAL", "MEDICAL_CAMPAIGN", "OTHER"]),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED", "DECEASED"]).default("ACTIVE"),
});

export const healthPatientCreateSchema = healthPatientBaseSchema;
export const healthPatientUpdateSchema = healthPatientBaseSchema.partial().extend({
  actionReason: optionalText(1000),
});
