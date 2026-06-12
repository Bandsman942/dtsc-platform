import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalNumber = (min: number, max: number) => z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().min(min).max(max).optional());
const optionalInteger = (min: number, max: number) => z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().min(min).max(max).optional());

export const healthConsultationBaseSchema = z.object({
  patientId: z.string().trim().min(1),
  appointmentId: z.union([z.literal(""), z.string().trim().min(1)]).optional(),
  professionalId: z.string().trim().min(1),
  departmentId: z.union([z.literal(""), z.string().trim().min(1)]).optional(),
  consultationDate: z.coerce.date().optional(),
  consultationType: z.enum(["GENERAL", "SPECIALIST", "EMERGENCY", "FOLLOW_UP", "CHECKUP", "PRENATAL", "PEDIATRICS", "NURSING_CARE", "TELECONSULTATION", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  chiefComplaint: z.string().trim().min(3).max(500),
  reason: z.string().trim().min(3).max(1000),
  historyOfPresentIllness: optionalText(6000), symptoms: optionalText(4000), symptomDuration: optionalText(500), aggravatingFactors: optionalText(2000), relievingFactors: optionalText(2000), relevantHistory: optionalText(4000),
  temperature: optionalNumber(25, 50), systolicBp: optionalInteger(40, 300), diastolicBp: optionalInteger(20, 200), heartRate: optionalInteger(20, 300), respiratoryRate: optionalInteger(5, 100), oxygenSaturation: optionalNumber(30, 100), weight: optionalNumber(0.2, 500), height: optionalNumber(0.2, 3), capillaryGlucose: optionalNumber(0, 1000), painScore: optionalInteger(0, 10), vitalsNotes: optionalText(3000),
  generalCondition: optionalText(3000), cardiovascularExam: optionalText(3000), respiratoryExam: optionalText(3000), abdominalExam: optionalText(3000), neurologicalExam: optionalText(3000), entExam: optionalText(3000), dermatologicalExam: optionalText(3000), musculoskeletalExam: optionalText(3000), otherExamNotes: optionalText(4000), clinicalConclusion: optionalText(4000),
  provisionalDiagnosis: optionalText(3000), finalDiagnosis: optionalText(3000), differentialDiagnoses: optionalText(4000), diagnosisCertainty: z.enum(["", "SUSPECTED", "PROBABLE", "CONFIRMED", "REASSESS"]).optional(), diagnosisCode: optionalText(100), diagnosisNotes: optionalText(4000),
  managementPlan: optionalText(5000), treatmentPlan: optionalText(5000), prescriptionText: optionalText(6000), requestedTests: optionalText(5000), referralNotes: optionalText(4000),
  hospitalizationRecommended: z.boolean().optional(), sickLeaveRecommended: z.boolean().optional(), followUpRecommended: z.boolean().optional(), followUpDate: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional()),
  patientAdvice: optionalText(5000), warningSigns: optionalText(5000), lifestyleRecommendations: optionalText(5000), returnInstructions: optionalText(5000),
});

export const healthConsultationCreateSchema = healthConsultationBaseSchema;
export const healthConsultationUpdateSchema = healthConsultationBaseSchema.partial();
export const healthConsultationActionSchema = z.object({
  action: z.enum(["start", "wait_exams", "resume", "review", "close", "reopen", "cancel"]),
  reason: optionalText(2000),
});
