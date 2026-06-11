import { z } from "zod";

const optionalId = z.string().trim().max(160).optional().or(z.literal(""));
const optionalText = z.string().trim().max(5000).optional().or(z.literal(""));
const optionalDate = z.string().trim().max(40).optional().or(z.literal(""));
const criticality = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const pharmacyQualityIncidentSchema = z.object({
  incidentNumber: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(3, "Le titre doit contenir au moins trois caractères.").max(240),
  incidentType: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(100),
  criticality,
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]),
  incidentDate: z.string().trim().min(8).max(40),
  reportedById: z.string().trim().min(1).max(160),
  reportingSource: z.string().trim().min(2).max(100),
  departmentId: optionalId, locationId: optionalId, sourceModule: optionalText, sourceEntityType: optionalText, sourceEntityId: optionalId,
  productId: optionalId, batchId: optionalId, saleId: optionalId, saleLineId: optionalId, prescriptionId: optionalId, receiptId: optionalId,
  returnEntityId: optionalId, supplierId: optionalId, alertId: optionalId,
  customerPatientName: optionalText, customerPatientContact: optionalText,
  quantityAffected: z.union([z.literal(""), z.coerce.number().positive().max(1_000_000_000)]).optional(),
  unit: optionalText, productCondition: optionalText, productStillAvailable: z.coerce.boolean().default(false),
  recallRequired: z.coerce.boolean().default(false), description: z.string().trim().min(5).max(10000), patientImpact: optionalText,
  immediateActionTaken: z.coerce.boolean().default(false), immediateAction: optionalText, assignedToId: optionalId, dueAt: optionalDate,
});

export const pharmacyQualityCreateSchema = z.object({
  entityType: z.enum(["investigation", "capa", "adverse-reaction", "complaint"]),
  incidentId: z.string().trim().min(1).max(160),
  title: optionalText, description: optionalText, status: optionalText, responsibleId: optionalId, dueAt: optionalDate,
  actionType: optionalText, required: z.coerce.boolean().optional(), method: optionalText, rootCause: optionalText, findings: optionalText, conclusion: optionalText,
  seriousness: optionalText, reactionDescription: optionalText, onsetAt: optionalDate, outcome: optionalText, actionTaken: optionalText, reporterType: optionalText,
  channel: optionalText, customerName: optionalText, customerContact: optionalText, requestedOutcome: optionalText,
});

export const pharmacyQualityActionSchema = z.object({
  action: z.enum(["submit", "triage", "assign", "take", "resolve", "close", "reopen", "reject", "cancel", "complete", "validate", "reject-capa", "quarantine-batch", "block-batch", "create-alert"]),
  comment: optionalText,
  assignedToId: optionalId,
});
