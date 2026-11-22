import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

/**
 * Canonical stock issue safeguard. A batch recall belongs to the company-wide
 * (inventoryItemId, lotNumber) pair, not to the local warehouse record.
 * Historical/imported sister batches may still say AVAILABLE. Refuse their
 * commercial fulfillment, production consumption and outbound transfers.
 *
 * This intentionally does NOT bar approved disposal or supplier return of an
 * isolated batch: those workflows must be able to remove unsafe goods.
 *
 * Call inside the SAME serializable stock transaction after local lot
 * coordinates/quality have been checked and before balances are mutated.
 */
export async function assertNoRecalledLotConsumptionTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    inventoryItemId: string;
    stockLot: { lotNumber: string; recallReference: string | null } | null;
    movementType: string;
  },
): Promise<void> {
  if (!input.stockLot || !["SALE_FULFILLMENT", "PRODUCTION_CONSUMPTION", "TRANSFER_OUT"].includes(input.movementType)) {
    return;
  }
  if (input.stockLot.recallReference) throw new EnterpriseDomainError("STOCK_LOT_RECALLED", 409);
  const recalled = await tx.enterpriseStockLot.findFirst({
    where: {
      organizationId: input.organizationId,
      inventoryItemId: input.inventoryItemId,
      lotNumber: input.stockLot.lotNumber,
      recallReference: { not: null },
    },
    select: { id: true },
  });
  if (recalled) throw new EnterpriseDomainError("STOCK_LOT_RECALLED", 409);
}
