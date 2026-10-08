import { z } from "zod";
import { ENTERPRISE_IDENTITY_RELATION_TYPES } from "@/lib/enterprise/identity-links/contracts";

export const RELATIONSHIP_BENEFIT_TYPES = [
  "DISCOUNT",
  "FIXED_PRICE",
  "FREE_SERVICE",
  "DELIVERY",
  "PRIORITY",
  "LOYALTY",
  "CASHBACK",
  "CREDIT",
  "ACCESS",
  "SUPPORT",
  "BOOKING",
  "DOCUMENT",
  "EVENT",
  "REFERRAL",
  "OTHER",
] as const;

export const RELATIONSHIP_BENEFIT_ASSIGNMENT_MODES = ["AUTOMATIC", "MANUAL", "HYBRID"] as const;
export const RELATIONSHIP_BENEFIT_ACTION_CODES = ["NONE", "CLAIM", "REQUEST", "BOOK", "CONTACT"] as const;
export const RELATIONSHIP_BENEFIT_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const RELATIONSHIP_BENEFIT_USAGE_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "CONSUMED", "CANCELLED"] as const;

export const RELATIONSHIP_BENEFIT_TRANSACTIONAL_TYPES = [
  "DISCOUNT",
  "FIXED_PRICE",
  "CASHBACK",
  "CREDIT",
  "LOYALTY",
] as const;

export const RELATIONSHIP_BENEFIT_REQUEST_TYPES = [
  "FREE_SERVICE",
  "DELIVERY",
  "PRIORITY",
  "ACCESS",
  "SUPPORT",
  "BOOKING",
  "DOCUMENT",
  "EVENT",
  "REFERRAL",
  "OTHER",
] as const;

const referenceId = z.string().trim().min(1).max(240);
const normalizedCode = z.string().trim().min(1).max(80).transform((value) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_"));
const currencyCode = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const relationshipBenefitConditionsSchema = z.object({
  currencyCodes: z.array(currencyCode).max(20).optional(),
  catalogItemIds: z.array(referenceId).max(200).optional(),
  categoryIds: z.array(referenceId).max(100).optional(),
  siteIds: z.array(referenceId).max(100).optional(),
  channelCodes: z.array(normalizedCode).max(20).optional(),
  sourceModuleCodes: z.array(normalizedCode).max(30).optional(),
  minQuantity: z.number().finite().positive().max(1_000_000).optional(),
  maxQuantity: z.number().finite().positive().max(1_000_000).optional(),
  retailLoyaltyProgramId: referenceId.optional(),
  retailStoredValueAccountType: z.enum(["STORE_CREDIT", "GIFT_CARD"]).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.minQuantity !== undefined && input.maxQuantity !== undefined && input.minQuantity > input.maxQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxQuantity"],
      message: "La quantité maximale doit être supérieure ou égale à la quantité minimale.",
    });
  }
});

const optionalDate = z.string().datetime().optional().nullable();

export const relationshipBenefitCreateSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  descriptionFr: z.string().trim().min(4).max(1200),
  descriptionEn: z.string().trim().min(4).max(1200),
  benefitType: z.enum(RELATIONSHIP_BENEFIT_TYPES),
  assignmentMode: z.enum(RELATIONSHIP_BENEFIT_ASSIGNMENT_MODES).default("AUTOMATIC"),
  relationTypes: z.array(z.enum(ENTERPRISE_IDENTITY_RELATION_TYPES)).max(30).default([]),
  identityLinkIds: z.array(z.string().trim().min(1).max(191)).max(100).default([]),
  valueType: z.enum(["NONE", "PERCENT", "AMOUNT", "POINTS", "TEXT"]).default("NONE"),
  valueDecimal: z.number().finite().nonnegative().optional().nullable(),
  currencyCode: z.string().trim().length(3).toUpperCase().optional().nullable(),
  minimumAmount: z.number().finite().nonnegative().optional().nullable(),
  actionCode: z.enum(RELATIONSHIP_BENEFIT_ACTION_CODES).default("NONE"),
  actionLabelFr: z.string().trim().max(120).optional().nullable(),
  actionLabelEn: z.string().trim().max(120).optional().nullable(),
  targetModuleCode: z.string().trim().max(80).optional().nullable(),
  usageLimitTotal: z.number().int().positive().max(100000).optional().nullable(),
  usageLimitPerPeriod: z.number().int().positive().max(100000).optional().nullable(),
  usagePeriodDays: z.number().int().positive().max(3650).optional().nullable(),
  stackable: z.boolean().default(false),
  startsAt: optionalDate,
  endsAt: optionalDate,
  status: z.enum(RELATIONSHIP_BENEFIT_STATUSES).default("DRAFT"),
  conditions: relationshipBenefitConditionsSchema.optional().nullable(),
});

export const relationshipBenefitPatchSchema = relationshipBenefitCreateSchema.partial().extend({
  revision: z.number().int().positive(),
});

export const relationshipBenefitUsageSchema = z.object({
  identityLinkId: z.string().trim().min(1).max(191),
  benefitId: z.string().trim().min(1).max(191),
  idempotencyKey: z.string().trim().min(8).max(160),
  note: z.string().trim().max(800).optional().nullable(),
});

export const relationshipBenefitUsageDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CONSUMED", "CANCELLED"]),
  revision: z.number().int().positive(),
  note: z.string().trim().max(800).optional().nullable(),
});


export const relationshipBenefitUsageCancelSchema = z.object({
  identityLinkId: z.string().trim().min(1).max(191),
  usageId: z.string().trim().min(1).max(191),
  revision: z.number().int().positive(),
});
