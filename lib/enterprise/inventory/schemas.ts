import { z } from "zod";
import { STOCK_DIRECTIONS, STOCK_MOVEMENT_TYPES } from "@/lib/enterprise/inventory/constants";

export const stockMovementCreateSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  movementType: z.enum(STOCK_MOVEMENT_TYPES),
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z.coerce.number().positive().max(1_000_000_000),
  sourceEntityType: z.string().trim().max(120).optional().nullable(),
  sourceEntityId: z.string().trim().max(240).optional().nullable(),
  sourceLineId: z.string().trim().max(240).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(180),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const stockTransferLineSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  sourceLocationId: z.string().trim().min(1).optional().nullable(),
  destinationLocationId: z.string().trim().min(1).optional().nullable(),
  quantity: z.coerce.number().positive().max(1_000_000_000),
});

export const stockTransferCreateSchema = z.object({
  sourceWarehouseId: z.string().trim().min(1),
  destinationWarehouseId: z.string().trim().min(1),
  approverUserId: z.string().trim().min(1),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(stockTransferLineSchema).min(1).max(500),
});

export const stockTransferDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const inventoryCountLineSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  countedQuantity: z.coerce.number().nonnegative().max(1_000_000_000),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const inventoryCountCreateSchema = z.object({
  warehouseId: z.string().trim().min(1),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  countType: z.enum(["FULL", "CYCLE", "SPOT"]).default("FULL"),
  approverUserId: z.string().trim().min(1),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(inventoryCountLineSchema).min(1).max(2000),
});

export const inventoryCountDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const stockAdjustmentCreateSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  adjustmentType: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive().max(1_000_000_000),
  reason: z.string().trim().min(3).max(2000),
  approverUserId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(180).optional().nullable(),
});
