import { Prisma } from "@prisma/client";
import { getEffectivePharmacySettings } from "@/lib/pharmacy-settings";
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
  const settings = (await getEffectivePharmacySettings(organizationId)).sections["expiry-fefo"];
  const batches = await prisma.pharmacyBatch.findMany({
    where: { organizationId, productId, availableQuantity: { gt: 0 }, ...(settings.blockExpiredBatchSale ? { expiryDate: { gt: now } } : {}), ...(settings.blockRecalledBatchSale ? { recall: false } : {}), ...(settings.blockQuarantinedBatchSale ? { quarantine: false } : {}), status: { notIn: ["CANCELLED", ...(settings.blockRecalledBatchSale ? ["RECALLED"] : []), ...(settings.blockQuarantinedBatchSale ? ["QUARANTINED"] : []), ...(settings.blockBlockedBatchSale ? ["BLOCKED"] : []), ...(settings.blockExpiredBatchSale ? ["EXPIRED"] : [])] } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    include: { product: { select: { name: true, genericName: true, internalCode: true } } },
  });
  return batches.filter((batch) => { const status = effectivePharmacyBatchStatus({ ...batch, expiryAlertDays: Number(settings.nearExpiryThresholdDays) }, now); return status === "ACTIVE" || status === "NEAR_EXPIRY" || (!settings.blockExpiredBatchSale && status === "EXPIRED"); });
}
