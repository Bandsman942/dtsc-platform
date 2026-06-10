import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { pharmacyReceiptSchema } from "@/lib/pharmacy-receipt-validators";

export type PharmacyReceiptInput = z.infer<typeof pharmacyReceiptSchema>;

function nullable<T>(value: T | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

export async function validateReceiptReferences(organizationId: string, data: PharmacyReceiptInput) {
  const purchaseOrderLineIds = data.lines.flatMap((line) => line.purchaseOrderLineId ? [line.purchaseOrderLineId] : []);
  const [supplier, purchaseOrder, receiver, department, mainLocation, products, locations, purchaseOrderLines] = await Promise.all([
    prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId, status: { notIn: ["SUSPENDED", "ARCHIVED", "INACTIVE"] } }, select: { id: true } }),
    data.purchaseOrderId ? prisma.pharmacyPurchaseOrder.findFirst({ where: { id: data.purchaseOrderId, organizationId, supplierId: data.supplierId, status: { notIn: ["REJECTED", "CANCELLED", "ARCHIVED"] } }, select: { id: true } }) : null,
    prisma.organizationMember.findFirst({ where: { organizationId, userId: data.receivedById, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } }) : null,
    data.mainLocationId ? prisma.pharmacyStockLocation.findFirst({ where: { id: data.mainLocationId, organizationId, status: "ACTIVE" }, select: { id: true } }) : null,
    prisma.pharmacyProduct.findMany({ where: { organizationId, id: { in: data.lines.map((line) => line.productId) }, status: { not: "ARCHIVED" } }, select: { id: true } }),
    prisma.pharmacyStockLocation.findMany({ where: { organizationId, id: { in: data.lines.flatMap((line) => line.batches.map((batch) => batch.locationId).filter(Boolean) as string[]) }, status: "ACTIVE" }, select: { id: true } }),
    prisma.pharmacyPurchaseOrderLine.findMany({ where: { organizationId, id: { in: purchaseOrderLineIds } }, select: { id: true, purchaseOrderId: true, productId: true, remainingQuantity: true } }),
  ]);
  if (!supplier) return "Le fournisseur sélectionné n'appartient pas à cette pharmacie ou n'est pas actif.";
  if (data.purchaseOrderId && !purchaseOrder) return "La commande sélectionnée n'appartient pas à cette pharmacie.";
  if (!receiver) return "Le réceptionnaire sélectionné n'appartient pas à cette pharmacie.";
  if (data.departmentId && !department) return "Le département sélectionné n'appartient pas à cette pharmacie.";
  if (data.mainLocationId && !mainLocation) return "L'emplacement principal n'appartient pas à cette pharmacie.";
  if (new Set(products.map((product) => product.id)).size !== new Set(data.lines.map((line) => line.productId)).size) return "Un produit sélectionné n'appartient pas à cette pharmacie.";
  const locationIds = new Set(locations.map((location) => location.id));
  if (data.lines.some((line) => line.batches.some((batch) => batch.locationId && !locationIds.has(batch.locationId)))) return "Un emplacement de lot n'appartient pas à cette pharmacie.";
  const purchaseOrderLineMap = new Map(purchaseOrderLines.map((line) => [line.id, line]));
  for (const line of data.lines) {
    if (!line.purchaseOrderLineId) continue;
    const orderLine = purchaseOrderLineMap.get(line.purchaseOrderLineId);
    if (!orderLine || orderLine.purchaseOrderId !== data.purchaseOrderId || orderLine.productId !== line.productId) return "Une ligne de commande ne correspond pas à cette réception.";
    if (line.receivedQuantity > Number(orderLine.remainingQuantity)) return "La quantité reçue dépasse la quantité restante de la commande.";
  }
  for (const line of data.lines) for (const batchInput of line.batches) {
    if (!batchInput.batchId) continue;
    const batch = await prisma.pharmacyBatch.findFirst({ where: { id: batchInput.batchId, organizationId, productId: line.productId }, select: { id: true } });
    if (!batch) return "Un lot existant ne correspond pas au produit ou à cette pharmacie.";
  }
  return null;
}

export async function createPharmacyReceipt(organizationId: string, userId: string, data: PharmacyReceiptInput) {
  const count = await prisma.pharmacyReceipt.count({ where: { organizationId } });
  const receiptNumber = data.receiptNumber || `REC-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
  const totalItems = data.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const totalAmount = data.lines.reduce((sum, line) => sum + line.receivedQuantity * Number(line.purchasePrice || 0) * (1 - Number(line.supplierDiscount || 0) / 100), 0);
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.pharmacyReceipt.create({ data: { organizationId, receiptNumber, receiptType: data.receiptType, supplierId: data.supplierId, purchaseOrderId: nullable(data.purchaseOrderId), departmentId: nullable(data.departmentId), mainLocationId: nullable(data.mainLocationId), receivedById: data.receivedById, receivedAt: data.receivedAt, supplierInvoiceReference: nullable(data.supplierInvoiceReference), deliveryNoteReference: nullable(data.deliveryNoteReference), invoiceDate: nullable(data.invoiceDate), deliveryNoteDate: nullable(data.deliveryNoteDate), totalItems, totalAmount, notes: nullable(data.notes), createdById: userId, updatedById: userId } });
    for (const lineInput of data.lines) {
      const totalLine = lineInput.receivedQuantity * Number(lineInput.purchasePrice || 0) * (1 - Number(lineInput.supplierDiscount || 0) / 100);
      const line = await tx.pharmacyReceiptLine.create({ data: { organizationId, receiptId: receipt.id, productId: lineInput.productId, purchaseOrderLineId: nullable(lineInput.purchaseOrderLineId), orderedQuantity: nullable(lineInput.orderedQuantity), previouslyReceivedQuantity: nullable(lineInput.previouslyReceivedQuantity), receivedQuantity: lineInput.receivedQuantity, unit: lineInput.unit, purchasePrice: nullable(lineInput.purchasePrice), supplierDiscount: nullable(lineInput.supplierDiscount), totalLine, notes: nullable(lineInput.notes) } });
      await tx.pharmacyReceiptBatch.createMany({ data: lineInput.batches.map((batch) => ({ organizationId, receiptId: receipt.id, receiptLineId: line.id, productId: lineInput.productId, batchId: nullable(batch.batchId), createNewBatch: !batch.batchId, batchNumber: batch.batchNumber, manufacturingDate: nullable(batch.manufacturingDate), expiryDate: batch.expiryDate, barcode: nullable(batch.barcode), receivedQuantity: batch.receivedQuantity, locationId: nullable(batch.locationId), initialStatus: batch.initialStatus, notes: nullable(batch.notes) })) });
      const ordered = Number(lineInput.orderedQuantity || 0);
      const remainingBefore = Math.max(0, ordered - Number(lineInput.previouslyReceivedQuantity || 0));
      if (ordered > 0 && lineInput.receivedQuantity !== remainingBefore) await tx.pharmacyReceiptDiscrepancy.create({ data: { organizationId, receiptId: receipt.id, receiptLineId: line.id, productId: lineInput.productId, discrepancyType: lineInput.receivedQuantity < remainingBefore ? "QUANTITY_LOWER" : "QUANTITY_HIGHER", description: `Quantité attendue ${remainingBefore}, quantité reçue ${lineInput.receivedQuantity}.`, affectedQuantity: Math.abs(remainingBefore - lineInput.receivedQuantity), criticality: lineInput.receivedQuantity > remainingBefore ? "HIGH" : "MEDIUM", createdById: userId, updatedById: userId } });
    }
    return receipt;
  });
}

export async function updatePharmacyReceipt(organizationId: string, receiptId: string, userId: string, data: PharmacyReceiptInput) {
  const existing = await prisma.pharmacyReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { id: true, status: true, stockImpactApplied: true } });
  if (!existing) throw new Error("RECEIPT_NOT_FOUND");
  if (existing.status !== "DRAFT" || existing.stockImpactApplied) throw new Error("RECEIPT_LOCKED");
  const totalItems = data.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const totalAmount = data.lines.reduce((sum, line) => sum + line.receivedQuantity * Number(line.purchasePrice || 0) * (1 - Number(line.supplierDiscount || 0) / 100), 0);
  return prisma.$transaction(async (tx) => {
    await tx.pharmacyReceiptLine.deleteMany({ where: { receiptId, organizationId } });
    await tx.pharmacyReceiptDiscrepancy.deleteMany({ where: { receiptId, organizationId } });
    const receipt = await tx.pharmacyReceipt.update({ where: { id: receiptId }, data: { receiptNumber: data.receiptNumber || undefined, receiptType: data.receiptType, supplierId: data.supplierId, purchaseOrderId: nullable(data.purchaseOrderId), departmentId: nullable(data.departmentId), mainLocationId: nullable(data.mainLocationId), receivedById: data.receivedById, receivedAt: data.receivedAt, supplierInvoiceReference: nullable(data.supplierInvoiceReference), deliveryNoteReference: nullable(data.deliveryNoteReference), invoiceDate: nullable(data.invoiceDate), deliveryNoteDate: nullable(data.deliveryNoteDate), totalItems, totalAmount, notes: nullable(data.notes), updatedById: userId } });
    for (const lineInput of data.lines) {
      const totalLine = lineInput.receivedQuantity * Number(lineInput.purchasePrice || 0) * (1 - Number(lineInput.supplierDiscount || 0) / 100);
      const line = await tx.pharmacyReceiptLine.create({ data: { organizationId, receiptId, productId: lineInput.productId, purchaseOrderLineId: nullable(lineInput.purchaseOrderLineId), orderedQuantity: nullable(lineInput.orderedQuantity), previouslyReceivedQuantity: nullable(lineInput.previouslyReceivedQuantity), receivedQuantity: lineInput.receivedQuantity, unit: lineInput.unit, purchasePrice: nullable(lineInput.purchasePrice), supplierDiscount: nullable(lineInput.supplierDiscount), totalLine, notes: nullable(lineInput.notes) } });
      await tx.pharmacyReceiptBatch.createMany({ data: lineInput.batches.map((batch) => ({ organizationId, receiptId, receiptLineId: line.id, productId: lineInput.productId, batchId: nullable(batch.batchId), createNewBatch: !batch.batchId, batchNumber: batch.batchNumber, manufacturingDate: nullable(batch.manufacturingDate), expiryDate: batch.expiryDate, barcode: nullable(batch.barcode), receivedQuantity: batch.receivedQuantity, locationId: nullable(batch.locationId), initialStatus: batch.initialStatus, notes: nullable(batch.notes) })) });
    }
    return receipt;
  });
}

export async function getPharmacyReceiptsDataset(organizationId: string) {
  const [receipts, products, batches, members, departments, locations, suppliers, purchaseOrders, movements] = await Promise.all([
    prisma.pharmacyReceipt.findMany({ where: { organizationId }, orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], include: { lines: true, receiptBatches: true, discrepancies: true, documents: true } }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, stockUnit: true, referencePurchasePrice: true } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, orderBy: { expiryDate: "asc" }, select: { id: true, productId: true, batchNumber: true, expiryDate: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, orderBy: { labelFr: "asc" }, select: { id: true, labelFr: true } }),
    prisma.pharmacyStockLocation.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.pharmacySupplier.findMany({ where: { organizationId, status: { notIn: ["ARCHIVED", "INACTIVE"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.pharmacyPurchaseOrder.findMany({ where: { organizationId, status: { notIn: ["REJECTED", "CANCELLED", "ARCHIVED"] } }, orderBy: { orderDate: "desc" }, select: { id: true, orderNumber: true, status: true, supplierId: true } }),
    prisma.pharmacyStockMovement.findMany({ where: { organizationId, relatedEntityType: "PharmacyReceipt" }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, relatedEntityId: true, movementType: true, direction: true, quantity: true, createdAt: true } }),
  ]);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().slice(0, 10);
  const metrics = { today: receipts.filter((receipt) => receipt.receivedAt.toISOString().slice(0, 10) === today).length, month: receipts.filter((receipt) => receipt.receivedAt >= monthStart).length, drafts: receipts.filter((receipt) => receipt.status === "DRAFT").length, submitted: receipts.filter((receipt) => receipt.status === "SUBMITTED").length, validated: receipts.filter((receipt) => ["VALIDATED", "PARTIALLY_VALIDATED"].includes(receipt.status)).length, cancelled: receipts.filter((receipt) => receipt.status === "CANCELLED").length, partial: receipts.filter((receipt) => receipt.status === "PARTIALLY_VALIDATED" || receipt.receiptType === "PARTIAL").length, pendingOrders: purchaseOrders.filter((order) => !["RECEIVED", "CANCELLED", "ARCHIVED"].includes(order.status)).length, productsThisMonth: receipts.filter((receipt) => receipt.receivedAt >= monthStart && receipt.stockImpactApplied).reduce((sum, receipt) => sum + Number(receipt.totalItems || 0), 0), valueThisMonth: receipts.filter((receipt) => receipt.receivedAt >= monthStart && receipt.stockImpactApplied).reduce((sum, receipt) => sum + Number(receipt.totalAmount || 0), 0), openDiscrepancies: receipts.flatMap((receipt) => receipt.discrepancies).filter((item) => !["RESOLVED", "REJECTED", "CANCELLED"].includes(item.status)).length, createdBatches: receipts.flatMap((receipt) => receipt.receiptBatches).filter((item) => item.createNewBatch && item.batchId).length, missingDocuments: receipts.filter((receipt) => !receipt.documents.length).length };
  return { metrics, receipts, products, batches, members: members.map((member) => member.user), departments, locations, suppliers: suppliers.map((supplier) => ({ id: supplier.id, title: supplier.name })), purchaseOrders: purchaseOrders.map((order) => ({ id: order.id, title: order.orderNumber, status: order.status, supplierId: order.supplierId })), movements };
}

export async function applyReceiptStockImpact(organizationId: string, receiptId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.pharmacyReceipt.findFirst({ where: { id: receiptId, organizationId }, include: { lines: true, receiptBatches: true, discrepancies: true } });
    if (!receipt) throw new Error("RECEIPT_NOT_FOUND");
    if (receipt.stockImpactApplied) return receipt;
    if (!["SUBMITTED", "IN_CONTROL"].includes(receipt.status)) throw new Error("RECEIPT_NOT_VALIDATABLE");
    for (const entry of receipt.receiptBatches) {
      const quantity = Number(entry.receivedQuantity);
      let batchId = entry.batchId;
      let before = 0;
      if (batchId) {
        const existing = await tx.pharmacyBatch.findFirst({ where: { id: batchId, organizationId, productId: entry.productId } });
        if (!existing) throw new Error("BATCH_NOT_FOUND");
        before = Number(existing.availableQuantity);
        await tx.pharmacyBatch.update({ where: { id: existing.id }, data: { receivedQuantity: Number(existing.receivedQuantity) + quantity, availableQuantity: before + quantity, purchasePrice: receipt.lines.find((line) => line.id === entry.receiptLineId)?.purchasePrice || existing.purchasePrice, updatedById: userId } });
      } else {
        const line = receipt.lines.find((item) => item.id === entry.receiptLineId);
        const location = entry.locationId ? await tx.pharmacyStockLocation.findFirst({ where: { id: entry.locationId, organizationId } }) : null;
        const created = await tx.pharmacyBatch.create({ data: { organizationId, productId: entry.productId, supplierId: receipt.supplierId, purchaseOrderId: receipt.purchaseOrderId, receiptId: receipt.id, batchNumber: entry.batchNumber, barcode: entry.barcode, manufacturingDate: entry.manufacturingDate, expiryDate: entry.expiryDate, receivedAt: receipt.receivedAt, stockEntryDate: new Date(), receivedById: receipt.receivedById, receivedQuantity: quantity, availableQuantity: quantity, unit: line?.unit || "unité", location: location?.name || null, purchasePrice: line?.purchasePrice || null, totalCost: line?.purchasePrice ? quantity * Number(line.purchasePrice) : null, status: entry.initialStatus, quarantine: entry.initialStatus === "QUARANTINED", notes: entry.notes, createdById: userId, updatedById: userId } });
        batchId = created.id;
        await tx.pharmacyReceiptBatch.update({ where: { id: entry.id }, data: { batchId } });
      }
      await tx.pharmacyStockMovement.create({ data: { organizationId, productId: entry.productId, batchId, movementType: "RECEIPT", direction: "IN", quantity, quantityBefore: before, quantityAfter: before + quantity, reason: `Validation de la réception ${receipt.receiptNumber}`, relatedEntityType: "PharmacyReceipt", relatedEntityId: receipt.id, createdById: userId } });
    }
    const partial = receipt.lines.some((line) => line.orderedQuantity !== null && Number(line.receivedQuantity) + Number(line.previouslyReceivedQuantity || 0) < Number(line.orderedQuantity));
    const purchaseOrderId = receipt.purchaseOrderId;
    if (purchaseOrderId) {
      for (const line of receipt.lines) {
        if (!line.purchaseOrderLineId) continue;
        const orderLine = await tx.pharmacyPurchaseOrderLine.findFirst({ where: { id: line.purchaseOrderLineId, purchaseOrderId, organizationId } });
        if (!orderLine) throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
        const receivedQuantity = Number(orderLine.receivedQuantity) + Number(line.receivedQuantity);
        const remainingQuantity = Math.max(0, Number(orderLine.orderedQuantity) - receivedQuantity);
        await tx.pharmacyPurchaseOrderLine.update({ where: { id: orderLine.id }, data: { receivedQuantity, remainingQuantity } });
      }
      const orderLines = await tx.pharmacyPurchaseOrderLine.findMany({ where: { purchaseOrderId, organizationId }, select: { remainingQuantity: true } });
      const orderFullyReceived = orderLines.length > 0 && orderLines.every((line) => Number(line.remainingQuantity) === 0);
      await tx.pharmacyPurchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: orderFullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", updatedById: userId } });
    }
    return tx.pharmacyReceipt.update({ where: { id: receipt.id }, data: { status: partial ? "PARTIALLY_VALIDATED" : "VALIDATED", stockImpactApplied: true, validatedById: userId, validatedAt: new Date(), updatedById: userId } });
  });
}

export async function reverseReceiptStockImpact(organizationId: string, receiptId: string, userId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.pharmacyReceipt.findFirst({ where: { id: receiptId, organizationId }, include: { receiptBatches: true } });
    if (!receipt) throw new Error("RECEIPT_NOT_FOUND");
    if (!receipt.stockImpactApplied) return tx.pharmacyReceipt.update({ where: { id: receipt.id }, data: { status: "CANCELLED", cancelledById: userId, cancelledAt: new Date(), cancellationReason: reason, updatedById: userId } });
    for (const entry of receipt.receiptBatches) {
      if (!entry.batchId) throw new Error("BATCH_NOT_FOUND");
      const batch = await tx.pharmacyBatch.findFirst({ where: { id: entry.batchId, organizationId, productId: entry.productId } });
      if (!batch) throw new Error("BATCH_NOT_FOUND");
      const before = Number(batch.availableQuantity);
      const quantity = Number(entry.receivedQuantity);
      if (before < quantity) throw new Error("NEGATIVE_STOCK");
      await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { availableQuantity: before - quantity, status: before - quantity === 0 ? "DEPLETED" : batch.status, updatedById: userId } });
      await tx.pharmacyStockMovement.create({ data: { organizationId, productId: entry.productId, batchId: batch.id, movementType: "CANCELLATION", direction: "OUT", quantity, quantityBefore: before, quantityAfter: before - quantity, reason, relatedEntityType: "PharmacyReceipt", relatedEntityId: receipt.id, createdById: userId } });
    }
    const purchaseOrderId = receipt.purchaseOrderId;
    if (purchaseOrderId) {
      const lines = await tx.pharmacyReceiptLine.findMany({ where: { receiptId: receipt.id, organizationId } });
      for (const line of lines) {
        if (!line.purchaseOrderLineId) continue;
        const orderLine = await tx.pharmacyPurchaseOrderLine.findFirst({ where: { id: line.purchaseOrderLineId, purchaseOrderId, organizationId } });
        if (!orderLine) continue;
        const receivedQuantity = Math.max(0, Number(orderLine.receivedQuantity) - Number(line.receivedQuantity));
        await tx.pharmacyPurchaseOrderLine.update({ where: { id: orderLine.id }, data: { receivedQuantity, remainingQuantity: Math.max(0, Number(orderLine.orderedQuantity) - receivedQuantity) } });
      }
      const orderLines = await tx.pharmacyPurchaseOrderLine.findMany({ where: { purchaseOrderId, organizationId }, select: { receivedQuantity: true } });
      const orderHasReceipts = orderLines.some((line) => Number(line.receivedQuantity) > 0);
      await tx.pharmacyPurchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: orderHasReceipts ? "PARTIALLY_RECEIVED" : "ORDERED", updatedById: userId } });
    }
    return tx.pharmacyReceipt.update({ where: { id: receipt.id }, data: { status: "CANCELLED", stockImpactApplied: false, cancelledById: userId, cancelledAt: new Date(), cancellationReason: reason, updatedById: userId } });
  });
}

export function duplicateReceiptMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  return "Ce numéro de réception ou ce lot existe déjà dans cette pharmacie.";
}
