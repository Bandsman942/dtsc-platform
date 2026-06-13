import { z } from "zod";

const text = z.union([z.literal(""), z.string().trim().max(5000)]).optional();
const id = z.union([z.literal(""), z.string().trim().min(1)]).optional();
const date = z.preprocess((value) => value === "" ? undefined : value, z.coerce.date().optional());
const severity = z.enum(["MINOR", "MODERATE", "MAJOR", "CRITICAL", "SENTINEL"]);
const criticality = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const patientImpact = z.enum(["NO_HARM", "LIGHT_HARM", "MODERATE_HARM", "SEVERE_HARM", "DEATH", "UNKNOWN", "NOT_APPLICABLE"]);
const organizationImpact = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const probability = z.enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"]);

export const healthQualityIncidentCreateSchema = z.object({
  title: z.string().trim().min(3).max(240),
  incidentType: z.enum(["PATIENT_SAFETY", "PATIENT_IDENTIFICATION", "APPOINTMENT_ERROR", "CARE_DELAY", "CONSULTATION_ERROR", "PRESCRIPTION_ERROR", "MEDICATION_ERROR", "PHARMACY_DISPENSING_ERROR", "CRITICAL_STOCKOUT", "EXPIRED_PRODUCT", "LAB_INCIDENT", "LAB_RESULT_ERROR_DELAY", "BILLING_INCIDENT", "INSURANCE_INCIDENT", "PATIENT_COMPLAINT", "COMMUNICATION", "CONFIDENTIALITY", "UNAUTHORIZED_MEDICAL_ACCESS", "MEDICAL_DOCUMENT", "EQUIPMENT", "HYGIENE", "ADMINISTRATIVE", "OTHER"]),
  description: z.string().trim().min(10).max(10000),
  occurredAt: date,
  departmentId: id, patientId: id, appointmentId: id, consultationId: id, medicalRecordId: id, labRequestId: id,
  pharmacyDispensationId: id, pharmacyStockMovementId: id, invoiceId: id, coverageRequestId: id, staffAssignmentId: id,
  anonymousReport: z.boolean().default(false),
  initialSeverity: severity,
  initialCriticality: criticality,
  patientImpact: patientImpact.optional(),
  organizationalImpact: organizationImpact.optional(),
  recurrenceProbability: probability.optional(),
  detectability: z.enum(["EASY", "MEDIUM", "DIFFICULT", "AFTER_IMPACT"]).optional(),
  urgency: z.enum(["ROUTINE", "PRIORITY", "URGENT", "IMMEDIATE"]).optional(),
  patientInformed: z.boolean().default(false),
  immediateSupervisorInformed: z.boolean().default(false),
  observedConsequences: text, immediateActions: text, witnesses: text, internalNotes: text,
  confidentialityLevel: z.enum(["QUALITY_STANDARD", "SENSITIVE", "RESTRICTED", "HIGHLY_SENSITIVE"]).default("QUALITY_STANDARD"),
  containsSensitiveMedicalData: z.boolean().default(false),
  confidentialityIncident: z.boolean().default(false),
  restrictedAccess: z.boolean().default(false),
  confidentialityReason: text,
});

export const healthQualityIncidentUpdateSchema = z.object({
  title: z.string().trim().min(3).max(240).optional(),
  description: z.string().trim().min(10).max(10000).optional(),
  incidentType: healthQualityIncidentCreateSchema.shape.incidentType.optional(),
  assignedToId: id, dueDate: date, departmentId: id, patientId: id, consultationId: id, labRequestId: id, invoiceId: id, coverageRequestId: id,
  observedConsequences: text, immediateActions: text, witnesses: text, internalNotes: text,
  confidentialityLevel: healthQualityIncidentCreateSchema.shape.confidentialityLevel.optional(),
  restrictedAccess: z.boolean().optional(), confidentialityReason: text,
  reason: z.string().trim().min(3).max(2000).optional(),
});

export const healthQualityIncidentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("qualify"), confirmedSeverity: severity, confirmedCriticality: criticality, patientImpact, organizationalImpact: organizationImpact, recurrenceProbability: probability, escalationRequired: z.boolean(), assignedToId: z.string().min(1), dueDate: z.coerce.date(), notes: z.string().trim().min(3).max(5000) }),
  z.object({ action: z.literal("assign"), assignedToId: z.string().min(1), dueDate: z.coerce.date(), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("investigate"), investigationSummary: z.string().trim().min(10).max(10000), immediateCause: text, rootCause: text, contributingFactors: text, investigationConclusion: z.string().trim().min(3).max(10000), recommendations: text }),
  z.object({ action: z.literal("close"), finalConclusion: z.string().trim().min(10).max(10000), residualRisk: z.string().trim().min(3).max(3000), lessonsLearned: text, procedureUpdated: z.boolean(), closureNotes: text, openActionsJustification: text }),
  z.object({ action: z.literal("reopen"), reason: z.string().trim().min(5).max(2000) }),
  z.object({ action: z.literal("archive"), reason: z.string().trim().min(5).max(2000) }),
]);

export const healthQualityCorrectiveActionCreateSchema = z.object({
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(5).max(5000),
  actionType: z.enum(["CORRECTIVE", "PREVENTIVE", "TRAINING", "PROCEDURE_UPDATE", "DATA_CORRECTION", "PATIENT_COMMUNICATION", "EQUIPMENT_MAINTENANCE", "CONTROL_STRENGTHENING", "OTHER"]),
  responsibleUserId: z.string().min(1),
  responsibleStaffId: id,
  dueDate: z.coerce.date(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT", "CRITICAL"]).default("NORMAL"),
});

export const healthQualityCorrectiveActionUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("complete"), completionComment: z.string().trim().min(3).max(5000), evidenceUrl: text }),
  z.object({ action: z.literal("validate"), validationComment: text }),
  z.object({ action: z.literal("reject"), rejectionReason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(2000) }),
]);
