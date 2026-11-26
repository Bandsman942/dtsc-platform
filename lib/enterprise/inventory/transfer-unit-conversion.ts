import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { catalogConversionMatchesUnits, projectCatalogConversion, resolveCatalogUnitConversion } from "@/lib/enterprise/master-data/unit-conversions";

const decimal = z.string().regex(/^\d+(?:\.\d{1,12})?$/);
const transferConversionSchema = z.object({
  conversionId: z.string().min(1),
  organizationId: z.string().min(1),
  catalogItemId: z.string().min(1),
  sourceUnitId: z.string().min(1),
  sourceCode: z.string().min(1),
  sourceScale: z.number().int().min(0).max(6),
  targetUnitId: z.string().min(1),
  targetCode: z.string().min(1),
  targetScale: z.number().int().min(0).max(6),
  version: z.number().int().positive(),
  factor: decimal,
  sourceQuantity: decimal,
  stockQuantity: decimal,
});
export type TransferUnitConversion = z.infer<typeof transferConversionSchema>;

export async function resolveTransferUnitConversionTx(tx: Prisma.TransactionClient, input: {
  organizationId: string;
  catalogItemId: string;
  sourceUnitId: string;
  quantity: Prisma.Decimal.Value;
  expectedVersion: number;
}): Promise<TransferUnitConversion> {
  const conversion = await resolveCatalogUnitConversion(tx, input);
  if (!conversion.conversionId || conversion.version !== input.expectedVersion) {
    throw new EnterpriseDomainError("CATALOG_CONVERSION_REVISION_CONFLICT", 409);
  }
  return { ...conversion, conversionId: conversion.conversionId };
}

type TransferLine = { inventoryItemId: string; quantity: Prisma.Decimal; unitConversionJson?: Prisma.JsonValue | null };

/** Stock movements always use the frozen stock quantity. Later factor changes
 * do not reinterpret it; a changed destination unit requires reconciliation. */
export async function assertTransferUnitsStillMatch(tx: Prisma.TransactionClient, organizationId: string, transferLines: TransferLine[]) {
  const converted = transferLines.filter(line => line.unitConversionJson != null);
  if (!converted.length) return;
  const invalid = () => new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_REQUIRED", 409);
  const items = await tx.enterpriseInventoryItem.findMany({
    where: { organizationId, status: "ACTIVE", archivedAt: null, id: { in: [...new Set(converted.map(line => line.inventoryItemId))] } },
    select: { id: true, catalogItem: { select: { id: true, unitOfMeasure: { select: { id: true, code: true, decimalScale: true, status: true, archivedAt: true } } } } },
  });
  const byId = new Map(items.map(item => [item.id, item.catalogItem]));
  for (const line of converted) {
    const result = transferConversionSchema.safeParse(line.unitConversionJson);
    const item = byId.get(line.inventoryItemId);
    if (!result.success || !item) throw invalid();
    const snapshot = result.data;
    const unit = item.unitOfMeasure;
    if (snapshot.organizationId !== organizationId || snapshot.catalogItemId !== item.id ||
        unit.id !== snapshot.targetUnitId || unit.code !== snapshot.targetCode || unit.decimalScale !== snapshot.targetScale ||
        unit.status !== "ACTIVE" || unit.archivedAt) throw invalid();
    const quantity = projectCatalogConversion(snapshot, snapshot.sourceQuantity).stockQuantity;
    if (quantity !== snapshot.stockQuantity || !line.quantity.eq(quantity)) throw invalid();
  }
}

export async function listTransferUnitConversions(tx: Prisma.TransactionClient, organizationId: string, inventoryItemId: string, warehouseId: string) {
  const item = await tx.enterpriseInventoryItem.findFirst({
    where: { organizationId, id: inventoryItemId, status: "ACTIVE", archivedAt: null,
      balances: { some: { organizationId, warehouseId } } },
    select: { catalogItem: { select: { id: true, trackInventory: true, status: true, archivedAt: true,
      unitOfMeasure: { select: { id: true, code: true, decimalScale: true, status: true, archivedAt: true } } } } },
  });
  const catalog = item?.catalogItem;
  if (!catalog?.trackInventory || catalog.status !== "ACTIVE" || catalog.archivedAt ||
      catalog.unitOfMeasure.status !== "ACTIVE" || catalog.unitOfMeasure.archivedAt) return [];
  const where = { organizationId, catalogItemId: catalog.id, sourceUnit: { status: "ACTIVE", archivedAt: null } };
  const versions = await tx.enterpriseCatalogUnitConversion.groupBy({
    by: ["sourceUnitId"], where, _max: { version: true },
  });
  if (!versions.length) return [];
  const rows = await tx.enterpriseCatalogUnitConversion.findMany({
    where: { ...where, OR: versions.map(row => ({ sourceUnitId: row.sourceUnitId, version: row._max.version! })) },
    select: { version: true, factor: true, sourceUnitId: true, sourceCode: true, sourceScale: true, targetUnitId: true, targetCode: true, targetScale: true,
      sourceUnit: { select: { id: true, code: true, name: true, decimalScale: true } } },
    orderBy: { sourceCode: "asc" },
  });
  return rows.filter(row => catalogConversionMatchesUnits(row, row.sourceUnit, catalog.unitOfMeasure)).map(row => ({
      sourceUnitId: row.sourceUnitId, sourceCode: row.sourceCode, sourceName: row.sourceUnit.name, sourceScale: row.sourceScale,
      targetCode: row.targetCode, targetScale: row.targetScale, factor: row.factor.toFixed(), version: row.version,
  }));
}
