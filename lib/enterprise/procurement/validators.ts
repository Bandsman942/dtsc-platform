import { z } from "zod";
import {
  ENTERPRISE_DOCUMENT_STATUSES,
  ENTERPRISE_DOCUMENT_TYPES,
  ENTERPRISE_DOCUMENT_VISIBILITIES,
  ENTERPRISE_PURCHASE_ACTIONS,
  ENTERPRISE_PURCHASE_PRIORITIES,
  ENTERPRISE_SUPPLIER_ACTIONS,
  ENTERPRISE_SUPPLIER_STATUSES,
} from "@/lib/enterprise/procurement/constants";

const optionalText = (max = 5000) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().or(z.literal(""));
const optionalDate = z.string().trim().max(40).optional().or(z.literal(""));
const revision = z.coerce.number().int().min(1);

const documentBase = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(8000),
  documentType: z.enum(ENTERPRISE_DOCUMENT_TYPES),
  category: optionalText(120),
  visibility: z.enum(ENTERPRISE_DOCUMENT_VISIBILITIES).default("ORGANIZATION"),
  ownerUserId: optionalId,
  departmentId: optionalId,
  sourceModule: optionalText(120),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
  expiresAt: optionalDate,
});

export const enterpriseDocumentCreateSchema = documentBase.superRefine((data, ctx) => {
  if (data.visibility === "DEPARTMENT" && !data.departmentId) {
    ctx.addIssue({ code: "custom", path: ["departmentId"], message: "Le département est obligatoire pour une visibilité départementale." });
  }
  const sourceCount = [data.sourceModule, data.sourceEntityType, data.sourceEntityId].filter(Boolean).length;
  if (sourceCount !== 0 && sourceCount !== 3) {
    ctx.addIssue({ code: "custom", path: ["sourceEntityId"], message: "La source liée doit préciser module, type et identifiant." });
  }
});

export const enterpriseDocumentUpdateSchema = z.object({
  revision,
  title: z.string().trim().min(2).max(240).optional(),
  description: optionalText(8000),
  documentType: z.enum(ENTERPRISE_DOCUMENT_TYPES).optional(),
  category: optionalText(120),
  visibility: z.enum(ENTERPRISE_DOCUMENT_VISIBILITIES).optional(),
  ownerUserId: optionalId,
  departmentId: optionalId,
  expiresAt: optionalDate,
});

export const enterpriseDocumentAccessSchema = z.object({
  userId: z.string().trim().min(1).max(180),
  accessLevel: z.enum(["READ", "DOWNLOAD", "EDIT"]).default("READ"),
});

export const enterpriseDocumentArchiveSchema = z.object({ revision });

const supplierContactSchema = z.object({
  name: z.string().trim().min(2).max(160),
  title: optionalText(160),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: optionalText(80),
  isPrimary: z.coerce.boolean().default(false),
});

const supplierBase = z.object({
  legalName: z.string().trim().min(2).max(240),
  displayName: optionalText(240),
  supplierType: optionalText(120),
  category: optionalText(120),
  status: z.enum(ENTERPRISE_SUPPLIER_STATUSES).default("PROSPECT"),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: optionalText(80),
  website: z.string().trim().url().max(500).optional().or(z.literal("")),
  addressLine: optionalText(500),
  city: optionalText(120),
  country: optionalText(120),
  taxIdentifier: optionalText(160),
  registrationId: optionalText(160),
  notes: optionalText(5000),
});

export const enterpriseSupplierCreateSchema = supplierBase;
export const enterpriseSupplierUpdateSchema = z.object({
  revision,
  legalName: z.string().trim().min(2).max(240).optional(),
  displayName: optionalText(240),
  supplierType: optionalText(120),
  category: optionalText(120),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: optionalText(80),
  website: z.string().trim().url().max(500).optional().or(z.literal("")),
  addressLine: optionalText(500),
  city: optionalText(120),
  country: optionalText(120),
  taxIdentifier: optionalText(160),
  registrationId: optionalText(160),
  notes: optionalText(5000),
});
export const enterpriseSupplierContactCreateSchema = supplierContactSchema;
export const enterpriseSupplierActionSchema = z.object({
  revision,
  action: z.enum(ENTERPRISE_SUPPLIER_ACTIONS),
  reason: optionalText(1000),
}).superRefine((data, ctx) => {
  if (data.action === "SUSPEND" && !data.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Un motif est obligatoire pour suspendre un fournisseur." });
});

const purchaseItemSchema = z.object({
  description: z.string().trim().min(2).max(1000),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(80),
  unitPrice: z.coerce.number().min(0).max(1_000_000_000),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
});

const purchaseBase = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(8000),
  priority: z.enum(ENTERPRISE_PURCHASE_PRIORITIES).default("NORMAL"),
  supplierId: optionalId,
  buyerUserId: optionalId,
  departmentId: optionalId,
  requestId: optionalId,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  expectedAt: optionalDate,
  sourceModule: optionalText(120),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
  items: z.array(purchaseItemSchema).min(1).max(200),
});

export const enterprisePurchaseCreateSchema = purchaseBase.superRefine((data, ctx) => {
  const sourceCount = [data.sourceModule, data.sourceEntityType, data.sourceEntityId].filter(Boolean).length;
  if (sourceCount !== 0 && sourceCount !== 3) ctx.addIssue({ code: "custom", path: ["sourceEntityId"], message: "La source liée doit être complète." });
});

export const enterprisePurchaseUpdateSchema = z.object({
  revision,
  title: z.string().trim().min(2).max(240).optional(),
  description: optionalText(8000),
  priority: z.enum(ENTERPRISE_PURCHASE_PRIORITIES).optional(),
  supplierId: optionalId,
  buyerUserId: optionalId,
  departmentId: optionalId,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  expectedAt: optionalDate,
  items: z.array(purchaseItemSchema).min(1).max(200).optional(),
});

export const enterprisePurchaseActionSchema = z.object({
  revision,
  action: z.enum(ENTERPRISE_PURCHASE_ACTIONS),
  approverUserId: optionalId,
  comment: optionalText(3000),
}).superRefine((data, ctx) => {
  if (data.action === "SUBMIT" && !data.approverUserId) ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Un approbateur doit être désigné avant soumission." });
});

export const enterprisePurchaseReceiptSchema = z.object({
  revision,
  receivedAt: z.coerce.date(),
  notes: optionalText(5000),
  items: z.array(z.object({
    purchaseItemId: z.string().trim().min(1).max(180),
    quantityReceived: z.coerce.number().positive().max(1_000_000),
  })).min(1).max(200),
});

export const enterpriseSprint7OperationalCommentSchema = z.object({
  entityType: z.enum(["EnterpriseDocument", "EnterpriseSupplier", "EnterprisePurchase"]),
  entityId: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(3000),
});

export const enterpriseDocumentStatusSchema = z.enum(ENTERPRISE_DOCUMENT_STATUSES);
