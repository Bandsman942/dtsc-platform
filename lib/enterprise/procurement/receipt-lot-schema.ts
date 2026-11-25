import { z } from "zod";
import { Prisma } from "@prisma/client";

export const purchaseQuantitySchema = z.union([
  z.number(),
  z.string().trim(),
]).refine((value) => {
  if (typeof value === "string" && (value.length > 40 || !/^\d+(?:\.\d+)?$/.test(value))) return false;
  const quantity = new Prisma.Decimal(value);
  return quantity.gt(0) && quantity.lte(1_000_000) && quantity.decimalPlaces() <= 6;
}, "INVENTORY_PHYSICAL_QUANTITY_PRECISION");

// Receipt physical allocation is optional for legacy, non-batch items; when
// supplied, the server checks the exact sum against the canonical receipt line.
export const receiptLotAllocationsSchema = z.array(z.object({
  purchaseItemId: z.string().trim().min(1).max(180),
  batches: z.array(z.object({
    lotNumber: z.string().trim().min(1).max(120),
    productionDate: z.iso.date().nullable(),
    expiryDate: z.iso.date().nullable(),
    quantity: purchaseQuantitySchema,
  }).strict()).min(1).max(100),
}).strict()).max(200);
