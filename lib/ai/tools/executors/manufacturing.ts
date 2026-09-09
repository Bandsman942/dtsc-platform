import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import {
  MANUFACTURING_AI_READ_SPECS,
  MANUFACTURING_AI_TOOL_INPUT_SCHEMAS,
  type ManufacturingAiReadToolCode,
} from "@/lib/ai/tools/manufacturing-contract";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import { getManufacturingAccess } from "@/lib/enterprise/manufacturing/access";
import { getManufacturingOverview, getManufacturingReportData } from "@/lib/enterprise/manufacturing/queries";
import type { ManufacturingModuleCode } from "@/lib/enterprise/manufacturing/constants";
import { prisma } from "@/lib/prisma";

type ManufacturingReadArgs = { periodDays?: number; limit?: number };
type ManufacturingReadResult = {
  toolName: ManufacturingAiReadToolCode;
  label: string;
  status: "AVAILABLE" | "EMPTY";
  summary: string;
  asOf: string;
  data: Record<string, unknown>;
};

const LABELS = Object.fromEntries(MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, spec.label])) as Record<ManufacturingAiReadToolCode, string>;
const MODULE_BY_TOOL = Object.fromEntries(MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, spec.moduleCode])) as Record<ManufacturingAiReadToolCode, ManufacturingModuleCode>;

function requireOrganization(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  return organizationId;
}

function windowFor(args: ManufacturingReadArgs) {
  const periodDays = Math.min(366, Math.max(1, args.periodDays || 30));
  const limit = Math.min(25, Math.max(1, args.limit || 12));
  const end = new Date();
  return { periodDays, limit, end, start: new Date(end.getTime() - periodDays * 86_400_000) };
}

function dataRecord(value: unknown): Record<string, unknown> {
  const serialized = serializeFinanceValue(value);
  return serialized && typeof serialized === "object" && !Array.isArray(serialized)
    ? serialized as Record<string, unknown>
    : { value: serialized };
}

function output(toolName: ManufacturingAiReadToolCode, count: number, summary: string, data: unknown): ManufacturingReadResult {
  return { toolName, label: LABELS[toolName], status: count > 0 ? "AVAILABLE" : "EMPTY", summary, asOf: new Date().toISOString(), data: dataRecord(data) };
}

async function assertAccess(context: AiToolRuntimeContext, organizationId: string, toolName: ManufacturingAiReadToolCode) {
  const access = await getManufacturingAccess({ session: context.session, organizationId, moduleCode: MODULE_BY_TOOL[toolName], action: "read" });
  if (!access) throw new Error(`${MODULE_BY_TOOL[toolName]}_ACCESS_DENIED`);
}

async function runManufacturingTool(toolName: ManufacturingAiReadToolCode, context: AiToolRuntimeContext, args: ManufacturingReadArgs) {
  const organizationId = requireOrganization(context);
  await assertAccess(context, organizationId, toolName);
  const { limit, start, periodDays } = windowFor(args);

  if (toolName === "ERP_MANUFACTURING_OVERVIEW_READ") {
    const data = await getManufacturingOverview(organizationId, periodDays);
    return output(toolName, data.recentOrders.length, `${data.recentOrders.length} ordre(s) récent(s); avancement ${data.metrics.completionRate.toFixed(1)} %, pénurie ${data.metrics.shortageQuantity.toFixed(3)}.`, data);
  }

  if (toolName === "ERP_BOM_READ") {
    const items = await prisma.enterpriseBillOfMaterial.findMany({
      where: { organizationId, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: limit,
      select: { code: true, name: true, catalogItemId: true, version: true, outputQuantity: true, status: true, effectiveFrom: true, effectiveUntil: true, updatedAt: true, lines: { orderBy: { sequence: "asc" }, select: { catalogItemId: true, quantity: true, scrapRate: true, issueMethod: true, sequence: true } } },
    });
    return output(toolName, items.length, `${items.length} nomenclature(s) de production autorisée(s) lue(s).`, { items });
  }

  if (toolName === "ERP_PRODUCTION_ORDERS_READ") {
    const items = await prisma.enterpriseProductionOrder.findMany({
      where: { organizationId, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: limit,
      select: { reference: true, title: true, status: true, priority: true, outputCatalogItemId: true, salesOrderId: true, plannedQuantity: true, producedQuantity: true, scrappedQuantity: true, plannedStartAt: true, plannedEndAt: true, actualStartAt: true, actualEndAt: true, submittedAt: true, approvedAt: true, updatedAt: true, bom: { select: { code: true, name: true, version: true } }, routing: { select: { code: true, name: true, version: true } }, requirements: { select: { catalogItemId: true, requiredQuantity: true, consumedQuantity: true, shortageQuantity: true, status: true, purchaseId: true } } },
    });
    const active = await prisma.enterpriseProductionOrder.count({ where: { organizationId, archivedAt: null, status: { in: ["RELEASED", "IN_PROGRESS"] } } });
    return output(toolName, items.length, `${items.length} ordre(s) de production lu(s); ${active} sont libérés ou en cours.`, { active, items });
  }

  if (toolName === "ERP_PRODUCTION_ROUTINGS_READ") {
    const items = await prisma.enterpriseManufacturingRouting.findMany({
      where: { organizationId, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: limit,
      select: { code: true, name: true, description: true, catalogItemId: true, version: true, status: true, updatedAt: true, operations: { orderBy: { sequence: "asc" }, select: { sequence: true, code: true, name: true, setupMinutes: true, standardMinutes: true, requiresQualityCheck: true, workCenter: { select: { code: true, name: true } } } } },
    });
    return output(toolName, items.length, `${items.length} gamme(s) de production autorisée(s) lue(s).`, { items });
  }

  if (toolName === "ERP_WORK_CENTERS_READ") {
    const items = await prisma.enterpriseManufacturingWorkCenter.findMany({
      where: { organizationId, archivedAt: null }, orderBy: [{ status: "asc" }, { name: "asc" }], take: limit,
      select: { code: true, name: true, description: true, siteId: true, assetId: true, status: true, capacityPerDay: true, capacityUnit: true, costRate: true, currency: true, updatedAt: true },
    });
    const active = items.filter((item) => item.status === "ACTIVE").length;
    return output(toolName, items.length, `${items.length} centre(s) de travail lu(s); ${active} sont actifs.`, { active, items });
  }

  if (toolName === "ERP_MATERIAL_REQUIREMENTS_READ") {
    const items = await prisma.enterpriseProductionMaterialRequirement.findMany({
      where: { organizationId, productionOrder: { archivedAt: null } }, orderBy: { updatedAt: "desc" }, take: limit,
      select: { catalogItemId: true, inventoryItemId: true, warehouseId: true, requiredQuantity: true, consumedQuantity: true, shortageQuantity: true, status: true, purchaseId: true, updatedAt: true, productionOrder: { select: { reference: true, title: true, status: true } } },
    });
    const shortage = items.filter((item) => Number(item.shortageQuantity) > 0);
    return output(toolName, items.length, `${items.length} besoin(s) matière lu(s); ${shortage.length} présentent une pénurie dans cet échantillon.`, { shortageCount: shortage.length, items });
  }

  if (toolName === "ERP_PRODUCTION_EXECUTION_READ") {
    const items = await prisma.enterpriseProductionExecution.findMany({
      where: { organizationId, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: limit,
      select: { executionType: true, quantityCompleted: true, minutesWorked: true, employeeId: true, assetId: true, timesheetEntryId: true, startedAt: true, endedAt: true, notes: true, createdAt: true, productionOrder: { select: { reference: true, title: true, status: true } }, routingOperation: { select: { code: true, name: true } }, workCenter: { select: { code: true, name: true } } },
    });
    const minutes = items.reduce((sum, item) => sum + (item.minutesWorked || 0), 0);
    return output(toolName, items.length, `${items.length} entrée(s) d’exécution récente(s) lue(s), représentant ${minutes} minute(s) enregistrée(s).`, { minutesWorked: minutes, items });
  }

  if (toolName === "ERP_PRODUCTION_QUALITY_READ") {
    const items = await prisma.enterpriseProductionQualityCheck.findMany({
      where: { organizationId, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: limit,
      select: { checkType: true, result: true, quantityChecked: true, quantityAccepted: true, quantityRejected: true, notes: true, inspectedEmployeeId: true, createdAt: true, productionOrder: { select: { reference: true, title: true, status: true } }, routingOperation: { select: { code: true, name: true } } },
    });
    const failed = items.filter((item) => item.result !== "PASS").length;
    return output(toolName, items.length, `${items.length} contrôle(s) qualité récent(s) lu(s); ${failed} ne sont pas conformes ou restent bloqués.`, { failedOrHeld: failed, items });
  }

  if (toolName === "ERP_PRODUCTION_SCRAP_READ") {
    const items = await prisma.enterpriseProductionScrap.findMany({
      where: { organizationId, occurredAt: { gte: start } }, orderBy: { occurredAt: "desc" }, take: limit,
      select: { catalogItemId: true, quantity: true, reasonCode: true, notes: true, affectsInventory: true, stockMovementId: true, occurredAt: true, productionOrder: { select: { reference: true, title: true, status: true } } },
    });
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    return output(toolName, items.length, `${items.length} rebut(s) ou perte(s) récent(s) lu(s), totalisant ${quantity.toFixed(3)} unité(s).`, { totalQuantity: quantity, items });
  }

  const data = await getManufacturingReportData(organizationId, periodDays);
  return output(toolName, data.recentOrders.length, `Rapport de production sur ${periodDays} jour(s): avancement ${data.metrics.completionRate.toFixed(1)} %, ${data.labor.minutesWorked} minute(s) de travail enregistrée(s).`, data);
}

function executor(toolName: ManufacturingAiReadToolCode): AiToolExecutor {
  return async ({ args, context }) => {
    const parsed = MANUFACTURING_AI_TOOL_INPUT_SCHEMAS[toolName].parse(args || {});
    return runManufacturingTool(toolName, context, parsed);
  };
}

export const MANUFACTURING_AI_TOOL_EXECUTORS = Object.fromEntries(
  MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, executor(spec.code)]),
) as Record<ManufacturingAiReadToolCode, AiToolExecutor>;
