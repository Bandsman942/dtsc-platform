import { z } from "zod";

export const inventoryReservationCreateSchema = z.object({
  salesOrderId: z.string().trim().min(1).max(240),
  salesOrderItemId: z.string().trim().min(1).max(240),
  warehouseId: z.string().trim().min(1).max(240),
  storageLocationId: z.string().trim().min(1).max(240).optional().nullable(),
  quantity: z.coerce.number().positive().max(1_000_000),
  expiresAt: z.coerce.date().optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(240),
});

export const inventoryReservationReleaseSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
