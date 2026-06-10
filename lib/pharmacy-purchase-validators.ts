import { z } from "zod";

const optionalText = z.string().trim().max(1500).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));
const optionalNumber = z.union([z.coerce.number().min(0).max(1_000_000_000), z.literal("")]).optional();
const optionalDate = z.union([z.coerce.date(), z.literal("")]).optional();

export const supplierInputSchema = z.object({
  entityType: z.literal("supplier"),
  supplierCode: z.string().trim().max(100).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(220),
  supplierType: z.enum(["PHARMACEUTICAL_WHOLESALER", "DISTRIBUTOR", "LABORATORY", "PHARMACEUTICAL_DEPOT", "CONSUMABLES", "MEDICAL_DEVICES", "EQUIPMENT", "LOCAL", "INTERNATIONAL", "OTHER"]),
  category: optionalText, taxNumber: optionalText, legalIdentifier: optionalText, description: optionalText,
  mainContactName: optionalText, mainContactRole: optionalText, phone: optionalText,
  email: z.union([z.string().trim().email(), z.literal("")]).optional(), whatsapp: optionalText, secondaryContact: optionalText,
  country: optionalText, city: optionalText, area: optionalText, address: optionalText, deliveryZone: optionalText,
  averageDeliveryDays: optionalNumber, paymentTerms: optionalText, mainCurrency: z.enum(["USD", "CDF", "EUR"]),
  minimumOrderAmount: optionalNumber, usualDiscountRate: z.union([z.coerce.number().min(0).max(100), z.literal("")]).optional(),
  deliveryFees: optionalNumber, supplierCreditAllowed: z.coerce.boolean().default(false),
  complianceStatus: z.enum(["NOT_VERIFIED", "IN_REVIEW", "VERIFIED", "RENEWAL_DUE", "SUSPENDED"]),
  complianceNotes: optionalText, notes: optionalText,
});

export const supplierProductInputSchema = z.object({
  entityType: z.literal("supplier-product"), supplierId: z.string().min(1).max(160), productId: z.string().min(1).max(160),
  supplierReference: optionalText, supplierPrice: optionalNumber, deliveryDays: optionalNumber, minimumQuantity: optionalNumber, notes: optionalText,
});

export const replenishmentInputSchema = z.object({
  entityType: z.literal("replenishment"), requestNumber: z.string().trim().max(100).optional().or(z.literal("")),
  productId: z.string().min(1).max(160), requestedQuantity: z.coerce.number().gt(0).max(1_000_000_000), unit: z.string().trim().min(1).max(80),
  source: z.enum(["LOW_STOCK", "STOCKOUT", "MANUAL", "INVENTORY", "HIGH_SALES", "EXPIRY", "OTHER"]), reason: z.string().trim().min(1).max(1200),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]), suggestedSupplierId: optionalId, estimatedPrice: optionalNumber,
  requestedById: z.string().min(1).max(160), departmentId: optionalId, desiredDate: optionalDate, notes: optionalText,
});

export const purchaseOrderInputSchema = z.object({
  entityType: z.literal("purchase-order"), orderNumber: z.string().trim().max(100).optional().or(z.literal("")),
  supplierId: z.string().min(1).max(160), requestId: optionalId, requestedById: z.string().min(1).max(160), departmentId: optionalId,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]), orderDate: z.coerce.date(), expectedDeliveryDate: optionalDate,
  deliveryAddress: optionalText, deliveryMode: z.enum(["SUPPLIER_DELIVERY", "PHARMACY_PICKUP", "THIRD_PARTY", "INTERNAL", "OTHER"]).optional().or(z.literal("")),
  deliveryContact: optionalText, budgetId: optionalId, currency: z.enum(["USD", "CDF", "EUR"]),
  financialValidationRequired: z.coerce.boolean().default(false), notes: optionalText,
  lines: z.array(z.object({ productId: z.string().min(1).max(160), supplierProductId: optionalId, orderedQuantity: z.coerce.number().gt(0).max(1_000_000_000), unit: z.string().trim().min(1).max(80), estimatedUnitPrice: optionalNumber, discountRate: z.union([z.coerce.number().min(0).max(100), z.literal("")]).optional(), notes: optionalText })).min(1).max(200),
});

export const purchaseCreateSchema = z.discriminatedUnion("entityType", [supplierInputSchema, supplierProductInputSchema, replenishmentInputSchema, purchaseOrderInputSchema]);
export const purchaseActionSchema = z.object({
  action: z.enum(["submit", "validate", "reject", "cancel", "mark-ordered", "archive", "suspend", "reactivate", "create-order", "create-receipt", "resolve-alert"]),
  reason: optionalText,
});
