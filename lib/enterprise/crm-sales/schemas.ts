import { z } from "zod";

export const leadCreateSchema = z.object({
  partyType: z.enum(["PERSON", "ORGANIZATION"]).default("PERSON"),
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().max(240).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  companyName: z.string().trim().max(240).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  expectedValue: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const leadTransitionSchema = z.object({
  targetStatus: z.enum(["CONTACTED", "QUALIFIED", "LOST", "ARCHIVED"]),
  lostReason: z.string().trim().min(2).max(1000).optional().nullable(),
  revision: z.coerce.number().int().positive(),
});

export const leadConvertSchema = z.object({
  createOpportunity: z.boolean().default(true),
  opportunityName: z.string().trim().max(240).optional().nullable(),
  estimatedValue: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  revision: z.coerce.number().int().positive(),
});

export const opportunityCreateSchema = z.object({
  businessPartyId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  estimatedValue: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  probabilityPercent: z.coerce.number().int().min(0).max(100).default(0),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const quoteItemSchema = z.object({
  catalogItemId: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1).max(1000),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitOfMeasureId: z.string().trim().min(1).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative().max(1_000_000_000),
  discountRate: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export const quoteCreateSchema = z.object({
  businessPartyId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3),
  validUntil: z.coerce.date().optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  terms: z.string().trim().max(8000).optional().nullable(),
  items: z.array(quoteItemSchema).min(1).max(200),
});

export const quoteTransitionSchema = z.object({
  targetStatus: z.enum(["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"]),
  revision: z.coerce.number().int().positive(),
});

export const quoteConvertSchema = z.object({ revision: z.coerce.number().int().positive() });

export const contractCreateSchema = z.object({
  businessPartyId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1).optional().nullable(),
  quoteId: z.string().trim().min(1).optional().nullable(),
  contractType: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  ownerUserId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  indicativeAmount: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  renewalMode: z.enum(["NONE", "MANUAL", "AUTOMATIC"]).default("NONE"),
  renewalNoticeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  terms: z.string().trim().max(12000).optional().nullable(),
  approverUserId: z.string().trim().min(1).optional().nullable(),
});

export const fulfillmentItemSchema = z.object({
  salesOrderItemId: z.string().trim().min(1),
  quantityFulfilled: z.coerce.number().positive().max(1_000_000),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const fulfillmentCreateSchema = z.object({
  fulfillmentType: z.enum(["PRODUCT_DELIVERY", "SERVICE_DELIVERY"]),
  warehouseId: z.string().trim().min(1).optional().nullable(),
  acceptedByCustomer: z.boolean().default(false),
  acceptanceNotes: z.string().trim().max(4000).optional().nullable(),
  proofDocumentId: z.string().trim().min(1).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(160),
  notes: z.string().trim().max(4000).optional().nullable(),
  revision: z.coerce.number().int().positive(),
  items: z.array(fulfillmentItemSchema).min(1).max(200),
});
