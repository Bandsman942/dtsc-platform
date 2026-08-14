import type { z } from "zod";
import { finalizeRetailSaleAccounting } from "@/lib/enterprise/retail/accounting";
import { assertRetailSaleAccountingPreflight } from "@/lib/enterprise/retail/accounting-preflight";
import { persistRetailCommercialDecisions, prepareCommercialRetailSaleV2, previewRetailCommercialPricing } from "@/lib/enterprise/retail/commercial-engine";
import type { retailCommercialContextSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { autoEarnRetailLoyaltyForSale } from "@/lib/enterprise/retail/loyalty-sale-hooks";
import type { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import type { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailSale } from "@/lib/enterprise/retail/service";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";

type RetailSaleInput = z.infer<typeof retailSaleCreateSchema>;
type RetailCommercialContext = z.infer<typeof retailCommercialContextSchema>;
type RetailCommercialPermissions = Awaited<ReturnType<typeof getRetailCommercialPermissions>>;

export async function executeCanonicalRetailSale(args: {
  organizationId: string;
  actorUserId: string;
  input: RetailSaleInput;
  commercialContext: RetailCommercialContext;
  permissions: RetailCommercialPermissions;
}) {
  let pricingInput = args.input;
  if (!args.commercialContext.overrideReason) {
    const preview = await previewRetailCommercialPricing(
      args.organizationId,
      {
        siteId: args.input.siteId,
        customerBusinessPartyId: args.input.customerBusinessPartyId,
        currencyCode: args.input.currencyCode,
        soldAt: args.input.soldAt,
        lines: args.input.lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity })),
      },
      {
        couponCode: args.commercialContext.couponCode,
        customerSegmentCode: args.commercialContext.customerSegmentCode,
        channelCode: args.commercialContext.channelCode,
      },
    );
    const previewByItem = new Map(preview.lines.map((line) => [line.catalogItemId, line]));
    pricingInput = {
      ...args.input,
      lines: args.input.lines.map((line) => {
        const resolved = previewByItem.get(line.catalogItemId);
        if (!resolved) return line;
        return {
          ...line,
          unitPrice: Number(resolved.resolvedUnitPrice),
          discountAmount: Number(resolved.discountAmount),
          taxAmount: Number(resolved.taxAmount),
        };
      }),
    };
  }

  const guarded = await prepareCommercialRetailSaleV2(args.organizationId, pricingInput, args.commercialContext, args.permissions);

  // Do not create the ticket, stock movements or cash effects when the known
  // Finance prerequisites cannot produce the canonical accounting projection.
  // postBusinessEvent/valueInventoryIssue still revalidate authoritatively.
  await assertRetailSaleAccountingPreflight(args.organizationId, {
    currencyCode: guarded.input.currencyCode,
    soldAt: guarded.input.soldAt,
    warehouseId: guarded.input.warehouseId,
    lines: guarded.input.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
    })),
  });

  const result = await withRetailTransactionRetry(
    () => createRetailSale(args.organizationId, args.actorUserId, guarded.input),
    { maxAttempts: 3, baseDelayMs: 20 },
  );
  await persistRetailCommercialDecisions(
    args.organizationId,
    result.sale.id,
    result.sale.customerBusinessPartyId,
    result.sale.currencyCode,
    guarded.decisions,
  );
  const accounting = await finalizeRetailSaleAccounting(args.organizationId, args.actorUserId, result.sale.id);
  const loyalty = await autoEarnRetailLoyaltyForSale(args.organizationId, args.actorUserId, result.sale.id);
  const promotionCount = new Set(guarded.decisions.flatMap((decision) => decision.promotionIds)).size;

  return { result, guarded, accounting, loyalty, promotionCount };
}
