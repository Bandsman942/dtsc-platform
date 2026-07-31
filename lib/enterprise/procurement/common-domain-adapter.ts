import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { operationsReference, publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import { prisma } from "@/lib/prisma";

export const supplierPartyLinkSchema = z.object({
  supplierId: z.string().trim().min(1),
  paymentTerms: z.string().trim().max(1000).optional().nullable(),
  complianceStatus: z.enum(["NOT_REVIEWED", "APPROVED", "CONDITIONAL", "BLOCKED"]).default("NOT_REVIEWED"),
  averageLeadTimeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
});

export const receiptInventoryPostSchema = z.object({
  warehouseId: z.string().trim().min(1).optional().nullable(),
  storageLocationId: z.string().trim().min(1).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(240),
});

type SupplierPartyLinkInput = z.infer<typeof supplierPartyLinkSchema>;
type ReceiptInventoryPostInput = z.infer<typeof receiptInventoryPostSchema>;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export async function linkEnterpriseSupplierToBusinessParty(
  organizationId: string,
  actorUserId: string,
  input: SupplierPartyLinkInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId, supplierId: input.supplierId, archivedAt: null },
    });
    if (existing) return { link: existing, idempotent: true };
    const supplier = await tx.enterpriseSupplier.findFirst({
      where: { id: input.supplierId, organizationId, archivedAt: null },
    });
    if (!supplier) throw new EnterpriseDomainError("SUPPLIER_NOT_FOUND", 404);
    const migrationKey = `supplier:${supplier.id}`;
    let party = await tx.enterpriseBusinessParty.findFirst({
      where: { organizationId, migrationKey, archivedAt: null },
    });
    if (!party) {
      party = await tx.enterpriseBusinessParty.create({
        data: {
          organizationId,
          partyType: "ORGANIZATION",
          legalName: supplier.legalName,
          displayName: supplier.displayName,
          normalizedName: normalizeName(supplier.legalName),
          code: operationsReference("SUP"),
          migrationKey,
          taxIdentifier: supplier.taxIdentifier,
          registrationId: supplier.registrationId,
          primaryEmail: supplier.email,
          primaryPhone: supplier.phone,
          status: supplier.status === "SUSPENDED" ? "INACTIVE" : "ACTIVE",
          notes: supplier.notes,
          createdByUserId: actorUserId,
        },
      });
    }
    await tx.enterpriseBusinessPartyRole.upsert({
      where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER" } },
      update: { status: "ACTIVE", archivedAt: null },
      create: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER", createdByUserId: actorUserId },
    });
    const link = await tx.enterpriseSupplierPartyLink.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        businessPartyId: party.id,
        paymentTerms: input.paymentTerms || null,
        complianceStatus: input.complianceStatus,
        averageLeadTimeDays: input.averageLeadTimeDays ?? null,
        migrationKey,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplier",
      entityId: supplier.id,
      eventType: "SUPPLIER_PARTY_LINKED",
      summary: `Fournisseur ${supplier.legalName} lié au tiers ${party.code}`,
      actorUserId,
      metadataJson: { businessPartyId: party.id, supplierPartyLinkId: link.id },
    });
    return { link, idempotent: false };
  });
}

export async function postEnterprisePurchaseReceiptToInventory(
  organizationId: string,
  receiptId: string,
  actorUserId: string,
  input: ReceiptInventoryPostInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterprisePurchaseReceiptOperationalLink.findFirst({
      where: { organizationId, OR: [{ purchaseReceiptId: receiptId }, { idempotencyKey: input.idempotencyKey }] },
    });
    if (existing) return { receiptLink: existing, idempotent: true };

    const receipt = await tx.enterprisePurchaseReceipt.findFirst({
      where: { id: receiptId, organizationId },
      include: {
        purchase: true,
        items: { include: { purchaseItem: true } },
      },
    });
    if (!receipt) throw new EnterpriseDomainError("PURCHASE_RECEIPT_NOT_FOUND", 404);
    const purchaseLink = await tx.enterprisePurchaseOperationalLink.findFirst({
      where: { organizationId, purchaseId: receipt.purchaseId },
    });
    const warehouseId = input.warehouseId || purchaseLink?.destinationWarehouseId || null;
    const warehouse = warehouseId
      ? await tx.enterpriseWarehouse.findFirst({ where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null } })
      : null;
    if (warehouseId && !warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (input.storageLocationId) {
      const location = await tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: warehouseId || undefined, status: "ACTIVE", archivedAt: null } });
      if (!location) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
    }

    const results: Array<{ receiptItemId: string; stockMovementId: string | null; serviceAccepted: boolean }> = [];
    for (const receiptItem of receipt.items) {
      const existingItemLink = await tx.enterprisePurchaseReceiptItemStockLink.findFirst({
        where: { organizationId, purchaseReceiptItemId: receiptItem.id },
      });
      if (existingItemLink) {
        results.push({ receiptItemId: receiptItem.id, stockMovementId: existingItemLink.stockMovementId, serviceAccepted: existingItemLink.serviceAccepted });
        continue;
      }
      const itemLink = await tx.enterprisePurchaseItemCatalogLink.findFirst({
        where: { organizationId, purchaseItemId: receiptItem.purchaseItemId },
      });
      if (!itemLink) throw new EnterpriseDomainError("PURCHASE_ITEM_CATALOG_LINK_REQUIRED", 409);
      if (itemLink.expectedItemType === "SERVICE") {
        const stockLink = await tx.enterprisePurchaseReceiptItemStockLink.create({
          data: { organizationId, purchaseReceiptItemId: receiptItem.id, serviceAccepted: true },
        });
        results.push({ receiptItemId: receiptItem.id, stockMovementId: null, serviceAccepted: stockLink.serviceAccepted });
        continue;
      }
      if (!warehouseId) throw new EnterpriseDomainError("RECEIPT_WAREHOUSE_REQUIRED", 409);
      if (!itemLink.catalogItemId) throw new EnterpriseDomainError("CATALOG_ITEM_REQUIRED_FOR_GOODS", 409);
      const catalogItem = await tx.enterpriseCatalogItem.findFirst({
        where: { id: itemLink.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null },
      });
      if (!catalogItem || !catalogItem.trackInventory) throw new EnterpriseDomainError("INVENTORY_CATALOG_ITEM_REQUIRED", 409);
      let inventoryItem = await tx.enterpriseInventoryItem.findFirst({
        where: { organizationId, catalogItemId: catalogItem.id, archivedAt: null },
      });
      if (!inventoryItem) {
        inventoryItem = await tx.enterpriseInventoryItem.create({
          data: { organizationId, catalogItemId: catalogItem.id, createdByUserId: actorUserId },
        });
      }
      const movementResult = await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: inventoryItem.id,
        warehouseId,
        storageLocationId: input.storageLocationId || null,
        stockLotId: null,
        movementType: "PURCHASE_RECEIPT",
        direction: "IN",
        quantity: Number(receiptItem.quantityReceived),
        sourceEntityType: "EnterprisePurchaseReceipt",
        sourceEntityId: receipt.id,
        sourceLineId: receiptItem.id,
        idempotencyKey: `purchase-receipt:${receipt.id}:${receiptItem.id}`,
        reason: `Réception ${receipt.reference}`,
      });
      await tx.enterprisePurchaseReceiptItemStockLink.create({
        data: { organizationId, purchaseReceiptItemId: receiptItem.id, stockMovementId: movementResult.movement.id },
      });
      results.push({ receiptItemId: receiptItem.id, stockMovementId: movementResult.movement.id, serviceAccepted: false });
    }

    const serviceAccepted = results.length > 0 && results.every((item) => item.serviceAccepted);
    const receiptLink = await tx.enterprisePurchaseReceiptOperationalLink.create({
      data: {
        organizationId,
        purchaseReceiptId: receipt.id,
        status: "POSTED",
        idempotencyKey: input.idempotencyKey,
        warehouseId,
        storageLocationId: input.storageLocationId || null,
        serviceAccepted,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterprisePurchaseReceipt",
      entityId: receipt.id,
      eventType: "PURCHASE_RECEIPT_POSTED",
      summary: `Réception ${receipt.reference} intégrée aux opérations`,
      actorUserId,
      metadataJson: { warehouseId, resultCount: results.length, serviceAccepted },
    });
    return { receiptLink, results, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
