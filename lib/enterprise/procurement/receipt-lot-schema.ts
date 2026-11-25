import { z } from "zod";
import { Prisma } from "@prisma/client";

// Receipt physical allocation is optional for legacy, non-batch items; when
// supplied, the server checks the exact sum against the canonical receipt line.
export const receiptLotAllocationsSchema = z.array(z.object({
  purchaseItemId: z.string().trim().min(1).max(180),
  batches: z.array(z.object({
    lotNumber: z.string().trim().min(1).max(120),
    productionDate: z.iso.date().nullable(),
    expiryDate: z.iso.date().nullable(),
    quantity: z.number().positive().max(1_000_000).refine((value) => new Prisma.Decimal(value).decimalPlaces() <= 6, "Invalid batch quantity precision"),
  }).strict()).min(1).max(100),
}).strict()).max(200);
