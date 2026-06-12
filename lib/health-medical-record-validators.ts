import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional());

export const healthMedicalRecordBaseSchema = z.object({
  patientId: z.string().trim().min(1),
  summary: optionalText(5000),
  activeProblems: optionalText(5000),
  riskFactors: optionalText(4000),
  importantHistorySummary: optionalText(5000),
  mainAllergiesSummary: optionalText(4000),
  chronicTreatmentsSummary: optionalText(5000),
  generalRecommendations: optionalText(5000),
  followUpNotes: optionalText(5000),
  confidentialityLevel: z.enum(["MEDICAL_STANDARD", "MEDICAL_RESTRICTED", "HIGHLY_CONFIDENTIAL"]).default("MEDICAL_STANDARD"),
});

export const healthMedicalRecordCreateSchema = healthMedicalRecordBaseSchema;
export const healthMedicalRecordUpdateSchema = healthMedicalRecordBaseSchema.partial();
export const healthMedicalRecordActionSchema = z.object({
  action: z.enum(["archive", "reactivate"]),
  reason: optionalText(2000),
});

export const healthMedicalRecordItemSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("history"), category: z.enum(["MEDICAL", "SURGICAL", "FAMILY", "OBSTETRIC", "SOCIAL", "OTHER"]), label: z.string().trim().min(2).max(300), description: optionalText(4000), occurredAt: optionalDate }),
  z.object({ entity: z.literal("allergy"), allergen: z.string().trim().min(2).max(300), allergyType: z.enum(["MEDICATION", "FOOD", "ENVIRONMENTAL", "CONTACT", "OTHER"]), reaction: optionalText(2000), severity: z.enum(["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING"]) }),
  z.object({ entity: z.literal("treatment"), medicationName: z.string().trim().min(2).max(300), dosage: optionalText(300), frequency: optionalText(300), route: optionalText(200), indication: optionalText(1000), startedAt: optionalDate, endedAt: optionalDate }),
  z.object({ entity: z.literal("alert"), alertType: z.enum(["ALLERGY", "MEDICAL_RISK", "TREATMENT", "FOLLOW_UP", "OTHER"]), title: z.string().trim().min(2).max(300), description: optionalText(2000), severity: z.enum(["MODERATE", "HIGH", "CRITICAL"]) }),
  z.object({ entity: z.literal("confidential_note"), title: z.string().trim().min(2).max(300), content: z.string().trim().min(3).max(8000), visibility: z.enum(["MEDICAL_TEAM", "MEDICAL_DIRECTOR_ONLY"]).default("MEDICAL_TEAM") }),
]);

export const healthMedicalRecordItemActionSchema = z.object({
  entity: z.enum(["history", "allergy", "treatment", "alert"]),
  itemId: z.string().trim().min(1),
  action: z.enum(["archive", "resolve", "reactivate"]),
  reason: optionalText(2000),
});
