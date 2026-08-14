import { Prisma } from "@prisma/client";
import { assertFinanceReady } from "@/lib/enterprise/accounting/configuration-service";
import { resolveExchangeRate } from "@/lib/enterprise/accounting/currency";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { prisma } from "@/lib/prisma";

type RetailSaleAccountingPreflightInput = {
  currencyCode: string;
  soldAt?: Date;
  warehouseId: string;
  lines: Array<{ catalogItemId: string; inventoryItemId?: string | null; quantity: number }>;
};

function sumQuantity(values: Prisma.Decimal[]) {
  return values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
}

/**
 * Fails before a Shop sale creates durable business/stock side effects when the
 * canonical accounting projection cannot currently succeed for known setup data.
 * Runtime posting remains authoritative and revalidates the same invariants.
 */
export async function assertRetailSaleAccountingPreflight(
  organizationId: string,
  input: RetailSaleAccountingPreflightInput,
) {
  return prisma.$transaction(async (tx) => {
    const accountingDate = input.soldAt || new Date();
    const configuration = await assertFinanceReady(tx, organizationId);
    if (configuration.inventoryValuationMethod !== "WEIGHTED_AVERAGE") {
      throw new EnterpriseAccountingError("INVENTORY_WEIGHTED_AVERAGE_REQUIRED", 409);
    }

    await getPostingPeriod(tx, organizationId, accountingDate);
    await resolveExchangeRate(tx, {
      organizationId,
      sourceCurrencyCode: input.currencyCode,
      targetCurrencyCode: configuration.functionalCurrencyCode,
      rateDate: accountingDate,
    });

    const catalogItemIds = Array.from(new Set(input.lines.map((line) => line.catalogItemId)));
    const [catalogItems, inventoryItems] = await Promise.all([
      tx.enterpriseCatalogItem.findMany({
        where: { organizationId, id: { in: catalogItemIds }, status: "ACTIVE", archivedAt: null },
        select: { id: true, trackInventory: true },
      }),
      tx.enterpriseInventoryItem.findMany({
        where: { organizationId, catalogItemId: { in: catalogItemIds }, status: "ACTIVE", archivedAt: null },
        select: { id: true, catalogItemId: true },
      }),
    ]);
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const inventoryByCatalogId = new Map(inventoryItems.map((item) => [item.catalogItemId, item]));

    const requestedByInventoryItem = new Map<string, Prisma.Decimal>();
    for (const line of input.lines) {
      const catalogItem = catalogById.get(line.catalogItemId);
      if (!catalogItem) throw new EnterpriseAccountingError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: line.catalogItemId });
      if (!catalogItem.trackInventory) continue;
      const resolvedInventoryItem = inventoryByCatalogId.get(line.catalogItemId);
      if (!resolvedInventoryItem || (line.inventoryItemId && line.inventoryItemId !== resolvedInventoryItem.id)) {
        throw new EnterpriseAccountingError("RETAIL_INVENTORY_ITEM_REQUIRED", 409, { catalogItemId: line.catalogItemId });
      }
      const current = requestedByInventoryItem.get(resolvedInventoryItem.id) || new Prisma.Decimal(0);
      requestedByInventoryItem.set(resolvedInventoryItem.id, current.plus(line.quantity));
    }

    for (const [inventoryItemId, requestedQuantity] of requestedByInventoryItem) {
      const layers = await tx.enterpriseInventoryCostLayer.findMany({
        where: {
          organizationId,
          inventoryItemId,
          warehouseId: input.warehouseId,
          remainingQuantity: { gt: 0 },
        },
        select: { currencyCode: true, remainingQuantity: true },
      });
      if (!layers.length) {
        throw new EnterpriseAccountingError("RETAIL_INVENTORY_COST_LAYER_REQUIRED", 409, { inventoryItemId });
      }

      const currencies = Array.from(new Set(layers.map((layer) => layer.currencyCode)));
      const valuationCurrency = currencies.includes(input.currencyCode)
        ? input.currencyCode
        : currencies.length === 1
          ? currencies[0]
          : null;
      if (!valuationCurrency) {
        throw new EnterpriseAccountingError("RETAIL_INVENTORY_VALUATION_CURRENCY_AMBIGUOUS", 409, {
          inventoryItemId,
          currencies,
        });
      }

      const available = sumQuantity(
        layers
          .filter((layer) => layer.currencyCode === valuationCurrency)
          .map((layer) => layer.remainingQuantity),
      );
      if (!available.isPositive()) {
        throw new EnterpriseAccountingError("INVENTORY_COST_LAYER_REQUIRED", 409, { inventoryItemId });
      }
      if (requestedQuantity.greaterThan(available)) {
        throw new EnterpriseAccountingError("INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN", 409, {
          inventoryItemId,
          available: available.toFixed(),
          requested: requestedQuantity.toFixed(),
        });
      }

      await resolveExchangeRate(tx, {
        organizationId,
        sourceCurrencyCode: valuationCurrency,
        targetCurrencyCode: configuration.functionalCurrencyCode,
        rateDate: accountingDate,
      });
    }

    return {
      accountingDate,
      functionalCurrencyCode: configuration.functionalCurrencyCode,
      inventoryItemCount: requestedByInventoryItem.size,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
