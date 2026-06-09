import { z } from "zod";

export const inventorySessionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  inventoryDate: z.coerce.date(),
  inventoryType: z.enum(["FULL", "PARTIAL", "CYCLE", "CONTROL", "EXPIRY", "PRE_CLOSING", "OTHER"]),
  departmentId: z.string().max(120).optional().or(z.literal("")),
  locationId: z.string().max(120).optional().or(z.literal("")),
  responsibleUserId: z.string().min(1).max(120),
  participants: z.array(z.string().max(120)).max(100).default([]),
  scopeType: z.enum(["ALL_PRODUCTS", "CATEGORY", "LOCATION", "SUPPLIER", "SELECTED_PRODUCTS", "NEAR_EXPIRY", "SENSITIVE"]),
  scopeValue: z.string().max(180).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const inventoryCountSchema = z.object({
  lineId: z.string().min(1),
  countedQuantity: z.coerce.number().min(0).max(1_000_000_000),
  varianceReason: z.string().trim().max(1200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const stockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  batchId: z.string().min(1),
  inventorySessionId: z.string().max(120).optional().or(z.literal("")),
  inventoryLineId: z.string().max(120).optional().or(z.literal("")),
  adjustmentType: z.enum(["INVENTORY_CORRECTION", "ENTRY_ERROR", "LOSS", "BREAKAGE", "DAMAGED", "EXPIRY_REMOVAL", "RETURN_CUSTOMER", "RETURN_SUPPLIER", "EXCEPTIONAL_OUT", "TRANSFER_LOCATION", "OTHER"]),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().gt(0).max(1_000_000_000),
  reason: z.string().trim().min(3).max(1200),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const stockLocationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z.string().trim().min(1).max(80),
  locationType: z.enum(["SHELF", "RACK", "CABINET", "REFRIGERATOR", "STORAGE", "COUNTER", "QUARANTINE", "EXPIRED", "RECEIVING", "OTHER"]),
  parentLocationId: z.string().max(120).optional().or(z.literal("")),
  responsibleUserId: z.string().max(120).optional().or(z.literal("")),
  temperatureControlled: z.coerce.boolean().default(false),
  refrigerated: z.coerce.boolean().default(false),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
});

export const stockActionSchema = z.object({
  entity: z.enum(["session", "line", "adjustment", "location"]),
  action: z.enum(["generate-lines", "submit", "validate", "reject", "count", "approve", "cancel", "archive"]),
  id: z.string().min(1),
  reason: z.string().trim().max(1200).optional().or(z.literal("")),
  countedQuantity: z.coerce.number().min(0).max(1_000_000_000).optional(),
});
