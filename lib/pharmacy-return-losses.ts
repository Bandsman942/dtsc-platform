import type { z } from "zod";
import type { returnLossEventSchema } from "@/lib/pharmacy-return-loss-validators";
import { prisma } from "@/lib/prisma";

type EventInput = z.infer<typeof returnLossEventSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;

export async function validateReturnLossReferences(organizationId: string, data: EventInput) {
  const [product, batch, sale, refund, supplier, order, receipt, inventorySession, inventoryLine, targetLocation, responsible, witness] = await Promise.all([
    prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } }, select: { id: true } }),
    prisma.pharmacyBatch.findFirst({ where: { id: data.batchId, organizationId, productId: data.productId }, select: { id: true, availableQuantity: true } }),
    data.saleId ? prisma.pharmacySale.findFirst({ where: { id: data.saleId, organizationId }, include: { lines: true } }) : null,
    data.refundId ? prisma.pharmacyRefund.findFirst({ where: { id: data.refundId, organizationId }, select: { id: true, saleId: true } }) : null,
    data.supplierId ? prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId }, select: { id: true } }) : null,
    data.purchaseOrderId ? prisma.pharmacyPurchaseOrder.findFirst({ where: { id: data.purchaseOrderId, organizationId }, select: { id: true, supplierId: true } }) : null,
    data.receiptId ? prisma.pharmacyReceipt.findFirst({ where: { id: data.receiptId, organizationId }, select: { id: true, supplierId: true } }) : null,
    data.inventorySessionId ? prisma.pharmacyInventorySession.findFirst({ where: { id: data.inventorySessionId, organizationId }, select: { id: true } }) : null,
    data.inventoryLineId ? prisma.pharmacyInventoryLine.findFirst({ where: { id: data.inventoryLineId, organizationId }, select: { id: true, inventorySessionId: true, productId: true, batchId: true } }) : null,
    data.targetLocationId ? prisma.pharmacyStockLocation.findFirst({ where: { id: data.targetLocationId, organizationId, status: "ACTIVE" }, select: { id: true } }) : null,
    data.responsibleUserId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: data.responsibleUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }) : null,
    data.witnessUserId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: data.witnessUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }) : null,
  ]);
  if (!product || !batch) return "Le produit ou le lot n'appartient pas à cette pharmacie.";
  if (data.saleId && !sale) return "La vente sélectionnée n'appartient pas à cette pharmacie.";
  if (data.refundId && (!refund || (data.saleId && refund.saleId !== data.saleId))) return "Le remboursement sélectionné est invalide.";
  if (data.supplierId && !supplier) return "Le fournisseur sélectionné n'appartient pas à cette pharmacie.";
  if (data.purchaseOrderId && (!order || (data.supplierId && order.supplierId !== data.supplierId))) return "La commande fournisseur est invalide.";
  if (data.receiptId && (!receipt || (data.supplierId && receipt.supplierId !== data.supplierId))) return "La réception fournisseur est invalide.";
  if (data.inventorySessionId && !inventorySession) return "La session d'inventaire sélectionnée est invalide.";
  if (data.inventoryLineId && (!inventoryLine || inventoryLine.productId !== data.productId || inventoryLine.batchId !== data.batchId || (data.inventorySessionId && inventoryLine.inventorySessionId !== data.inventorySessionId))) return "La ligne d'inventaire sélectionnée ne correspond pas au produit et au lot.";
  if (data.targetLocationId && !targetLocation) return "L'emplacement cible sélectionné est invalide.";
  if (data.responsibleUserId && !responsible) return "Le responsable n'appartient pas à cette organisation.";
  if (data.witnessUserId && !witness) return "Le témoin n'appartient pas à cette organisation.";
  if (data.eventType === "CUSTOMER_RETURN") {
    if (!sale) return "Une vente est obligatoire pour un retour client.";
    const saleLine = sale.lines.find((line) => line.id === data.saleLineId || (line.productId === data.productId && line.batchId === data.batchId));
    if (!saleLine) return "La ligne vendue ne correspond pas au produit et au lot.";
    const returned = await prisma.pharmacyReturnLossEvent.aggregate({ where: { organizationId, eventType: "CUSTOMER_RETURN", saleLineId: saleLine.id, status: { in: ["SUBMITTED", "VALIDATED"] } }, _sum: { quantity: true } });
    if (Number(returned._sum.quantity || 0) + data.quantity > Number(saleLine.quantity)) return "La quantité retournée dépasse la quantité vendue restante.";
  }
  if (data.direction === "OUT" && Number(batch.availableQuantity) < data.quantity) return "La quantité dépasse le stock disponible du lot.";
  return null;
}

export async function createReturnLossEvent(organizationId: string, userId: string, data: EventInput) {
  const count = await prisma.pharmacyReturnLossEvent.count({ where: { organizationId } });
  let saleLineId = nil(data.saleLineId);
  if (data.eventType === "CUSTOMER_RETURN" && data.saleId && !saleLineId) {
    const saleLine = await prisma.pharmacySaleLine.findFirst({ where: { organizationId, saleId: data.saleId, productId: data.productId, batchId: data.batchId }, select: { id: true } });
    saleLineId = saleLine?.id || null;
  }
  return prisma.pharmacyReturnLossEvent.create({ data: { organizationId, eventNumber: data.eventNumber || `RAP-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, eventType: data.eventType, saleId: nil(data.saleId), saleLineId, refundId: nil(data.refundId), supplierId: nil(data.supplierId), purchaseOrderId: nil(data.purchaseOrderId), receiptId: nil(data.receiptId), inventorySessionId: nil(data.inventorySessionId), inventoryLineId: nil(data.inventoryLineId), productId: data.productId, batchId: data.batchId, targetLocationId: nil(data.targetLocationId), quantity: data.quantity, unit: data.unit, direction: data.direction, itemCondition: nil(data.itemCondition), stockDecision: nil(data.stockDecision), reason: data.reason, estimatedValue: data.estimatedValue === "" || data.estimatedValue === undefined ? null : Number(data.estimatedValue), criticality: data.criticality, refundRequested: data.refundRequested, responsibleUserId: nil(data.responsibleUserId), witnessUserId: nil(data.witnessUserId), destructionMethod: nil(data.destructionMethod), destructionDate: data.destructionDate === "" || data.destructionDate === undefined ? null : data.destructionDate, notes: nil(data.notes), createdById: userId, updatedById: userId } });
}

function movementType(eventType: string, direction: string) {
  const types: Record<string, string> = { CUSTOMER_RETURN: "RETURN_CUSTOMER", SUPPLIER_RETURN: "RETURN_SUPPLIER", LOSS: "LOSS", DAMAGE: "DAMAGE", EXPIRED_WITHDRAWAL: "EXPIRY_REMOVAL", RECALL_WITHDRAWAL: "RECALL", DESTRUCTION: "DESTRUCTION", EXCEPTIONAL_TRANSFER: "TRANSFER_EXCEPTIONAL" };
  return eventType === "STOCK_ADJUSTMENT" ? direction === "IN" ? "ADJUSTMENT_POSITIVE" : "ADJUSTMENT_NEGATIVE" : types[eventType] || "ADJUSTMENT";
}

export async function applyReturnLossStockImpact(organizationId: string, eventId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const event = await transaction.pharmacyReturnLossEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!event) throw new Error("EVENT_NOT_FOUND");
    if (event.stockImpactApplied) return event;
    if (event.status !== "SUBMITTED") throw new Error("EVENT_NOT_SUBMITTED");
    if (!event.batchId) throw new Error("BATCH_REQUIRED");
    const batch = await transaction.pharmacyBatch.findFirst({ where: { id: event.batchId, organizationId, productId: event.productId } });
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const before = Number(batch.availableQuantity);
    const quantity = Number(event.quantity);
    const after = event.direction === "IN" ? before + quantity : before - quantity;
    if (after < 0) throw new Error("NEGATIVE_STOCK");
    const quarantine = event.stockDecision === "QUARANTINE";
    const recalled = event.eventType === "RECALL_WITHDRAWAL";
    await transaction.pharmacyBatch.update({ where: { id: batch.id }, data: { availableQuantity: after, quarantine: quarantine || batch.quarantine, recall: recalled || batch.recall, status: quarantine ? "QUARANTINED" : recalled ? "RECALLED" : after === 0 ? "DEPLETED" : batch.status, updatedById: userId } });
    await transaction.pharmacyStockMovement.create({ data: { organizationId, productId: event.productId, batchId: batch.id, movementType: movementType(event.eventType, event.direction), direction: event.direction, quantity, quantityBefore: before, quantityAfter: after, reason: event.reason, relatedEntityType: "PharmacyReturnLossEvent", relatedEntityId: event.id, createdById: userId } });
    if (event.criticality === "CRITICAL" || recalled) await transaction.pharmacyReturnLossAlert.create({ data: { organizationId, eventId: event.id, productId: event.productId, batchId: event.batchId, alertType: recalled ? "RECALL_WITHDRAWAL" : "CRITICAL_LOSS", criticality: "CRITICAL", message: `Événement critique ${event.eventNumber}`, recommendedAction: "Contrôler le lot et documenter la décision." } });
    return transaction.pharmacyReturnLossEvent.update({ where: { id: event.id }, data: { status: "VALIDATED", stockImpactApplied: true, validatedById: userId, validatedAt: new Date(), updatedById: userId } });
  });
}

export async function reverseReturnLossStockImpact(organizationId: string, eventId: string, userId: string, reason: string) {
  return prisma.$transaction(async (transaction) => {
    const event = await transaction.pharmacyReturnLossEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!event) throw new Error("EVENT_NOT_FOUND");
    if (!event.stockImpactApplied || !event.batchId) return transaction.pharmacyReturnLossEvent.update({ where: { id: event.id }, data: { status: "CANCELLED", cancellationReason: reason, cancelledById: userId, cancelledAt: new Date(), updatedById: userId } });
    const batch = await transaction.pharmacyBatch.findFirst({ where: { id: event.batchId, organizationId, productId: event.productId } });
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const before = Number(batch.availableQuantity);
    const quantity = Number(event.quantity);
    const after = event.direction === "IN" ? before - quantity : before + quantity;
    if (after < 0) throw new Error("NEGATIVE_STOCK");
    await transaction.pharmacyBatch.update({ where: { id: batch.id }, data: { availableQuantity: after, updatedById: userId } });
    await transaction.pharmacyStockMovement.create({ data: { organizationId, productId: event.productId, batchId: batch.id, movementType: "RETURN_LOSS_REVERSAL", direction: event.direction === "IN" ? "OUT" : "IN", quantity, quantityBefore: before, quantityAfter: after, reason, relatedEntityType: "PharmacyReturnLossEvent", relatedEntityId: event.id, createdById: userId } });
    return transaction.pharmacyReturnLossEvent.update({ where: { id: event.id }, data: { status: "CANCELLED", stockImpactApplied: false, cancellationReason: reason, cancelledById: userId, cancelledAt: new Date(), updatedById: userId } });
  });
}

export async function getReturnLossDataset(organizationId: string) {
  const [events, products, batches, sales, suppliers, orders, receipts, refunds, members, documents, alerts, movements] = await Promise.all([
    prisma.pharmacyReturnLossEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { documents: true, alerts: true } }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, stockUnit: true } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId }, orderBy: { expiryDate: "asc" }, select: { id: true, productId: true, batchNumber: true, availableQuantity: true, purchasePrice: true, expiryDate: true } }),
    prisma.pharmacySale.findMany({ where: { organizationId }, orderBy: { saleDate: "desc" }, select: { id: true, saleNumber: true, customerName: true, saleDate: true } }),
    prisma.pharmacySupplier.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.pharmacyPurchaseOrder.findMany({ where: { organizationId }, orderBy: { orderDate: "desc" }, select: { id: true, orderNumber: true, supplierId: true } }),
    prisma.pharmacyReceipt.findMany({ where: { organizationId }, orderBy: { receivedAt: "desc" }, select: { id: true, receiptNumber: true, supplierId: true } }),
    prisma.pharmacyRefund.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, refundNumber: true, saleId: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } } } }),
    prisma.pharmacyReturnLossDocument.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyReturnLossAlert.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyStockMovement.findMany({ where: { organizationId, relatedEntityType: "PharmacyReturnLossEvent" }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const today = new Date().toISOString().slice(0, 10); const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const metrics = { customerReturnsToday: events.filter((item) => item.eventType === "CUSTOMER_RETURN" && item.createdAt.toISOString().slice(0, 10) === today).length, customerReturnsMonth: events.filter((item) => item.eventType === "CUSTOMER_RETURN" && item.createdAt >= month).length, supplierReturnsOpen: events.filter((item) => item.eventType === "SUPPLIER_RETURN" && !["VALIDATED", "REJECTED", "CANCELLED"].includes(item.status)).length, pendingAdjustments: events.filter((item) => item.eventType === "STOCK_ADJUSTMENT" && item.status === "SUBMITTED").length, validatedAdjustments: events.filter((item) => item.eventType === "STOCK_ADJUSTMENT" && item.status === "VALIDATED").length, losses: events.filter((item) => ["LOSS", "DAMAGE"].includes(item.eventType)).length, expired: events.filter((item) => item.eventType === "EXPIRED_WITHDRAWAL").length, recalled: events.filter((item) => item.eventType === "RECALL_WITHDRAWAL").length, destructionsPending: events.filter((item) => item.eventType === "DESTRUCTION" && item.status === "SUBMITTED").length, estimatedLossValue: events.filter((item) => ["LOSS", "DAMAGE", "EXPIRED_WITHDRAWAL", "DESTRUCTION"].includes(item.eventType)).reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0), movements: movements.length, criticalAlerts: alerts.filter((item) => item.criticality === "CRITICAL" && item.status === "OPEN").length, pendingValidations: events.filter((item) => item.status === "SUBMITTED").length };
  return { metrics, events, products, batches, sales, suppliers, orders, receipts, refunds, members: members.map((item) => item.user), documents, alerts, movements };
}
