import type { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";

/**
 * A recall affects the same physical batch number throughout the enterprise.
 * Only active managers of active affected warehouses, who remain active
 * members of this organization, are notified. Never include warehouse,
 * product, lot or supplier details in the push payload.
 */
export async function recallWarehouseManagerRecipientsTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  inventoryItemId: string,
  lotNumber: string,
  recallReference: string,
  initiatedByUserId: string,
): Promise<string[]> {
  const lots = await tx.enterpriseStockLot.findMany({
    where: { organizationId, inventoryItemId, lotNumber, recallReference, archivedAt: null },
    select: { warehouseId: true },
    distinct: ["warehouseId"],
  });
  if (!lots.length) return [];
  const warehouses = await tx.enterpriseWarehouse.findMany({
    where: {
      organizationId,
      id: { in: lots.map(lot => lot.warehouseId) },
      status: "ACTIVE",
      archivedAt: null,
      managerUserId: { not: null },
    },
    select: { managerUserId: true },
  });
  const candidates = [...new Set(warehouses.map(row => row.managerUserId)
    .filter((id): id is string => Boolean(id) && id !== initiatedByUserId))];
  if (!candidates.length) return [];
  const active = await tx.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null, userId: { in: candidates } },
    select: { userId: true },
  });
  return [...new Set(active.map(member => member.userId))].sort();
}

/**
 * Called only AFTER the recall transaction commits. Stable notification keys
 * prevent duplicate alerts on delivery retries; a failed push must never
 * undo the already committed quarantine.
 */
export async function notifyRecallWarehouseManagers(input: {
  organizationId: string;
  recallReference: string;
  recipientUserIds: string[];
}) {
  let queued = 0;
  let failed = 0;
  for (let offset = 0; offset < input.recipientUserIds.length; offset += 10) {
    const batch = input.recipientUserIds.slice(offset, offset + 10);
    const outcomes = await Promise.allSettled(batch.map(userId => notifyUser({
      userId,
      organizationId: input.organizationId,
      type: "INFO",
      title: "Alerte qualité des stocks",
      body: "Un rappel de lot nécessite une vérification. Consultez uniquement les stocks auxquels votre rôle donne accès.",
      targetUrl: "/enterprise-modules/INVENTORY_LOGISTICS",
      idempotencyKey: `INVENTORY_RECALL:${input.organizationId}:${input.recallReference}:${userId}`,
    })));
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled" && outcome.value) queued += 1;
      else failed += 1;
    }
  }
  return { recipients: input.recipientUserIds.length, queued, failed };
}
