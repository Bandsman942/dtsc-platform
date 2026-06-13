import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalId = z.union([z.literal(""), z.string().trim().min(1)]).optional();
const optionalNumber = z.union([z.literal(""), z.coerce.number().min(0)]).optional();
const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional());

export const healthPharmacyProductBaseSchema = z.object({
  name: text(200), genericName: optionalText(200), category: z.enum(["MEDICINE","MEDICAL_CONSUMABLE","MEDICAL_DEVICE","INJECTABLE","LAB_PRODUCT","HYGIENE_PRODUCT","EMERGENCY_PRODUCT","VACCINE","CARE_EQUIPMENT","OTHER"]),
  pharmaceuticalForm: optionalText(100), strength: optionalText(100), unit: text(80), description: optionalText(2000),
  initialStock: optionalNumber, minimumStock: z.coerce.number().min(0), criticalStock: optionalNumber, maximumStock: optionalNumber,
  trackBatches: z.boolean().default(true), trackExpiry: z.boolean().default(true), storageLocation: optionalText(300),
  purchasePrice: optionalNumber, sellingPrice: optionalNumber, billable: z.boolean().default(false), billingCode: optionalText(100), supplierReference: optionalText(300),
  isSensitive: z.boolean().default(false), controlLevel: z.enum(["STANDARD","MONITORED","SENSITIVE","HIGHLY_SENSITIVE"]).default("STANDARD"),
  prescriptionRequired: z.boolean().default(false), specialAuthorizationRequired: z.boolean().default(false), safetyNotes: optionalText(3000),
  status: z.enum(["ACTIVE","INACTIVE","OUT_OF_STOCK","ARCHIVED","BLOCKED"]).default("ACTIVE"),
});
export const healthPharmacyProductCreateSchema = healthPharmacyProductBaseSchema;
export const healthPharmacyProductUpdateSchema = healthPharmacyProductBaseSchema.partial().extend({ reason: optionalText(2000) });

export const healthPharmacyActionSchema = z.object({
  action: z.enum(["add_batch","stock_entry","stock_exit","dispense","adjust","archive","change_status","block_batch","archive_batch"]),
  productId: z.string().trim().min(1), batchId: optionalId, batchNumber: optionalText(120), quantity: optionalNumber,
  manufacturingDate: optionalDate, expiryDate: optionalDate, purchasePrice: optionalNumber, supplierReference: optionalText(300),
  source: optionalText(200), destination: optionalText(200), patientId: optionalId, consultationId: optionalId, departmentId: optionalId,
  prescriberId: optionalId, reason: optionalText(2000), comment: optionalText(3000), referenceDocument: optionalText(300), status: optionalText(80),
});
