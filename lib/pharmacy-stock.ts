import { Prisma } from "@prisma/client";
import { effectivePharmacyBatchStatus } from "@/lib/pharmacy-batches";
import { prisma } from "@/lib/prisma";

export function calculateProductStockStatus(product: { stockTrackingEnabled: boolean; minStock: Prisma.Decimal; maxStock: Prisma.Decimal | null; status: string }, available: number) {
  if (!product.stockTrackingEnabled) return "NOT_TRACKED";
  if (product.status !== "ACTIVE") return "BLOCKED";
  if (available <= 0) return "OUT_OF_STOCK";
  if (available <= Number(product.minStock)) return "LOW_STOCK";
  if (product.maxStock !== null && available >= Number(product.maxStock)) return "OVERSTOCK";
  return "AVAILABLE";
}

export async function getPharmacyStockDataset(organizationId: string) {
  const [products, batches, movements, sessions, adjustments, locations, members, departments] = await Promise.all([
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, include: { batches: { orderBy: { expiryDate: "asc" } } } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId }, orderBy: { expiryDate: "asc" }, include: { product: { select: { name: true, internalCode: true } }, stockMovements: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.pharmacyStockMovement.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 200, include: { product: { select: { name: true } }, batch: { select: { batchNumber: true } }, createdBy: { select: { name: true } } } }),
    prisma.pharmacyInventorySession.findMany({ where: { organizationId }, orderBy: { inventoryDate: "desc" }, take: 100, include: { responsible: { select: { name: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { name: true } }, batch: { select: { batchNumber: true } } } } } }),
    prisma.pharmacyStockAdjustment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, include: { product: { select: { name: true } }, batch: { select: { batchNumber: true } }, requestedBy: { select: { name: true } } } }),
    prisma.pharmacyStockLocation.findMany({ where: { organizationId }, orderBy: { name: "asc" }, take: 200 }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true }, orderBy: { labelFr: "asc" } }),
  ]);
  const now = new Date();
  const productStock = products.map((product) => {
    const available = product.batches.reduce((sum, batch) => sum + Number(batch.availableQuantity), 0);
    const reserved = product.batches.reduce((sum, batch) => sum + Number(batch.reservedQuantity), 0);
    const damaged = product.batches.reduce((sum, batch) => sum + Number(batch.damagedQuantity), 0);
    const value = product.batches.reduce((sum, batch) => sum + Number(batch.availableQuantity) * Number(batch.purchasePrice || 0), 0);
    return { id: product.id, name: product.name, genericName: product.genericName, category: product.category, stockUnit: product.stockUnit, available, reserved, damaged, value, minStock: Number(product.minStock), maxStock: product.maxStock === null ? null : Number(product.maxStock), status: calculateProductStockStatus(product, available), location: product.defaultLocation, nearestExpiry: product.batches[0]?.expiryDate || null, activeLots: product.batches.filter((batch) => ["ACTIVE", "NEAR_EXPIRY"].includes(effectivePharmacyBatchStatus(batch, now))).length };
  });
  const metrics = {
    trackedProducts: productStock.filter((item) => item.status !== "NOT_TRACKED").length,
    activeLots: batches.filter((batch) => ["ACTIVE", "NEAR_EXPIRY"].includes(effectivePharmacyBatchStatus(batch, now))).length,
    estimatedValue: productStock.reduce((sum, item) => sum + item.value, 0),
    outOfStock: productStock.filter((item) => item.status === "OUT_OF_STOCK").length,
    lowStock: productStock.filter((item) => item.status === "LOW_STOCK").length,
    overstock: productStock.filter((item) => item.status === "OVERSTOCK").length,
    expired: batches.filter((batch) => effectivePharmacyBatchStatus(batch, now) === "EXPIRED").length,
    nearExpiry: batches.filter((batch) => effectivePharmacyBatchStatus(batch, now) === "NEAR_EXPIRY").length,
    quarantine: batches.filter((batch) => effectivePharmacyBatchStatus(batch, now) === "QUARANTINED").length,
    recalled: batches.filter((batch) => effectivePharmacyBatchStatus(batch, now) === "RECALLED").length,
    pendingVariances: sessions.flatMap((session) => session.lines).filter((line) => Number(line.variance || 0) !== 0 && !["VALIDATED", "ADJUSTMENT_CREATED"].includes(line.status)).length,
    pendingAdjustments: adjustments.filter((adjustment) => ["DRAFT", "SUBMITTED", "IN_REVIEW"].includes(adjustment.status)).length,
  };
  return { metrics, productStock, batches: batches.map((batch) => ({ ...batch, effectiveStatus: effectivePharmacyBatchStatus(batch, now) })), movements, sessions, adjustments, locations, members: members.map((member) => member.user), departments };
}

export async function generateInventoryLines(organizationId: string, sessionId: string) {
  const session = await prisma.pharmacyInventorySession.findFirst({ where: { id: sessionId, organizationId }, select: { id: true, status: true } });
  if (!session || !["DRAFT", "PLANNED", "IN_PROGRESS"].includes(session.status)) throw new Error("SESSION_LOCKED");
  const batches = await prisma.pharmacyBatch.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true, productId: true, availableQuantity: true } });
  await prisma.$transaction(batches.map((batch) => prisma.pharmacyInventoryLine.upsert({
    where: { inventorySessionId_batchId: { inventorySessionId: sessionId, batchId: batch.id } },
    create: { organizationId, inventorySessionId: sessionId, productId: batch.productId, batchId: batch.id, systemQuantity: batch.availableQuantity },
    update: { systemQuantity: batch.availableQuantity },
  })));
  return prisma.pharmacyInventorySession.update({ where: { id: sessionId }, data: { status: "IN_PROGRESS" } });
}
