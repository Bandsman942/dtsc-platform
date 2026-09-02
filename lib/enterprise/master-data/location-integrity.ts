import { Prisma } from "@prisma/client";

export class EnterpriseLocationIntegrityError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) {
    super(code);
  }
}

const nonZeroBalance: Prisma.EnterpriseInventoryBalanceWhereInput = {
  OR: [
    { quantityOnHand: { not: 0 } },
    { quantityReserved: { not: 0 } },
  ],
};

export async function assertSiteCanBecomeInactive(tx: Prisma.TransactionClient, organizationId: string, siteId: string) {
  const activeWarehouses = await tx.enterpriseWarehouse.count({
    where: { organizationId, siteId, status: "ACTIVE", archivedAt: null },
  });
  if (activeWarehouses > 0) throw new EnterpriseLocationIntegrityError("SITE_HAS_ACTIVE_WAREHOUSES");
}

export async function assertWarehouseCanBecomeInactive(tx: Prisma.TransactionClient, organizationId: string, warehouseId: string) {
  const [activeLocations, stockBalances] = await Promise.all([
    tx.enterpriseStorageLocation.count({ where: { organizationId, warehouseId, status: "ACTIVE", archivedAt: null } }),
    tx.enterpriseInventoryBalance.count({ where: { organizationId, warehouseId, ...nonZeroBalance } }),
  ]);
  if (activeLocations > 0) throw new EnterpriseLocationIntegrityError("WAREHOUSE_HAS_ACTIVE_LOCATIONS");
  if (stockBalances > 0) throw new EnterpriseLocationIntegrityError("WAREHOUSE_HAS_STOCK");
}

export async function assertStorageLocationCanBecomeInactive(tx: Prisma.TransactionClient, organizationId: string, locationId: string) {
  const [activeChildren, stockBalances, activeLots] = await Promise.all([
    tx.enterpriseStorageLocation.count({ where: { organizationId, parentLocationId: locationId, status: "ACTIVE", archivedAt: null } }),
    tx.enterpriseInventoryBalance.count({ where: { organizationId, storageLocationId: locationId, ...nonZeroBalance } }),
    tx.enterpriseStockLot.count({ where: { organizationId, storageLocationId: locationId, status: "AVAILABLE", archivedAt: null } }),
  ]);
  if (activeChildren > 0) throw new EnterpriseLocationIntegrityError("STORAGE_LOCATION_HAS_ACTIVE_CHILDREN");
  if (stockBalances > 0 || activeLots > 0) throw new EnterpriseLocationIntegrityError("STORAGE_LOCATION_HAS_STOCK");
}

export function locationIntegrityMessage(error: unknown) {
  if (!(error instanceof EnterpriseLocationIntegrityError)) return null;
  const messages: Record<string, string> = {
    SITE_HAS_ACTIVE_WAREHOUSES: "Désactivez ou réaffectez d’abord les entrepôts actifs de ce site.",
    WAREHOUSE_HAS_ACTIVE_LOCATIONS: "Désactivez d’abord les emplacements actifs de cet entrepôt.",
    WAREHOUSE_HAS_STOCK: "Cet entrepôt contient encore du stock ou des réservations. Transférez-les avant de le désactiver.",
    STORAGE_LOCATION_HAS_ACTIVE_CHILDREN: "Cet emplacement possède encore des sous-emplacements actifs.",
    STORAGE_LOCATION_HAS_STOCK: "Cet emplacement contient encore du stock, des réservations ou des lots actifs.",
  };
  return messages[error.code] || "Cette désactivation créerait une incohérence de stock ou de hiérarchie.";
}
