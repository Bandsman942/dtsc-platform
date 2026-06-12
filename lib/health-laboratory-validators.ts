import { z } from "zod";

const optionalText = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).optional();
const optionalId = z.union([z.literal(""), z.string().trim().min(1)]).optional();
const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional());

export const healthLabRequestBaseSchema = z.object({
  patientId: z.string().trim().min(1),
  consultationId: optionalId,
  requestedById: z.string().trim().min(1),
  assignedLabStaffId: optionalId,
  mainTestId: z.string().trim().min(1),
  testIds: z.array(z.string().trim().min(1)).min(1).max(30),
  clinicalIndication: optionalText(3000),
  medicalNotes: optionalText(4000),
  sampleType: z.enum(["BLOOD","URINE","STOOL","SWAB","BIOLOGICAL_FLUID","SKIN_SAMPLE","OTHER"]),
  priority: z.enum(["ROUTINE","PRIORITY","URGENT","CRITICAL"]).default("ROUTINE"),
  confidentialityLevel: z.enum(["MEDICAL_STANDARD","MEDICAL_RESTRICTED","HIGHLY_CONFIDENTIAL"]).default("MEDICAL_STANDARD"),
  expectedSampleAt: optionalDate,
  internalNotes: optionalText(3000),
  laboratoryNotes: optionalText(3000),
});
export const healthLabRequestCreateSchema = healthLabRequestBaseSchema;
export const healthLabRequestUpdateSchema = healthLabRequestBaseSchema.partial().extend({ reason: optionalText(2000) });

export const healthLabActionSchema = z.object({
  action: z.enum(["submit","prepare_sample","collect_sample","reject_sample","start_analysis","enter_result","validate_result","correct_result","transmit_result","cancel","reject_request"]),
  reason: optionalText(3000),
  sampledAt: optionalDate,
  sampledById: optionalId,
  sampleType: z.enum(["","BLOOD","URINE","STOOL","SWAB","BIOLOGICAL_FLUID","SKIN_SAMPLE","OTHER"]).optional(),
  sampleQuality: z.enum(["","COMPLIANT","INSUFFICIENT","HEMOLYZED","CONTAMINATED","REPEAT_REQUIRED","NOT_APPLICABLE"]).optional(),
  sampleNotes: optionalText(3000),
  resultText: optionalText(10000),
  resultUnit: optionalText(300),
  referenceRange: optionalText(1000),
  resultInterpretation: optionalText(6000),
  abnormalityLevel: z.enum(["","NORMAL","MILD_ABNORMAL","SIGNIFICANT_ABNORMAL","CRITICAL","RECHECK"]).optional(),
  laboratoryNotes: optionalText(3000),
});

export const healthLabCatalogSchema = z.object({
  entity: z.literal("catalog"),
  code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  labelFr: z.string().trim().min(2).max(200),
  labelEn: optionalText(200),
  category: z.enum(["HEMATOLOGY","BIOCHEMISTRY","SEROLOGY","MICROBIOLOGY","PARASITOLOGY","IMMUNOLOGY","HORMONOLOGY","URINE","STOOL","OTHER"]),
  sampleType: z.enum(["BLOOD","URINE","STOOL","SWAB","BIOLOGICAL_FLUID","SKIN_SAMPLE","OTHER"]),
  defaultUnit: optionalText(300),
  referenceRange: optionalText(1000),
  description: optionalText(2000),
});
