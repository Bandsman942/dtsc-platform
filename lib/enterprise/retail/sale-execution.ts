import type { z } from "zod";
import { finalizeRetailSaleAccounting } from "@/lib/enterprise/retail/accounting";
import { assertRetailSaleAccountingPreflight } from "@/lib/enterprise/retail/accounting-preflight";
import {
  applyRetailRelationshipBenefitPricing,
  persistRetailCommercialDecisions,
  prepareCommercialRetailSaleV2,
  previewRetailCommercialPricing,
} from "@/lib/enterprise/retail/commercial-engine";
import type { retailCommercialContextSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { autoEarnRetailLoyaltyForSale } from "@/lib/enterprise/retail/loyalty-sale-hooks";
import {
  resolveRetailRelationshipBenefitPricing,
  serializeRetailRelationshipBenefitEffects,
} from "@/lib/enterprise/relationship-benefits/retail-adapter";
import type { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import type { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailSale } from "@/lib/enterprise/retail/service";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { notifyUser } from "@/lib/notifications";

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

  const relationshipResolution =
    !guarded.overrideApplied && !args.commercialContext.overrideReason
      ? await resolveRetailRelationshipBenefitPricing({
          organizationId: args.organizationId,
          customerBusinessPartyId: guarded.input.customerBusinessPartyId,
          currencyCode: guarded.input.currencyCode,
          siteId: guarded.input.siteId,
          channelCode: args.commercialContext.channelCode,
          soldAt: guarded.input.soldAt,
          decisions: guarded.decisions,
        })
      : { adjustment: null, effects: [] };

  const finalDecisions = applyRetailRelationshipBenefitPricing(
    guarded.decisions,
    relationshipResolution.adjustment,
  );
  const finalDecisionByItem = new Map(
    finalDecisions.map((decision) => [decision.catalogItemId, decision]),
  );
  const finalInput = {
    ...guarded.input,
    lines: guarded.input.lines.map((line) => {
      const decision = finalDecisionByItem.get(line.catalogItemId);
      if (!decision) return line;
      return {
        ...line,
        unitPrice: Number(decision.serviceUnitPrice.toString()),
        discountAmount: Number(decision.serviceDiscountAmount.toString()),
        taxAmount: Number(decision.taxAmount.toString()),
      };
    }),
  };

  // Do not create the ticket, stock movements or cash effects when the known
  // Finance prerequisites cannot produce the canonical accounting projection.
  // postBusinessEvent/valueInventoryIssue still revalidate authoritatively.
  await assertRetailSaleAccountingPreflight(args.organizationId, {
    currencyCode: finalInput.currencyCode,
    soldAt: finalInput.soldAt,
    warehouseId: finalInput.warehouseId,
    lines: finalInput.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
    })),
  });

  const result = await withRetailTransactionRetry(
    () => createRetailSale(args.organizationId, args.actorUserId, finalInput, relationshipResolution.effects),
    { maxAttempts: 3, baseDelayMs: 20 },
  );
  await persistRetailCommercialDecisions(
    args.organizationId,
    result.sale.id,
    result.sale.customerBusinessPartyId,
    result.sale.currencyCode,
    finalDecisions,
  );
  const accounting = await finalizeRetailSaleAccounting(args.organizationId, args.actorUserId, result.sale.id);
  const loyalty = await autoEarnRetailLoyaltyForSale(args.organizationId, args.actorUserId, result.sale.id);
  const promotionCount = new Set(finalDecisions.flatMap((decision) => decision.promotionIds)).size;
  const relationshipBenefits = serializeRetailRelationshipBenefitEffects(
    relationshipResolution.effects,
  );
  await Promise.all(
    relationshipResolution.effects.map((effect) =>
      notifyUser({
        userId: effect.userId,
        organizationId: args.organizationId,
        type: "ENTERPRISE_RELATIONSHIP",
        title: "Avantage appliqué",
        body: `${effect.benefitNameFr} a été appliqué automatiquement au ticket ${result.sale.number}.`,
        targetUrl: `/enterprise-links?link=${effect.identityLinkId}&view=active`,
        idempotencyKey: `relationship-benefit-auto-retail:${result.sale.id}:${effect.benefitId}`,
      }),
    ),
  );

  return {
    result,
    guarded: { ...guarded, input: finalInput, decisions: finalDecisions },
    accounting,
    loyalty,
    promotionCount,
    relationshipBenefits,
  };
}
