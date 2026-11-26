import { z } from "zod";
import { Prisma } from "@prisma/client";
import { STOCK_DIRECTIONS, STOCK_MOVEMENT_TYPES } from "@/lib/enterprise/inventory/constants";

export const stockMovementCreateSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  movementType: z.enum(STOCK_MOVEMENT_TYPES),
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z.coerce.number().positive().max(1_000_000_000).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 6, "INVENTORY_PHYSICAL_QUANTITY_PRECISION"),
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
  quantity: z.union([z.string().trim(), z.number().finite()]).refine(value => {
    if (typeof value === "string" && (!value || value.length > 32)) return false;
    try {
      const amount = new Prisma.Decimal(value);
      return amount.gt(0) && amount.lte(1_000_000_000) && amount.decimalPlaces() <= 6;
    } catch {
      return false;
    }
  }, "INVENTORY_PHYSICAL_QUANTITY_PRECISION"),
  sourceUnitId: z.string().trim().min(1).max(191).optional(),
  expectedConversionVersion: z.number().int().positive().max(2147483647).optional(),
}).superRefine((data, ctx) => {
  if (Boolean(data.sourceUnitId) !== Boolean(data.expectedConversionVersion)) {
    ctx.addIssue({ code: "custom", path: ["sourceUnitId"], message: "CATALOG_CONVERSION_REVISION_CONFLICT" });
  }
});

export const stockTransferCreateSchema = z.object({
  sourceWarehouseId: z.string().trim().min(1),
  destinationWarehouseId: z.string().trim().min(1),
  approverUserId: z.string().trim().min(1),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(stockTransferLineSchema).min(1).max(500),
});

const stockDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.decision === "REJECT" && !data.comment?.trim()) ctx.addIssue({ code: "custom", path: ["comment"], message: "Un motif est obligatoire pour rejeter cette opération." });
});

export const stockTransferDecisionSchema = stockDecisionSchema;

export const inventoryCountLineSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  countedQuantity: z.coerce.number().nonnegative().max(1_000_000_000).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 6, "INVENTORY_PHYSICAL_QUANTITY_PRECISION"),
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

export const inventoryCountDecisionSchema = stockDecisionSchema;

export const stockAdjustmentCreateSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  stockLotId: z.string().trim().min(1).optional().nullable(),
  adjustmentType: z.enum(["IN", "OUT"]),
  lossReason: z.enum(["EXPIRY", "DAMAGE", "RECALL", "DESTRUCTION"]).optional().nullable(),
  quantity: z.coerce.number().positive().max(1_000_000_000).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 6, "INVENTORY_PHYSICAL_QUANTITY_PRECISION"),
  reason: z.string().trim().min(3).max(2000),
  approverUserId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(180).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.lossReason && (data.adjustmentType !== "OUT" || !data.stockLotId || data.reason.length < 8 || !data.idempotencyKey)) ctx.addIssue({code:"custom",path:["lossReason"],message:"Specify a batch, outbound direction, detailed reason and unique request key."});
  if (data.lossReason && new Prisma.Decimal(data.quantity).decimalPlaces() > 6) ctx.addIssue({code:"custom",path:["quantity"],message:"INVENTORY_PHYSICAL_QUANTITY_PRECISION"});
});

export const stockAdjustmentDecisionSchema = stockDecisionSchema;
