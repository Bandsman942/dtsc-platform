import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { requireInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";

type SalesQuantityLine = { catalogItemId?: string | null; unitOfMeasureId?: string | null; quantity: Prisma.Decimal.Value };

/** One catalog lookup for all lines, before any write. Unit names never imply a
 * conversion. The resolved unit ID is saved on the new document, not on history.
 */
export async function resolveSalesQuantitiesTx(tx: Prisma.TransactionClient, organizationId: string, lines: SalesQuantityLine[]) {
  const catalogIds = [...new Set(lines.map(line => line.catalogItemId).filter((id): id is string => Boolean(id)))];
  const catalog = catalogIds.length ? await tx.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: catalogIds }, status: "ACTIVE", archivedAt: null },
    select: { id: true, unitOfMeasureId: true, unitOfMeasure: { select: { id: true, decimalScale: true, status: true, archivedAt: true } } },
  }) : [];
  if (catalog.length !== catalogIds.length) throw new EnterpriseDomainError("CATALOG_ITEM_NOT_FOUND", 404);
  const byId = new Map(catalog.map(item => [item.id, item]));
  const freeUnitIds = [...new Set(lines.filter(line => !line.catalogItemId).map(line => line.unitOfMeasureId).filter((id): id is string => Boolean(id)))];
  const units = freeUnitIds.length ? await tx.enterpriseUnitOfMeasure.findMany({ where: { organizationId, id: { in: freeUnitIds }, status: "ACTIVE", archivedAt: null }, select: { id: true, decimalScale: true } }) : [];
  if (units.length !== freeUnitIds.length) throw new EnterpriseDomainError("UNIT_OF_MEASURE_NOT_FOUND", 404);
  const freeUnits = new Map(units.map(unit => [unit.id, unit]));
  return lines.map(line => {
    const item = line.catalogItemId ? byId.get(line.catalogItemId)! : null;
    if (item && line.unitOfMeasureId && line.unitOfMeasureId !== item.unitOfMeasureId) {
      throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_REQUIRED", 409);
    }
    if (item && (item.unitOfMeasure.status !== "ACTIVE" || item.unitOfMeasure.archivedAt)) throw new EnterpriseDomainError("UNIT_OF_MEASURE_NOT_FOUND", 404);
    const unit = item?.unitOfMeasure || (line.unitOfMeasureId ? freeUnits.get(line.unitOfMeasureId) : null);
    // A free service description without a catalog unit retains the common
    // six-decimal envelope; it never acquires a fabricated physical unit.
    return { quantity: requireInventoryQuantity(line.quantity, unit?.decimalScale ?? 6, { positive: true }), unitOfMeasureId: unit?.id || null };
  });
}
