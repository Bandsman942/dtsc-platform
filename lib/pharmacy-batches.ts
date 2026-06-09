import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STRONG_STATUSES = new Set(["RECALLED", "QUARANTINED", "BLOCKED", "CANCELLED"]);

export function effectivePharmacyBatchStatus(batch: { status: string; recall: boolean; quarantine: boolean; expiryDate: Date; availableQuantity: Prisma.Decimal | number; expiryAlertDays?: number | null }, now = new Date()) {
  if (batch.recall || batch.status === "RECALLED") return "RECALLED";
  if (batch.quarantine || batch.status === "QUARANTINED") return "QUARANTINED";
  if (STRONG_STATUSES.has(batch.status)) return batch.status;
  if (batch.expiryDate.getTime() < now.getTime()) return "EXPIRED";
  if (Number(batch.availableQuantity) <= 0) return "DEPLETED";
  const threshold = batch.expiryAlertDays ?? 90;
  if (batch.expiryDate.getTime() <= now.getTime() + threshold * 86_400_000) return "NEAR_EXPIRY";
  return "ACTIVE";
}

export async function getSellableBatchesForProduct(organizationId: string, productId: string) {
  const now = new Date();
  const batches = await prisma.pharmacyBatch.findMany({
    where: { organizationId, productId, availableQuantity: { gt: 0 }, expiryDate: { gt: now }, recall: false, quarantine: false, status: { notIn: ["RECALLED", "QUARANTINED", "BLOCKED", "CANCELLED", "EXPIRED"] } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    include: { product: { select: { name: true, genericName: true, internalCode: true } } },
  });
  return batches.filter((batch) => effectivePharmacyBatchStatus(batch, now) === "ACTIVE" || effectivePharmacyBatchStatus(batch, now) === "NEAR_EXPIRY");
}
