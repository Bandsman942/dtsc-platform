import { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { convertInventoryQuantity, requireInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";

type ConversionSnapshot = {
  organizationId: string; catalogItemId: string; sourceUnitId: string; targetUnitId: string;
  version: number; factor: Prisma.Decimal.Value; sourceScale: number; targetScale: number;
  sourceCode: string; targetCode: string;
};

type ConversionUnit = { id: string; code: string; decimalScale: number };

export function catalogConversionMatchesUnits(
  snapshot: Pick<ConversionSnapshot, "sourceUnitId" | "targetUnitId" | "sourceCode" | "targetCode" | "sourceScale" | "targetScale">,
  source: ConversionUnit,
  target: ConversionUnit,
) {
  return snapshot.sourceUnitId === source.id && snapshot.targetUnitId === target.id
    && snapshot.sourceScale === source.decimalScale && snapshot.targetScale === target.decimalScale
    && snapshot.sourceCode === source.code && snapshot.targetCode === target.code;
}

export function requireCatalogConversionFactor(value: string) {
  if (!/^\d{1,18}(?:\.\d{1,12})?$/.test(value)) throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_INVALID", 400);
  const factor = new Prisma.Decimal(value);
  if (!factor.gt(0)) throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_INVALID", 400);
  return factor;
}

/** Replay uses the historical snapshot, never the latest definition. */
export function projectCatalogConversion(snapshot: ConversionSnapshot, quantity: Prisma.Decimal.Value) {
  const source = requireInventoryQuantity(quantity, snapshot.sourceScale, { positive: true });
  const target = convertInventoryQuantity(source, snapshot.factor, snapshot.targetScale);
  if (!target.gt(0)) throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_INVALID", 400);
  return {
    organizationId: snapshot.organizationId, catalogItemId: snapshot.catalogItemId,
    sourceUnitId: snapshot.sourceUnitId, targetUnitId: snapshot.targetUnitId,
    sourceScale: snapshot.sourceScale, targetScale: snapshot.targetScale, sourceCode: snapshot.sourceCode, targetCode: snapshot.targetCode,
    version: snapshot.version, factor: new Prisma.Decimal(snapshot.factor).toFixed(),
    sourceQuantity: source.toFixed(), stockQuantity: target.toFixed(),
  };
}

async function getReferences(tx: Prisma.TransactionClient, input: { organizationId: string; catalogItemId: string; sourceUnitId: string }) {
  const item = await tx.enterpriseCatalogItem.findFirst({
    where: { organizationId: input.organizationId, id: input.catalogItemId, status: "ACTIVE", archivedAt: null, trackInventory: true },
    include: { unitOfMeasure: true },
  });
  if (!item || item.unitOfMeasure.status !== "ACTIVE" || item.unitOfMeasure.archivedAt) throw new EnterpriseDomainError("CATALOG_CONVERSION_REFERENCE_UNAVAILABLE", 404);
  const source = await tx.enterpriseUnitOfMeasure.findFirst({ where: { organizationId: input.organizationId, id: input.sourceUnitId, status: "ACTIVE", archivedAt: null } });
  if (!source) throw new EnterpriseDomainError("CATALOG_CONVERSION_REFERENCE_UNAVAILABLE", 404);
  return { item, source, target: item.unitOfMeasure };
}

/** Called within a serializable authorized transaction. Unique versions also
 * prevent concurrent overwrites. No update/delete operation is provided. */
export async function appendCatalogUnitConversion(tx: Prisma.TransactionClient, input: {
  organizationId: string; actorUserId: string; catalogItemId: string; sourceUnitId: string;
  factor: string; expectedVersion: number;
}) {
  const factor = requireCatalogConversionFactor(input.factor);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= 2147483647) throw new EnterpriseDomainError("CATALOG_CONVERSION_REVISION_CONFLICT", 409);
  const { item, source, target } = await getReferences(tx, input);
  if (source.id === target.id) throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_INVALID", 400);
  const current = await tx.enterpriseCatalogUnitConversion.findFirst({ where: { organizationId: input.organizationId, catalogItemId: item.id, sourceUnitId: source.id }, orderBy: { version: "desc" } });
  if ((current?.version ?? 0) !== input.expectedVersion) throw new EnterpriseDomainError("CATALOG_CONVERSION_REVISION_CONFLICT", 409);
  const data = { organizationId: input.organizationId, catalogItemId: item.id, sourceUnitId: source.id, targetUnitId: target.id,
    factor, sourceScale: source.decimalScale, targetScale: target.decimalScale, sourceCode: source.code, targetCode: target.code,
    version: input.expectedVersion + 1, createdByUserId: input.actorUserId };
  // One source unit must be representable in the stock unit without rounding.
  projectCatalogConversion(data, "1");
  const version = await tx.enterpriseCatalogUnitConversion.create({ data });
  await tx.enterpriseOperationalEvent.create({ data: {
    organizationId: input.organizationId, entityType: "EnterpriseCatalogItem", entityId: item.id,
    eventType: "CATALOG_UNIT_CONVERSION_VERSION_CREATED", summary: "Nouvelle version de conversion d’unité", actorUserId: input.actorUserId,
  } });
  return version;
}

/** Direct item-specific factor only; no guessed inverse or chained conversion. */
export async function resolveCatalogUnitConversion(tx: Prisma.TransactionClient, input: {
  organizationId: string; catalogItemId: string; sourceUnitId: string; quantity: Prisma.Decimal.Value;
}) {
  const { item, source, target } = await getReferences(tx, input);
  if (source.id === target.id) return { conversionId: null, ...projectCatalogConversion({
    organizationId: input.organizationId, catalogItemId: item.id, sourceUnitId: source.id, targetUnitId: target.id,
    sourceCode: source.code, targetCode: target.code, sourceScale: source.decimalScale, targetScale: target.decimalScale, factor: "1", version: 0,
  }, input.quantity) };
  const version = await tx.enterpriseCatalogUnitConversion.findFirst({ where: { organizationId: input.organizationId, catalogItemId: item.id, sourceUnitId: source.id }, orderBy: { version: "desc" } });
  if (!version || !catalogConversionMatchesUnits(version, source, target)) {
    throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_REQUIRED", 409);
  }
  return { conversionId: version.id, ...projectCatalogConversion(version, input.quantity) };
}
