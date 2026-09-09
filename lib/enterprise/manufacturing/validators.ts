import { z } from "zod";
import {
  BOM_ISSUE_METHODS,
  MANUFACTURING_DEFINITION_STATUSES,
  MANUFACTURING_WORK_CENTER_STATUSES,
  PRODUCTION_ORDER_PRIORITIES,
  PRODUCTION_QUALITY_CHECK_TYPES,
  PRODUCTION_QUALITY_RESULTS,
} from "@/lib/enterprise/manufacturing/constants";

const optionalText = (max = 4000) => z.string().trim().max(max).optional().nullable().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().nullable().or(z.literal(""));
const optionalDate = z.coerce.date().optional().nullable();
const revision = z.coerce.number().int().positive();
const quantity = z.coerce.number().positive().max(1_000_000_000);
const optionalMoney = z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable();

export const manufacturingConfigurationSchema = z.object({
  defaultMaterialWarehouseId: optionalId,
  defaultOutputWarehouseId: optionalId,
  qualityRequiredByDefault: z.coerce.boolean().default(true),
  allowOverproduction: z.coerce.boolean().default(false),
});

export const manufacturingWorkCenterCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(180),
  description: optionalText(3000),
  siteId: optionalId,
  assetId: optionalId,
  status: z.enum(MANUFACTURING_WORK_CENTER_STATUSES).default("ACTIVE"),
  capacityPerDay: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  capacityUnit: optionalText(80),
  costRate: optionalMoney,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().nullable().or(z.literal("")),
});

export const manufacturingWorkCenterUpdateSchema = manufacturingWorkCenterCreateSchema.partial().extend({ revision });

const bomLineSchema = z.object({
  catalogItemId: z.string().trim().min(1).max(180),
  quantity,
  scrapRate: z.coerce.number().min(0).max(100).default(0),
  issueMethod: z.enum(BOM_ISSUE_METHODS).default("MANUAL"),
  notes: optionalText(2000),
});

export const manufacturingBomCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(220),
  catalogItemId: z.string().trim().min(1).max(180),
  version: z.coerce.number().int().positive().max(9999).default(1),
  outputQuantity: quantity,
  effectiveFrom: optionalDate,
  effectiveUntil: optionalDate,
  notes: optionalText(5000),
  lines: z.array(bomLineSchema).min(1).max(500),
}).superRefine((data, ctx) => {
  if (data.effectiveFrom && data.effectiveUntil && data.effectiveUntil < data.effectiveFrom) {
    ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "La date de fin doit être postérieure à la date de début." });
  }
  if (data.lines.some((line) => line.catalogItemId === data.catalogItemId)) {
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Un produit ne peut pas être son propre composant direct." });
  }
});

export const manufacturingDefinitionActionSchema = z.object({
  revision,
  action: z.enum(["ACTIVATE", "RETIRE"]),
});

const routingOperationSchema = z.object({
  code: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(180),
  workCenterId: optionalId,
  setupMinutes: z.coerce.number().int().min(0).max(100_000).default(0),
  standardMinutes: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  requiresQualityCheck: z.coerce.boolean().default(false),
  instructions: optionalText(5000),
});

export const manufacturingRoutingCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(220),
  description: optionalText(4000),
  catalogItemId: optionalId,
  version: z.coerce.number().int().positive().max(9999).default(1),
  operations: z.array(routingOperationSchema).min(1).max(200),
});

export const manufacturingProductionOrderCreateSchema = z.object({
  title: z.string().trim().min(2).max(240),
  bomId: z.string().trim().min(1).max(180),
  routingId: optionalId,
  salesOrderId: optionalId,
  salesOrderItemId: optionalId,
  materialWarehouseId: z.string().trim().min(1).max(180),
  outputWarehouseId: z.string().trim().min(1).max(180),
  priority: z.enum(PRODUCTION_ORDER_PRIORITIES).default("NORMAL"),
  plannedQuantity: quantity,
  plannedStartAt: optionalDate,
  plannedEndAt: optionalDate,
  notes: optionalText(5000),
  idempotencyKey: z.string().trim().min(8).max(180).optional().nullable(),
}).superRefine((data, ctx) => {
  if (Boolean(data.salesOrderId) !== Boolean(data.salesOrderItemId)) {
    ctx.addIssue({ code: "custom", path: ["salesOrderItemId"], message: "La commande et sa ligne doivent être renseignées ensemble." });
  }
  if (data.plannedStartAt && data.plannedEndAt && data.plannedEndAt < data.plannedStartAt) {
    ctx.addIssue({ code: "custom", path: ["plannedEndAt"], message: "La fin planifiée doit être postérieure au début." });
  }
});

export const manufacturingOrderSubmitSchema = z.object({
  action: z.literal("SUBMIT"),
  revision,
  approverUserId: z.string().trim().min(1).max(180),
});

export const manufacturingOrderDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  revision,
  comment: optionalText(2000),
}).superRefine((data, ctx) => {
  if (data.action === "REJECT" && !data.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "Un motif est obligatoire pour rejeter l’ordre." });
  }
});

export const manufacturingOrderLifecycleSchema = z.object({
  action: z.enum(["START", "COMPLETE", "CANCEL"]),
  revision,
  comment: optionalText(2000),
}).superRefine((data, ctx) => {
  if (data.action === "CANCEL" && !data.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "Un motif est obligatoire pour annuler l’ordre." });
  }
});

export const manufacturingMaterialConsumptionSchema = z.object({
  action: z.literal("CONSUME_MATERIAL"),
  requirementId: z.string().trim().min(1).max(180),
  quantity,
  storageLocationId: optionalId,
  stockLotId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  timesheetEntryId: optionalId,
  minutesWorked: z.coerce.number().int().positive().max(24 * 60).optional().nullable(),
  notes: optionalText(2000),
  idempotencyKey: z.string().trim().min(8).max(180),
});

export const manufacturingOutputReceiptSchema = z.object({
  action: z.literal("RECEIVE_OUTPUT"),
  quantity,
  storageLocationId: optionalId,
  stockLotId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  timesheetEntryId: optionalId,
  minutesWorked: z.coerce.number().int().positive().max(24 * 60).optional().nullable(),
  notes: optionalText(2000),
  idempotencyKey: z.string().trim().min(8).max(180),
});

export const manufacturingExecutionRecordSchema = z.object({
  action: z.literal("RECORD_EXECUTION"),
  routingOperationId: optionalId,
  workCenterId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  timesheetEntryId: optionalId,
  executionType: z.enum(["OPERATION_START", "OPERATION_COMPLETE", "LABOR"]),
  quantityCompleted: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  minutesWorked: z.coerce.number().int().positive().max(24 * 60).optional().nullable(),
  startedAt: optionalDate,
  endedAt: optionalDate,
  notes: optionalText(3000),
  idempotencyKey: z.string().trim().min(8).max(180),
}).superRefine((data, ctx) => {
  if (data.startedAt && data.endedAt && data.endedAt < data.startedAt) {
    ctx.addIssue({ code: "custom", path: ["endedAt"], message: "La fin d’exécution doit être postérieure au début." });
  }
});

export const manufacturingQualityCheckSchema = z.object({
  productionOrderId: z.string().trim().min(1).max(180),
  routingOperationId: optionalId,
  checkType: z.enum(PRODUCTION_QUALITY_CHECK_TYPES),
  result: z.enum(PRODUCTION_QUALITY_RESULTS),
  quantityChecked: quantity,
  quantityAccepted: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  quantityRejected: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  inspectedEmployeeId: optionalId,
  notes: optionalText(4000),
}).superRefine((data, ctx) => {
  if (data.quantityAccepted + data.quantityRejected > data.quantityChecked) {
    ctx.addIssue({ code: "custom", path: ["quantityRejected"], message: "Les quantités acceptées et rejetées dépassent la quantité contrôlée." });
  }
});

export const manufacturingScrapSchema = z.object({
  productionOrderId: z.string().trim().min(1).max(180),
  materialRequirementId: optionalId,
  catalogItemId: z.string().trim().min(1).max(180),
  inventoryItemId: optionalId,
  warehouseId: optionalId,
  quantity,
  reasonCode: z.string().trim().min(2).max(120).transform((value) => value.toUpperCase()),
  notes: optionalText(3000),
  affectsInventory: z.coerce.boolean().default(false),
  storageLocationId: optionalId,
  stockLotId: optionalId,
  idempotencyKey: z.string().trim().min(8).max(180),
});

export const manufacturingShortagePurchaseSchema = z.object({
  productionOrderId: z.string().trim().min(1).max(180),
  supplierId: optionalId,
  buyerUserId: optionalId,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  expectedAt: z.coerce.date().optional().nullable(),
  prices: z.array(z.object({
    requirementId: z.string().trim().min(1).max(180),
    unitPrice: z.coerce.number().nonnegative().max(1_000_000_000),
    taxRate: z.coerce.number().min(0).max(100).default(0),
  })).min(1).max(200),
});

export const manufacturingStatusSchema = z.enum(MANUFACTURING_DEFINITION_STATUSES);
