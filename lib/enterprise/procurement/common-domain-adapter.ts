import { Prisma } from "@prisma/client";
import { z } from "zod";
import { receiptLotAllocationsSchema } from "@/lib/enterprise/procurement/receipt-lot-schema";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { exactInventoryQuantity, requireInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
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
  lotAllocations: receiptLotAllocationsSchema.optional(),
});

type SupplierPartyLinkInput = z.infer<typeof supplierPartyLinkSchema>;
export type ReceiptInventoryPostInput = z.infer<typeof receiptInventoryPostSchema>;

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

export async function postEnterprisePurchaseReceiptToInventoryTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  receiptId: string,
  actorUserId: string,
  input: ReceiptInventoryPostInput,
) {
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

  const existing = await tx.enterprisePurchaseReceiptOperationalLink.findFirst({
    where: { organizationId, OR: [{ purchaseReceiptId: receiptId }, { idempotencyKey: input.idempotencyKey }] },
  });
  if (existing) {
    // Authorize the ORIGINAL destination, never an arbitrary warehouseId
    // supplied on replay. Archived warehouses retain their site attribution.
    const previousWarehouse = existing.warehouseId
      ? await tx.enterpriseWarehouse.findFirst({ where: { id: existing.warehouseId, organizationId }, select: { siteId: true } })
      : null;
    try {
      await requireRetailSiteCapability(organizationId, actorUserId,
        previousWarehouse?.siteId || (existing.purchaseReceiptId === receiptId ? purchaseLink?.siteId : null), "MANAGE_STOCK", tx);
    } catch (error) {
      if (error instanceof EnterpriseRetailError) throw new EnterpriseDomainError(error.code, error.status);
      throw error;
    }
    if (existing.purchaseReceiptId !== receiptId) throw new EnterpriseDomainError("RECEIPT_IDEMPOTENCY_KEY_CONFLICT", 409);
    return { receiptLink: existing, results: [], idempotent: true };
  }

  let warehouseId = input.warehouseId || purchaseLink?.destinationWarehouseId || null;
  let storageLocationId = input.storageLocationId || null;
  if (storageLocationId) {
    const location = await tx.enterpriseStorageLocation.findFirst({
      where: { id: storageLocationId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, warehouseId: true },
    });
    if (!location) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
    if (warehouseId && location.warehouseId !== warehouseId) throw new EnterpriseDomainError("STORAGE_LOCATION_WAREHOUSE_MISMATCH", 409);
    warehouseId = warehouseId || location.warehouseId;
    storageLocationId = location.id;
  }

  const warehouse = warehouseId
    ? await tx.enterpriseWarehouse.findFirst({ where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, siteId: true } })
    : null;
  if (warehouseId && !warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  if (purchaseLink?.siteId && warehouse && warehouse.siteId !== purchaseLink.siteId) throw new EnterpriseDomainError("PURCHASE_SITE_WAREHOUSE_MISMATCH", 409);

  // A receipt can be posted through either the direct Inventory route or the
  // Purchase receive workflow. Enforce the destination store in this shared
  // transaction, including the idempotent replay path.
  try {
    await requireRetailSiteCapability(organizationId, actorUserId, warehouse?.siteId || purchaseLink?.siteId || null, "MANAGE_STOCK", tx);
  } catch (error) {
    if (error instanceof EnterpriseRetailError) throw new EnterpriseDomainError(error.code, error.status);
    throw error;
  }
  const allocationsByItem = new Map((input.lotAllocations || []).map((allocation) => [allocation.purchaseItemId, allocation.batches]));
  if (allocationsByItem.size !== (input.lotAllocations || []).length || [...allocationsByItem.keys()].some((id) => !receipt.items.some((item) => item.purchaseItemId === id))) throw new EnterpriseDomainError("RECEIPT_BATCH_LINE_INVALID", 400, "Les lots doivent correspondre à des lignes de cette réception, sans doublon.");
  const results: Array<{ receiptItemId: string; stockMovementId: string | null; stockMovementIds?: string[]; serviceAccepted: boolean }> = [];
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

    const requiresStockMovement = itemLink.expectedItemType === "GOODS";
    const batches = allocationsByItem.get(receiptItem.purchaseItemId) || [];
    if (requiresStockMovement && !itemLink.catalogItemId) throw new EnterpriseDomainError("CATALOG_ITEM_REQUIRED_FOR_GOODS", 409);
    const catalogItem = itemLink.catalogItemId ? await tx.enterpriseCatalogItem.findFirst({
      where: { id: itemLink.catalogItemId, organizationId, ...(requiresStockMovement ? { status: "ACTIVE", archivedAt: null } : {}) },
      select: { id: true, trackInventory: true, unitOfMeasure: { select: { id: true, decimalScale: true } } },
    }) : null;
    if (requiresStockMovement && !catalogItem?.trackInventory) throw new EnterpriseDomainError("INVENTORY_CATALOG_ITEM_REQUIRED", 409);
    if (!catalogItem || itemLink.unitOfMeasureId !== catalogItem.unitOfMeasure.id) {
      throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_REQUIRED", 409);
    }
    const scale = catalogItem.unitOfMeasure.decimalScale;
    requireInventoryQuantity(receiptItem.purchaseItem.quantity, scale, { positive: true });
    const receivedQuantity = requireInventoryQuantity(receiptItem.quantityReceived, scale, { positive: true });
    for (const batch of batches) requireInventoryQuantity(batch.quantity, scale, { positive: true });

    if (!requiresStockMovement) {
      if (batches.length) throw new EnterpriseDomainError("RECEIPT_BATCH_SERVICE_INVALID", 400, "Une prestation de service ne possède pas de lot physique.");
      const operationalLink = await tx.enterprisePurchaseReceiptItemStockLink.create({
        data: { organizationId, purchaseReceiptItemId: receiptItem.id, serviceAccepted: true },
      });
      results.push({ receiptItemId: receiptItem.id, stockMovementId: null, serviceAccepted: operationalLink.serviceAccepted });
      continue;
    }

    if (!warehouseId) throw new EnterpriseDomainError("RECEIPT_WAREHOUSE_REQUIRED", 409);
    let inventoryItem = await tx.enterpriseInventoryItem.findFirst({
      where: { organizationId, catalogItemId: catalogItem.id, archivedAt: null },
    });
    if (!inventoryItem) {
      inventoryItem = await tx.enterpriseInventoryItem.create({
        data: { organizationId, catalogItemId: catalogItem.id, createdByUserId: actorUserId },
      });
    }

    if (inventoryItem.status !== "ACTIVE") throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404, "Cet article de stock n’est plus actif.");
    if ((inventoryItem.lotTracking || inventoryItem.expiryTracking) && !batches.length) throw new EnterpriseDomainError("RECEIPT_BATCH_REQUIRED", 409, "Renseignez les lots réellement reçus pour cet article.");
    if (!inventoryItem.lotTracking && batches.length) throw new EnterpriseDomainError("RECEIPT_BATCH_POLICY_REQUIRED", 409, "Activez le suivi des lots dans Stock & logistique avant cette réception.");
    if (batches.length) {
      const seen = new Set(batches.map((batch) => batch.lotNumber));
      const total = batches.reduce((sum, batch) => sum.plus(batch.quantity), exactInventoryQuantity(0));
      if (seen.size !== batches.length || !total.equals(receivedQuantity)) throw new EnterpriseDomainError("RECEIPT_BATCH_QUANTITY_INVALID", 409, "La somme des quantités par lot doit correspondre à la quantité reçue, sans numéro en double.");
    }
    const stockMovementIds: string[] = [];
    const entries = batches.length ? batches : [{ lotNumber: "", productionDate: null, expiryDate: null, quantity: receiptItem.quantityReceived }];
    for (const batch of entries) {
      let stockLotId: string | null = null;
      if (batch.lotNumber) {
        if (inventoryItem.expiryTracking && !batch.expiryDate) throw new EnterpriseDomainError("RECEIPT_BATCH_EXPIRY_REQUIRED", 409, "La date réelle de péremption est obligatoire pour chaque lot.");
        if (batch.productionDate && batch.expiryDate && batch.productionDate > batch.expiryDate) throw new EnterpriseDomainError("RECEIPT_BATCH_DATES_INVALID", 400, "La date de fabrication doit précéder ou correspondre à la péremption.");
        const productionDate = batch.productionDate ? new Date(`${batch.productionDate}T00:00:00.000Z`) : null;
        const expiryDate = batch.expiryDate ? new Date(`${batch.expiryDate}T00:00:00.000Z`) : null;
        // Supplier acceptance is not a transfer of goods we already own.
        // Never post a recalled supplier batch as received or create a new
        // available copy. Keep the purchase open for replacement/return.
        const recalledLot = await tx.enterpriseStockLot.findFirst({
          where: { organizationId, inventoryItemId: inventoryItem.id, lotNumber: batch.lotNumber, recallReference: { not: null } },
          select: { recallReference: true },
        });
        if (recalledLot) throw new EnterpriseDomainError("RECEIPT_BATCH_RECALLED", 409, "Lot rappelé : refusez sa réception commerciale, isolez la marchandise physiquement et demandez son remplacement ou retour au fournisseur.");
        const existingLot = await tx.enterpriseStockLot.findFirst({ where: { organizationId, inventoryItemId: inventoryItem.id, warehouseId, lotNumber: batch.lotNumber } });
        if (existingLot) {
          if (existingLot.archivedAt || existingLot.status !== "AVAILABLE" || existingLot.productionDate?.getTime() !== productionDate?.getTime() || existingLot.expiryDate?.getTime() !== expiryDate?.getTime() || (existingLot.storageLocationId && existingLot.storageLocationId !== storageLocationId)) throw new EnterpriseDomainError("RECEIPT_BATCH_METADATA_CONFLICT", 409, "Ce lot existe avec des dates, un emplacement ou un statut différent. Vérifiez sa fiche dans Stock & logistique.");
          stockLotId = existingLot.id;
        } else {
          const newLot = await tx.enterpriseStockLot.create({ data: { organizationId, inventoryItemId: inventoryItem.id, warehouseId, lotNumber: batch.lotNumber, productionDate, expiryDate, createdByUserId: actorUserId } });
          stockLotId = newLot.id;
        }
      }
      const movementResult = await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: inventoryItem.id,
        warehouseId,
        storageLocationId,
        stockLotId,
        movementType: "PURCHASE_RECEIPT",
        direction: "IN",
        quantity: batch.quantity,
        sourceEntityType: "EnterprisePurchaseReceipt",
        sourceEntityId: receipt.id,
        sourceLineId: receiptItem.id,
        idempotencyKey: stockLotId ? `purchase-receipt:${receipt.id}:${receiptItem.id}:lot:${stockLotId}` : `purchase-receipt:${receipt.id}:${receiptItem.id}`,
        reason: `Réception ${receipt.reference}`,
      });
      stockMovementIds.push(movementResult.movement.id);
    }
    // The historical one-per-receipt-line marker remains the compatibility
    // anchor. The authoritative complete movement set is the immutable ledger,
    // keyed by receipt id + receipt item id, including each physical lot.
    const stockMovementId = stockMovementIds[0]!;
    await tx.enterprisePurchaseReceiptItemStockLink.create({
      data: { organizationId, purchaseReceiptItemId: receiptItem.id, stockMovementId },
    });
    results.push({ receiptItemId: receiptItem.id, stockMovementId, stockMovementIds, serviceAccepted: false });
  }

  const serviceAccepted = results.length > 0 && results.every((item) => item.serviceAccepted);
  const receiptLink = await tx.enterprisePurchaseReceiptOperationalLink.create({
    data: {
      organizationId,
      purchaseReceiptId: receipt.id,
      status: "POSTED",
      idempotencyKey: input.idempotencyKey,
      warehouseId,
      storageLocationId,
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
    metadataJson: { warehouseId, storageLocationId, resultCount: results.length, serviceAccepted },
  });
  return { receiptLink, results, idempotent: false };
}

export async function postEnterprisePurchaseReceiptToInventory(
  organizationId: string,
  receiptId: string,
  actorUserId: string,
  input: ReceiptInventoryPostInput,
) {
  return prisma.$transaction(
    (tx) => postEnterprisePurchaseReceiptToInventoryTx(tx, organizationId, receiptId, actorUserId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
