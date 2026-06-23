import type { z } from "zod";
import { convertPharmacyMoneyToBase } from "@/lib/pharmacy-currencies";
import type { purchaseCreateSchema } from "@/lib/pharmacy-purchase-validators";
import { prisma } from "@/lib/prisma";

type PurchaseInput = z.infer<typeof purchaseCreateSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

async function activeMember(organizationId: string, userId: string) {
  return prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } });
}
export async function validatePurchaseReferences(organizationId: string, data: PurchaseInput) {
  if (data.entityType === "supplier") return null;
  if (data.entityType === "supplier-product") {
    const [supplier, product] = await Promise.all([prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId } }), prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } } })]);
    return supplier && product ? null : "Le fournisseur ou le produit n'appartient pas à cette pharmacie.";
  }
  if (data.entityType === "replenishment") {
    const [product, supplier, requester, department] = await Promise.all([prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } } }), data.suggestedSupplierId ? prisma.pharmacySupplier.findFirst({ where: { id: data.suggestedSupplierId, organizationId } }) : null, activeMember(organizationId, data.requestedById), data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true } }) : null]);
    if (!product || !requester || (data.suggestedSupplierId && !supplier) || (data.departmentId && !department)) return "Une référence de la demande n'appartient pas à cette pharmacie.";
    return null;
  }
  const [supplier, requester, department, products, supplierProducts, request] = await Promise.all([
    prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId, status: { notIn: ["SUSPENDED", "ARCHIVED", "INACTIVE"] } } }),
    activeMember(organizationId, data.requestedById),
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true } }) : null,
    prisma.pharmacyProduct.findMany({ where: { organizationId, id: { in: data.lines.map((line) => line.productId) }, status: { not: "ARCHIVED" } }, select: { id: true } }),
    prisma.pharmacySupplierProduct.findMany({ where: { organizationId, supplierId: data.supplierId, id: { in: data.lines.flatMap((line) => line.supplierProductId ? [line.supplierProductId] : []) } }, select: { id: true } }),
    data.requestId ? prisma.pharmacyReplenishmentRequest.findFirst({ where: { id: data.requestId, organizationId, status: "VALIDATED" } }) : null,
  ]);
  if (!supplier) return "Le fournisseur sélectionné est indisponible ou n'appartient pas à cette pharmacie.";
  if (!requester || (data.departmentId && !department) || (data.requestId && !request)) return "Une référence de la commande n'appartient pas à cette pharmacie.";
  if (products.length !== new Set(data.lines.map((line) => line.productId)).size) return "Un produit de la commande n'appartient pas à cette pharmacie.";
  if (supplierProducts.length !== new Set(data.lines.flatMap((line) => line.supplierProductId ? [line.supplierProductId] : [])).size) return "Une association fournisseur-produit est invalide.";
  return null;
}

export async function createPurchaseEntity(organizationId: string, userId: string, data: PurchaseInput) {
  if (data.entityType === "supplier") {
    const count = await prisma.pharmacySupplier.count({ where: { organizationId } });
    return prisma.pharmacySupplier.create({ data: { organizationId, supplierCode: data.supplierCode || `FOU-${String(count + 1).padStart(5, "0")}`, name: data.name, supplierType: data.supplierType, category: nil(data.category), taxNumber: nil(data.taxNumber), legalIdentifier: nil(data.legalIdentifier), description: nil(data.description), mainContactName: nil(data.mainContactName), mainContactRole: nil(data.mainContactRole), phone: nil(data.phone), email: nil(data.email), whatsapp: nil(data.whatsapp), secondaryContact: nil(data.secondaryContact), country: nil(data.country), city: nil(data.city), area: nil(data.area), address: nil(data.address), deliveryZone: nil(data.deliveryZone), averageDeliveryDays: data.averageDeliveryDays === "" || data.averageDeliveryDays === undefined ? null : Number(data.averageDeliveryDays), paymentTerms: nil(data.paymentTerms), mainCurrency: data.mainCurrency, minimumOrderAmount: data.minimumOrderAmount === "" || data.minimumOrderAmount === undefined ? null : Number(data.minimumOrderAmount), usualDiscountRate: data.usualDiscountRate === "" || data.usualDiscountRate === undefined ? null : Number(data.usualDiscountRate), deliveryFees: data.deliveryFees === "" || data.deliveryFees === undefined ? null : Number(data.deliveryFees), supplierCreditAllowed: data.supplierCreditAllowed, complianceStatus: data.complianceStatus, complianceNotes: nil(data.complianceNotes), notes: nil(data.notes), createdById: userId, updatedById: userId } });
  }
  if (data.entityType === "supplier-product") return prisma.pharmacySupplierProduct.create({ data: { organizationId, supplierId: data.supplierId, productId: data.productId, supplierReference: nil(data.supplierReference), supplierPrice: data.supplierPrice === "" || data.supplierPrice === undefined ? null : Number(data.supplierPrice), deliveryDays: data.deliveryDays === "" || data.deliveryDays === undefined ? null : Number(data.deliveryDays), minimumQuantity: data.minimumQuantity === "" || data.minimumQuantity === undefined ? null : Number(data.minimumQuantity), notes: nil(data.notes) } });
  if (data.entityType === "replenishment") {
    const count = await prisma.pharmacyReplenishmentRequest.count({ where: { organizationId } });
    return prisma.pharmacyReplenishmentRequest.create({ data: { organizationId, requestNumber: data.requestNumber || `REA-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, productId: data.productId, requestedQuantity: data.requestedQuantity, unit: data.unit, source: data.source, reason: data.reason, priority: data.priority, suggestedSupplierId: nil(data.suggestedSupplierId), estimatedPrice: data.estimatedPrice === "" || data.estimatedPrice === undefined ? null : Number(data.estimatedPrice), requestedById: data.requestedById, departmentId: nil(data.departmentId), desiredDate: nil(data.desiredDate), notes: nil(data.notes) } });
  }
  const count = await prisma.pharmacyPurchaseOrder.count({ where: { organizationId } });
  const lines = data.lines.map((line) => { const price = Number(line.estimatedUnitPrice || 0); const discount = Number(line.discountRate || 0); return { ...line, totalLine: roundMoney(line.orderedQuantity * price * (1 - discount / 100)) }; });
  const estimatedTotal = roundMoney(lines.reduce((sum, line) => sum + line.totalLine, 0));
  const conversion = await convertPharmacyMoneyToBase(organizationId, estimatedTotal, data.currency);
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.pharmacyPurchaseOrder.create({ data: { organizationId, orderNumber: data.orderNumber || `CMD-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, supplierId: data.supplierId, requestId: nil(data.requestId), requestedById: data.requestedById, departmentId: nil(data.departmentId), priority: data.priority, orderDate: data.orderDate, expectedDeliveryDate: nil(data.expectedDeliveryDate), deliveryAddress: nil(data.deliveryAddress), deliveryMode: nil(data.deliveryMode), deliveryContact: nil(data.deliveryContact), budgetId: nil(data.budgetId), estimatedTotal, currency: conversion.currency, baseCurrency: conversion.baseCurrency, exchangeRateToBase: conversion.exchangeRateToBase, estimatedTotalBase: conversion.baseAmount, financialValidationRequired: data.financialValidationRequired, notes: nil(data.notes), createdById: userId, updatedById: userId } });
    await transaction.pharmacyPurchaseOrderLine.createMany({ data: lines.map((line) => ({ organizationId, purchaseOrderId: order.id, productId: line.productId, supplierProductId: nil(line.supplierProductId), orderedQuantity: line.orderedQuantity, remainingQuantity: line.orderedQuantity, unit: line.unit, estimatedUnitPrice: line.estimatedUnitPrice === "" || line.estimatedUnitPrice === undefined ? null : Number(line.estimatedUnitPrice), discountRate: line.discountRate === "" || line.discountRate === undefined ? null : Number(line.discountRate), totalLine: line.totalLine, notes: nil(line.notes) })) });
    if (data.requestId) await transaction.pharmacyReplenishmentRequest.update({ where: { id: data.requestId }, data: { status: "CONVERTED_TO_ORDER", purchaseOrderId: order.id } });
    return order;
  });
}

export async function updatePurchaseOrderDraft(organizationId: string, purchaseOrderId: string, userId: string, data: Extract<PurchaseInput, { entityType: "purchase-order" }>) {
  const existing = await prisma.pharmacyPurchaseOrder.findFirst({ where: { id: purchaseOrderId, organizationId }, select: { id: true, status: true } });
  if (!existing) throw new Error("ORDER_NOT_FOUND");
  if (existing.status !== "DRAFT") throw new Error("ORDER_LOCKED");
  const lines = data.lines.map((line) => { const price = Number(line.estimatedUnitPrice || 0); const discount = Number(line.discountRate || 0); return { ...line, totalLine: roundMoney(line.orderedQuantity * price * (1 - discount / 100)) }; });
  const estimatedTotal = roundMoney(lines.reduce((sum, line) => sum + line.totalLine, 0));
  const conversion = await convertPharmacyMoneyToBase(organizationId, estimatedTotal, data.currency);
  return prisma.$transaction(async (transaction) => {
    await transaction.pharmacyPurchaseOrderLine.deleteMany({ where: { purchaseOrderId, organizationId } });
    const order = await transaction.pharmacyPurchaseOrder.update({ where: { id: purchaseOrderId }, data: { orderNumber: data.orderNumber || undefined, supplierId: data.supplierId, requestId: nil(data.requestId), requestedById: data.requestedById, departmentId: nil(data.departmentId), priority: data.priority, orderDate: data.orderDate, expectedDeliveryDate: nil(data.expectedDeliveryDate), deliveryAddress: nil(data.deliveryAddress), deliveryMode: nil(data.deliveryMode), deliveryContact: nil(data.deliveryContact), budgetId: nil(data.budgetId), estimatedTotal, currency: conversion.currency, baseCurrency: conversion.baseCurrency, exchangeRateToBase: conversion.exchangeRateToBase, estimatedTotalBase: conversion.baseAmount, financialValidationRequired: data.financialValidationRequired, notes: nil(data.notes), updatedById: userId } });
    await transaction.pharmacyPurchaseOrderLine.createMany({ data: lines.map((line) => ({ organizationId, purchaseOrderId: order.id, productId: line.productId, supplierProductId: nil(line.supplierProductId), orderedQuantity: line.orderedQuantity, remainingQuantity: line.orderedQuantity, unit: line.unit, estimatedUnitPrice: line.estimatedUnitPrice === "" || line.estimatedUnitPrice === undefined ? null : Number(line.estimatedUnitPrice), discountRate: line.discountRate === "" || line.discountRate === undefined ? null : Number(line.discountRate), totalLine: line.totalLine, notes: nil(line.notes) })) });
    return order;
  });
}

export async function createReceiptFromPurchaseOrder(organizationId: string, purchaseOrderId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const existingDraft = await transaction.pharmacyReceipt.findFirst({ where: { organizationId, purchaseOrderId, status: "DRAFT" }, select: { id: true } });
    if (existingDraft) return existingDraft;
    const order = await transaction.pharmacyPurchaseOrder.findFirst({ where: { id: purchaseOrderId, organizationId }, include: { lines: true } });
    if (!order || !["VALIDATED", "ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)) throw new Error("ORDER_NOT_RECEIVABLE");
    const remaining = order.lines.filter((line) => Number(line.remainingQuantity) > 0);
    if (!remaining.length) throw new Error("ORDER_FULLY_RECEIVED");
    const count = await transaction.pharmacyReceipt.count({ where: { organizationId } });
    const receipt = await transaction.pharmacyReceipt.create({ data: { organizationId, receiptNumber: `REC-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, receiptType: order.status === "PARTIALLY_RECEIVED" ? "PARTIAL" : "PURCHASE_ORDER", supplierId: order.supplierId, purchaseOrderId: order.id, departmentId: order.departmentId, receivedById: userId, receivedAt: new Date(), totalItems: 0, totalAmount: 0, currency: order.currency, baseCurrency: order.baseCurrency, exchangeRateToBase: order.exchangeRateToBase, totalAmountBase: 0, status: "DRAFT", notes: `Réception préparée depuis ${order.orderNumber}`, createdById: userId, updatedById: userId } });
    await transaction.pharmacyReceiptLine.createMany({ data: remaining.map((line) => ({ organizationId, receiptId: receipt.id, productId: line.productId, purchaseOrderLineId: line.id, orderedQuantity: line.orderedQuantity, previouslyReceivedQuantity: line.receivedQuantity, receivedQuantity: 0, unit: line.unit, purchasePrice: line.estimatedUnitPrice, supplierDiscount: line.discountRate, totalLine: 0 })) });
    return receipt;
  });
}

export async function getPurchasesDataset(organizationId: string) {
  const [suppliers, supplierProducts, requests, orders, products, members, departments, receipts, documents, storedAlerts] = await Promise.all([
    prisma.pharmacySupplier.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { products: true, purchaseOrders: { select: { id: true, orderDate: true, status: true } } } }),
    prisma.pharmacySupplierProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" } }),
    prisma.pharmacyReplenishmentRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyPurchaseOrder.findMany({ where: { organizationId }, orderBy: { orderDate: "desc" }, include: { lines: true, documents: true } }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, internalCode: true, stockUnit: true, referencePurchasePrice: true, minStock: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } }, positionId: true } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true } }),
    prisma.pharmacyReceipt.findMany({ where: { organizationId }, select: { id: true, receiptNumber: true, purchaseOrderId: true, status: true, receivedAt: true } }),
    prisma.pharmacySupplierDocument.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyPurchaseAlert.findMany({ where: { organizationId, status: { notIn: ["RESOLVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" } }),
  ]);
  const now = new Date();
  const lateOrders = orders.filter((order) => order.expectedDeliveryDate && order.expectedDeliveryDate < now && ["VALIDATED", "ORDERED", "PARTIALLY_RECEIVED"].includes(order.status));
  const alerts = [...storedAlerts, ...lateOrders.map((order) => ({ id: `late-${order.id}`, organizationId, alertType: "LATE_ORDER", supplierId: order.supplierId, purchaseOrderId: order.id, productId: null, criticality: "HIGH", status: "OPEN", message: `La commande ${order.orderNumber} est en retard.`, recommendedAction: "Contacter le fournisseur et actualiser la livraison.", assignedToId: null, resolvedAt: null, createdAt: order.expectedDeliveryDate!, updatedAt: order.updatedAt }))];
  const openStatuses = ["DRAFT", "SUBMITTED", "IN_VALIDATION", "VALIDATED", "ORDERED", "PARTIALLY_RECEIVED"];
  const metrics = { activeSuppliers: suppliers.filter((item) => item.status === "ACTIVE").length, suspendedSuppliers: suppliers.filter((item) => item.status === "SUSPENDED").length, draftOrders: orders.filter((item) => item.status === "DRAFT").length, submittedOrders: orders.filter((item) => item.status === "SUBMITTED").length, validatedOrders: orders.filter((item) => item.status === "VALIDATED").length, orderedOrders: orders.filter((item) => item.status === "ORDERED").length, partialOrders: orders.filter((item) => item.status === "PARTIALLY_RECEIVED").length, receivedOrders: orders.filter((item) => item.status === "RECEIVED").length, lateOrders: lateOrders.length, openRequests: requests.filter((item) => !["CONVERTED_TO_ORDER", "REJECTED", "CANCELLED"].includes(item.status)).length, openValue: orders.filter((item) => openStatuses.includes(item.status)).reduce((sum, item) => sum + Number(item.estimatedTotal), 0), missingDocuments: suppliers.filter((supplier) => !documents.some((document) => document.supplierId === supplier.id)).length };
  const positions = await prisma.enterprisePosition.findMany({ where: { organizationId, id: { in: members.flatMap((item) => item.positionId ? [item.positionId] : []) } }, select: { id: true, departmentId: true } });
  const positionDepartmentMap = new Map(positions.map((item) => [item.id, item.departmentId]));
  return { metrics, suppliers, supplierProducts, requests, orders, products, members: members.map((item) => ({ ...item.user, departmentId: item.positionId ? positionDepartmentMap.get(item.positionId) || null : null })), departments, receipts, documents, alerts };
}
