import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ManufacturingDomainError } from "@/lib/enterprise/manufacturing/errors";
import { MANUFACTURING_SECTOR_CODE } from "@/lib/enterprise/manufacturing/constants";
import { prisma } from "@/lib/prisma";

export type ManufacturingTransaction = Prisma.TransactionClient;

export function manufacturingNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function manufacturingDecimal(value: Prisma.Decimal.Value = 0, places = 3) {
  return new Prisma.Decimal(value).toDecimalPlaces(places);
}

export function manufacturingReference(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function withManufacturingSerializable<T>(work: (tx: ManufacturingTransaction) => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === maxAttempts) throw error;
    }
  }
  throw lastError;
}

export async function assertManufacturingOrganization(tx: ManufacturingTransaction, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: {
      id: organizationId,
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      sectorCode: MANUFACTURING_SECTOR_CODE,
    },
    select: { id: true, name: true, sectorId: true, sectorCode: true },
  });
  if (!organization) throw new ManufacturingDomainError("Cette fonctionnalité est réservée aux entreprises du secteur Production.", 403, "MANUFACTURING_SECTOR_REQUIRED");
  return organization;
}

export async function assertActiveManufacturingMember(tx: ManufacturingTransaction, organizationId: string, userId: string) {
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { userId: true, role: true, positionId: true, positionCode: true },
  });
  if (!member) throw new ManufacturingDomainError("Le collaborateur n’est pas actif dans cette entreprise.", 403, "MANUFACTURING_MEMBER_REQUIRED");
  return member;
}

export async function requireManufacturingWarehouse(tx: ManufacturingTransaction, organizationId: string, warehouseId: string) {
  const warehouse = await tx.enterpriseWarehouse.findFirst({
    where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null },
    select: { id: true, code: true, name: true, siteId: true },
  });
  if (!warehouse) throw new ManufacturingDomainError("L’entrepôt sélectionné n’appartient pas à cette entreprise ou n’est plus actif.", 400, "MANUFACTURING_WAREHOUSE_INVALID");
  return warehouse;
}

export async function requireManufacturingCatalogItem(
  tx: ManufacturingTransaction,
  organizationId: string,
  catalogItemId: string,
  options: { inventoryTracked?: boolean } = {},
) {
  const item = await tx.enterpriseCatalogItem.findFirst({
    where: { id: catalogItemId, organizationId, status: "ACTIVE", archivedAt: null },
    include: { unitOfMeasure: { select: { id: true, code: true, symbol: true } } },
  });
  if (!item) throw new ManufacturingDomainError("L’article sélectionné n’appartient pas au catalogue actif de cette entreprise.", 400, "MANUFACTURING_CATALOG_ITEM_INVALID");
  if (options.inventoryTracked && !item.trackInventory) {
    throw new ManufacturingDomainError("Cet article doit être suivi dans le stock commun pour être utilisé en production.", 409, "MANUFACTURING_INVENTORY_TRACKING_REQUIRED");
  }
  return item;
}

export async function requireManufacturingInventoryItem(tx: ManufacturingTransaction, organizationId: string, catalogItemId: string) {
  const inventoryItem = await tx.enterpriseInventoryItem.findFirst({
    where: { organizationId, catalogItemId, status: "ACTIVE", archivedAt: null },
    select: { id: true, catalogItemId: true, allowNegativeStock: true, lotTracking: true, expiryTracking: true },
  });
  if (!inventoryItem) throw new ManufacturingDomainError("L’article doit d’abord être activé dans Stock & logistique.", 409, "MANUFACTURING_INVENTORY_ITEM_REQUIRED");
  return inventoryItem;
}

export async function requireManufacturingSite(tx: ManufacturingTransaction, organizationId: string, siteId?: string | null) {
  const id = manufacturingNullable(siteId);
  if (!id) return null;
  const site = await tx.enterpriseSite.findFirst({ where: { id, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true } });
  if (!site) throw new ManufacturingDomainError("Le site sélectionné n’appartient pas à cette entreprise.", 400, "MANUFACTURING_SITE_INVALID");
  return site;
}

export async function requireManufacturingAsset(tx: ManufacturingTransaction, organizationId: string, assetId?: string | null) {
  const id = manufacturingNullable(assetId);
  if (!id) return null;
  const asset = await tx.enterpriseAsset.findFirst({
    where: { id, organizationId, archivedAt: null, status: { notIn: ["RETIRED", "DISPOSED"] } },
    select: { id: true, code: true, name: true, status: true, siteId: true },
  });
  if (!asset) throw new ManufacturingDomainError("L’équipement sélectionné n’appartient pas aux actifs utilisables de cette entreprise.", 400, "MANUFACTURING_ASSET_INVALID");
  return asset;
}

export async function requireManufacturingEmployee(tx: ManufacturingTransaction, organizationId: string, employeeId?: string | null) {
  const id = manufacturingNullable(employeeId);
  if (!id) return null;
  const employee = await tx.enterpriseEmployee.findFirst({
    where: { id, organizationId, archivedAt: null, employmentStatus: "ACTIVE" },
    select: { id: true, employeeNumber: true, displayName: true, siteId: true },
  });
  if (!employee) throw new ManufacturingDomainError("L’opérateur sélectionné n’est pas un employé actif de cette entreprise.", 400, "MANUFACTURING_EMPLOYEE_INVALID");
  return employee;
}

export async function requireManufacturingTimesheetEntry(
  tx: ManufacturingTransaction,
  organizationId: string,
  timesheetEntryId?: string | null,
  expectedEmployeeId?: string | null,
) {
  const id = manufacturingNullable(timesheetEntryId);
  if (!id) return null;
  const entry = await tx.enterpriseTimesheetEntry.findFirst({
    where: { id, organizationId, timesheet: { organizationId, status: "APPROVED", archivedAt: null } },
    select: { id: true, declaredMinutes: true, approvedMinutes: true, timesheet: { select: { employeeId: true, status: true } } },
  });
  if (!entry) throw new ManufacturingDomainError("Le temps lié doit provenir d’une feuille de temps approuvée de cette entreprise.", 400, "MANUFACTURING_TIMESHEET_ENTRY_INVALID");
  if (expectedEmployeeId && entry.timesheet.employeeId !== expectedEmployeeId) {
    throw new ManufacturingDomainError("Le temps approuvé ne correspond pas à l’opérateur sélectionné.", 409, "MANUFACTURING_TIMESHEET_EMPLOYEE_MISMATCH");
  }
  return entry;
}

export async function requireManufacturingSalesOrderLine(
  tx: ManufacturingTransaction,
  organizationId: string,
  salesOrderId?: string | null,
  salesOrderItemId?: string | null,
  outputCatalogItemId?: string | null,
) {
  const orderId = manufacturingNullable(salesOrderId);
  const itemId = manufacturingNullable(salesOrderItemId);
  if (!orderId && !itemId) return null;
  if (!orderId || !itemId) throw new ManufacturingDomainError("La commande client et sa ligne doivent être renseignées ensemble.", 400, "MANUFACTURING_SALES_SOURCE_INCOMPLETE");
  const line = await tx.enterpriseSalesOrderItem.findFirst({
    where: { id: itemId, organizationId, orderId, order: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED"] } } },
    select: { id: true, orderId: true, catalogItemId: true, quantity: true, fulfilledQuantity: true },
  });
  if (!line) throw new ManufacturingDomainError("La ligne de commande client n’appartient pas à cette entreprise.", 400, "MANUFACTURING_SALES_SOURCE_INVALID");
  if (outputCatalogItemId && line.catalogItemId && line.catalogItemId !== outputCatalogItemId) {
    throw new ManufacturingDomainError("La ligne de commande ne correspond pas au produit fabriqué par la nomenclature.", 409, "MANUFACTURING_SALES_ITEM_MISMATCH");
  }
  return line;
}

export async function currentInventoryQuantity(tx: ManufacturingTransaction, organizationId: string, inventoryItemId: string, warehouseId: string) {
  const balances = await tx.enterpriseInventoryBalance.findMany({
    where: { organizationId, inventoryItemId, warehouseId },
    select: { quantityOnHand: true, quantityReserved: true },
  });
  return balances.reduce((total, balance) => total.add(balance.quantityOnHand.sub(balance.quantityReserved)), manufacturingDecimal(0));
}
