import { z } from "zod";

// Receipt physical allocation is optional for legacy, non-batch items; when
// supplied, the server checks the exact sum against the canonical receipt line.
export const receiptLotAllocationsSchema = z.array(z.object({
  purchaseItemId: z.string().trim().min(1).max(180),
  batches: z.array(z.object({
    lotNumber: z.string().trim().min(1).max(120),
    productionDate: z.iso.date().nullable(),
    expiryDate: z.iso.date().nullable(),
    quantity: z.number().positive().max(1_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Invalid batch quantity precision"),
  }).strict()).min(1).max(100),
}).strict()).max(200);
