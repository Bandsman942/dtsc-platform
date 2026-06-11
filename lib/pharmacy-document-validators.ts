import { z } from "zod";

const optionalText = z.string().trim().max(5000).optional().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().or(z.literal(""));
const optionalDate = z.string().trim().max(40).optional().or(z.literal(""));
export const pharmacyDocumentMetadataSchema = z.object({
  documentNumber: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(2, "Le titre est obligatoire.").max(240),
  description: optionalText, documentType: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(120), subcategory: optionalText,
  moduleSource: optionalText, sourceEntityType: optionalText, sourceEntityId: optionalId, reference: optionalText, documentDate: optionalDate, issuer: optionalText,
  language: optionalText, tags: optionalText, importance: z.enum(["NORMAL", "IMPORTANT", "CRITICAL"]),
  confidentialityLevel: z.enum(["INTERNAL", "DEPARTMENT_ONLY", "MANAGERS_ONLY", "RESPONSIBLE_PHARMACIST", "ADMIN_ENTERPRISE", "QUALITY_ONLY", "FINANCIAL", "VERY_CONFIDENTIAL"]),
  downloadRequiresPermission: z.coerce.boolean().default(true), sensitiveDownloadAudit: z.coerce.boolean().default(false), visibleInActivities: z.coerce.boolean().default(false),
  complianceRequired: z.coerce.boolean().default(false), complianceStatus: z.enum(["NOT_REQUIRED", "TO_VERIFY", "COMPLIANT", "NON_COMPLIANT", "EXPIRED", "TO_RENEW", "REJECTED"]),
  expiryDate: optionalDate, renewalRequired: z.coerce.boolean().default(false), renewalDueDate: optionalDate, verificationRequired: z.coerce.boolean().default(false),
  notes: optionalText, linkEntityType: optionalText, linkEntityId: optionalId, linkRole: optionalText,
});
export const pharmacyDocumentActionSchema = z.object({
  action: z.enum(["validate", "reject", "archive", "renew", "link", "unlink", "replace-file", "mark-not-applicable", "resolve-missing", "detect-compliance"]),
  reason: optionalText, entityType: optionalText, entityId: optionalId, linkRole: optionalText, documentId: optionalId,
});
export const pharmacyDocumentRuleSchema = z.object({ enabled: z.coerce.boolean().optional(), required: z.coerce.boolean().optional(), expiryRequired: z.coerce.boolean().optional(), verificationRequired: z.coerce.boolean().optional(), defaultConfidentialityLevel: optionalText });
