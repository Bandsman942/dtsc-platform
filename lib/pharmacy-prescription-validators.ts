import { z } from "zod";

const optionalText = z.string().trim().max(1500).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));
const optionalNumber = z.union([z.coerce.number().min(0), z.literal("")]).optional();

export const prescriptionLineSchema = z.object({
  prescribedProductText: z.string().trim().min(1).max(240),
  prescribedGenericName: z.string().trim().max(240).optional().or(z.literal("")),
  productId: optionalId,
  dosage: z.string().trim().max(120).optional().or(z.literal("")),
  pharmaceuticalForm: z.string().trim().max(120).optional().or(z.literal("")),
  prescribedQuantity: optionalNumber,
  prescribedUnit: z.string().trim().max(80).optional().or(z.literal("")),
  frequency: z.string().trim().max(180).optional().or(z.literal("")),
  duration: z.string().trim().max(180).optional().or(z.literal("")),
  administrationRoute: z.string().trim().max(180).optional().or(z.literal("")),
  posology: z.string().trim().max(500).optional().or(z.literal("")),
  substitutionAllowed: z.coerce.boolean().default(false),
  notes: optionalText,
});

export const pharmacyPrescriptionSchema = z.object({
  prescriptionNumber: z.string().trim().max(120).optional().or(z.literal("")),
  prescriptionType: z.enum(["SIMPLE", "CHRONIC", "RENEWABLE", "HOSPITAL", "PEDIATRIC", "EMERGENCY", "INSURANCE", "OTHER"]),
  prescriptionDate: z.coerce.date(),
  receivedAt: z.coerce.date(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  patientName: z.string().trim().min(1).max(200),
  patientAge: optionalNumber,
  patientSex: z.string().trim().max(80).optional().or(z.literal("")),
  patientPhone: z.string().trim().max(80).optional().or(z.literal("")),
  patientAddress: z.string().trim().max(500).optional().or(z.literal("")),
  patientType: z.string().trim().max(100).optional().or(z.literal("")),
  patientNotes: optionalText,
  prescriberName: z.string().trim().min(1).max(200),
  prescriberType: z.string().trim().max(120).optional().or(z.literal("")),
  prescriberIdentifier: z.string().trim().max(180).optional().or(z.literal("")),
  prescriberPhone: z.string().trim().max(80).optional().or(z.literal("")),
  prescriberFacility: z.string().trim().max(240).optional().or(z.literal("")),
  prescriberSpeciality: z.string().trim().max(180).optional().or(z.literal("")),
  prescriberAddress: z.string().trim().max(500).optional().or(z.literal("")),
  pharmacistId: optionalId,
  notes: optionalText,
  lines: z.array(prescriptionLineSchema).min(1).max(100),
});

export const prescriptionActionSchema = z.object({
  action: z.enum(["submit", "validate", "reject", "request-info", "match-line", "substitute-line", "mark-line-unavailable", "mark-partially-dispensed", "mark-dispensed", "create-sale", "archive"]),
  reason: optionalText,
  lineId: optionalId,
  productId: optionalId,
  substituteProductId: optionalId,
  dispensedQuantity: z.coerce.number().min(0).optional(),
});
