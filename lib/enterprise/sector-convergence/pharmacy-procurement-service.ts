import { Prisma } from "@prisma/client";
import { createEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

export async function convergePharmacyPurchaseOrder(
  organizationId: string,
  pharmacyPurchaseOrderId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "PHARMACY", domainCode: "PROCUREMENT", flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_PROCUREMENT });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_PROCUREMENT_CONVERGENCE_DISABLED", 409);
  }
  const mapped = await prisma.pharmacyPurchaseExtension.findFirst({ where: { organizationId, pharmacyPurchaseOrderId } });
  if (mapped) return { extension: mapped, idempotent: true };
  const source = await prisma.pharmacyPurchaseOrder.findFirst({
    where: { id: pharmacyPurchaseOrderId, organizationId },
    include: { supplier: true, lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_PURCHASE_NOT_FOUND", 404);
  const supplier = await prisma.pharmacySupplierExtension.findFirst({ where: { organizationId, pharmacySupplierId: source.supplierId } });
  if (!supplier?.enterpriseSupplierId) throw new EnterpriseSectorConvergenceError("PHARMACY_SUPPLIER_MAPPING_REQUIRED", 409);
  const productMappings = await prisma.pharmacyProductExtension.findMany({ where: { organizationId, pharmacyProductId: { in: source.lines.map((line) => line.productId) } } });
  const catalogByProduct = new Map(productMappings.map((item) => [item.pharmacyProductId, item.catalogItemId]));
  const missing = source.lines.filter((line) => !catalogByProduct.has(line.productId));
  if (missing.length) throw new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_MAPPING_REQUIRED", 409, { sourceLineIds: missing.map((line) => line.id) });

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id }, { orderNumber: source.orderNumber }));
  try {
    let purchase = await prisma.enterprisePurchase.findFirst({ where: { organizationId, sourceModule: "PHARMACY_PURCHASES", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (!purchase) {
      purchase = await createEnterprisePurchase(organizationId, actorUserId, {
        title: `Commande Pharmacy ${source.orderNumber}`,
        description: null,
        priority: source.priority === "URGENT" ? "URGENT" : source.priority === "HIGH" ? "HIGH" : "NORMAL",
        supplierId: supplier.enterpriseSupplierId,
        buyerUserId: source.requestedById,
        departmentId: source.departmentId || undefined,
        requestId: undefined,
        budgetLineId: undefined,
        currency: source.currency,
        expectedAt: source.expectedDeliveryDate?.toISOString(),
        sourceModule: "PHARMACY_PURCHASES",
        sourceEntityType: "PharmacyPurchaseOrder",
        sourceEntityId: source.id,
        items: source.lines.map((line) => ({
          description: `Produit Pharmacy ${line.productId}`,
          quantity: Number(line.orderedQuantity),
          unit: line.unit,
          unitPrice: Number(line.estimatedUnitPrice || 0),
          taxRate: 0,
        })),
      });
    }
    const extension = await prisma.$transaction(async (tx) => {
      const existing = await tx.pharmacyPurchaseExtension.findFirst({ where: { organizationId, pharmacyPurchaseOrderId: source.id } });
      if (existing) return existing;
      const items = await tx.enterprisePurchaseItem.findMany({ where: { organizationId, purchaseId: purchase!.id }, orderBy: { sortOrder: "asc" } });
      if (items.length !== source.lines.length) throw new EnterpriseSectorConvergenceError("PHARMACY_PURCHASE_LINE_COUNT_MISMATCH", 409);
      for (let index = 0; index < items.length; index += 1) {
        await tx.enterprisePurchaseItemCatalogLink.upsert({
          where: { organizationId_purchaseItemId: { organizationId, purchaseItemId: items[index].id } },
          update: { catalogItemId: catalogByProduct.get(source.lines[index].productId), expectedItemType: "GOODS" },
          create: { organizationId, purchaseItemId: items[index].id, catalogItemId: catalogByProduct.get(source.lines[index].productId), expectedItemType: "GOODS" },
        });
      }
      const created = await tx.pharmacyPurchaseExtension.create({ data: { organizationId, pharmacyPurchaseOrderId: source.id, enterprisePurchaseId: purchase!.id, createdByUserId: actorUserId } });
      const link = await tx.enterpriseEntityLink.findFirst({ where: { organizationId, sourceModule: "PHARMACY_PURCHASES", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase!.id, linkType: "SECTOR_CONVERGENCE" } });
      if (!link) {
        await tx.enterpriseEntityLink.create({ data: { organizationId, sourceModule: "PHARMACY_PURCHASES", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase!.id, linkType: "SECTOR_CONVERGENCE", createdById: actorUserId } });
      }
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterprisePurchase", targetEntityId: purchase!.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { extension, purchase, idempotent: false };
  } catch (error) {
    await failSectorSync({ organizationId, syncStateId: sync.id, errorCode: "PHARMACY_PURCHASE_MAPPING_FAILED" });
    throw error;
  }
}

export async function convergePharmacyReceipt(
  organizationId: string,
  pharmacyReceiptId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "PHARMACY", domainCode: "PROCUREMENT", flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_PROCUREMENT });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_PROCUREMENT_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.pharmacyReceiptExtension.findFirst({ where: { organizationId, pharmacyReceiptId } });
  if (existing) return { extension: existing, idempotent: true };
  const source = await prisma.pharmacyReceipt.findFirst({ where: { id: pharmacyReceiptId, organizationId }, include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
  if (!source?.purchaseOrderId) throw new EnterpriseSectorConvergenceError("PHARMACY_RECEIPT_PURCHASE_REQUIRED", 409);
  const purchaseExtension = await prisma.pharmacyPurchaseExtension.findFirst({ where: { organizationId, pharmacyPurchaseOrderId: source.purchaseOrderId } });
  if (!purchaseExtension) throw new EnterpriseSectorConvergenceError("PHARMACY_PURCHASE_MAPPING_REQUIRED", 409);

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyReceipt", sourceEntityId: source.id }, { receiptNumber: source.receiptNumber }));
  try {
    const extension = await prisma.$transaction(async (tx) => {
      const alreadyMapped = await tx.pharmacyReceiptExtension.findFirst({ where: { organizationId, pharmacyReceiptId: source.id } });
      if (alreadyMapped) return alreadyMapped;
      const purchase = await tx.enterprisePurchase.findFirst({ where: { id: purchaseExtension.enterprisePurchaseId, organizationId, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } } } });
      if (!purchase) throw new EnterpriseSectorConvergenceError("ENTERPRISE_PURCHASE_NOT_FOUND", 404);
      if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchase.status)) throw new EnterpriseSectorConvergenceError("ENTERPRISE_PURCHASE_NOT_RECEIVABLE", 409, { status: purchase.status });
      const links = await tx.enterprisePurchaseItemCatalogLink.findMany({ where: { organizationId, purchaseItemId: { in: purchase.items.map((item) => item.id) } } });
      const purchaseItemByCatalog = new Map<string, string[]>();
      for (const link of links) if (link.catalogItemId) purchaseItemByCatalog.set(link.catalogItemId, [...(purchaseItemByCatalog.get(link.catalogItemId) || []), link.purchaseItemId]);
      const productMappings = await tx.pharmacyProductExtension.findMany({ where: { organizationId, pharmacyProductId: { in: source.lines.map((line) => line.productId) } } });
      const catalogByProduct = new Map(productMappings.map((item) => [item.pharmacyProductId, item.catalogItemId]));
      const receiptItems: Array<{ purchaseItemId: string; quantityReceived: Prisma.Decimal }> = [];
      for (const line of source.lines) {
        const catalogItemId = catalogByProduct.get(line.productId);
        const candidates = catalogItemId ? purchaseItemByCatalog.get(catalogItemId) || [] : [];
        if (candidates.length !== 1) throw new EnterpriseSectorConvergenceError("PHARMACY_RECEIPT_LINE_AMBIGUOUS", 409, { receiptLineId: line.id });
        receiptItems.push({ purchaseItemId: candidates[0], quantityReceived: line.receivedQuantity });
      }
      const reference = `PHREC-${source.receiptNumber}`.slice(0, 120);
      const duplicateReference = await tx.enterprisePurchaseReceipt.findFirst({ where: { organizationId, reference } });
      if (duplicateReference) throw new EnterpriseSectorConvergenceError("PHARMACY_RECEIPT_REFERENCE_CONFLICT", 409);
      const receipt = await tx.enterprisePurchaseReceipt.create({
        data: {
          organizationId,
          purchaseId: purchase.id,
          reference,
          receivedAt: source.receivedAt,
          receivedByUserId: actorUserId,
          notes: `Pharmacy receipt ${source.id}`,
          items: { create: receiptItems.map((item) => ({ organizationId, purchaseItemId: item.purchaseItemId, quantityReceived: item.quantityReceived })) },
        },
        include: { items: true },
      });
      const totals = await tx.enterprisePurchaseReceiptItem.groupBy({ by: ["purchaseItemId"], where: { organizationId, purchaseItemId: { in: purchase.items.map((item) => item.id) } }, _sum: { quantityReceived: true } });
      const totalByItem = new Map(totals.map((item) => [item.purchaseItemId, item._sum.quantityReceived || new Prisma.Decimal(0)]));
      const fullyReceived = purchase.items.every((item) => (totalByItem.get(item.id) || new Prisma.Decimal(0)).greaterThanOrEqualTo(item.quantity));
      await tx.enterprisePurchase.update({ where: { id: purchase.id }, data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: fullyReceived ? source.receivedAt : purchase.receivedAt, revision: { increment: 1 }, updatedByUserId: actorUserId } });
      const created = await tx.pharmacyReceiptExtension.create({ data: { organizationId, pharmacyReceiptId: source.id, purchaseExtensionId: purchaseExtension.id, enterpriseReceiptId: receipt.id, createdByUserId: actorUserId } });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterprisePurchaseReceipt", targetEntityId: receipt.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { extension, idempotent: false };
  } catch (error) {
    await failSectorSync({ organizationId, syncStateId: sync.id, errorCode: "PHARMACY_RECEIPT_MAPPING_FAILED" });
    throw error;
  }
}
