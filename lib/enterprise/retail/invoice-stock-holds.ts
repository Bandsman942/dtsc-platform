import { Prisma } from "@prisma/client";

// @prisma/client Decimal does not expose the static Decimal.min/max helpers.
const decimalMax = (...values: Prisma.Decimal[]): Prisma.Decimal => values.reduce((a, b) => a.greaterThan(b) ? a : b);


/** A prepared Retail invoice is a stock promise, not a stock movement.
 * The canonical invoice/checkout line is the sole source of that promise:
 * it becomes free again when Finance cancels/voids the invoice, and is
 * consumed atomically when the fully paid invoice posts its stock movement.
 * No duplicate reservation ledger or background expiry job is necessary.
 */
export async function readActiveRetailInvoiceStockHoldsTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    inventoryItemIds: string[];
    warehouseId?: string;
    excludeSalesInvoiceId?: string;
  },
) {
  if (!input.inventoryItemIds.length) return [];
  const lines = await tx.enterpriseRetailInvoiceCheckoutLine.findMany({
    where: {
      organizationId: input.organizationId,
      inventoryItemId: { in: input.inventoryItemIds },
      checkout: {
        ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
        ...(input.excludeSalesInvoiceId ? { salesInvoiceId: { not: input.excludeSalesInvoiceId } } : {}),
        stockPostedAt: null,
        invoice: { status: { notIn: ["CANCELLED", "VOIDED"] } },
      },
    },
    select: {
      inventoryItemId: true,
      stockLotId: true,
      invoiceItem: { select: { quantity: true } },
      returnLines: { where: { request: { status: "COMPLETED" } }, select: { quantity: true } },
      checkout: { select: { warehouseId: true } },
    },
  });
  return lines.map((line) => ({
    inventoryItemId: line.inventoryItemId!,
    stockLotId: line.stockLotId,
    warehouseId: line.checkout.warehouseId,
    quantity: decimalMax(new Prisma.Decimal(0), new Prisma.Decimal(line.invoiceItem.quantity).minus(
      (line.returnLines || []).reduce((total, entry) => total.plus(entry.quantity), new Prisma.Decimal(0)),
    )),
  })).filter((line) => line.quantity.greaterThan(0));
}
