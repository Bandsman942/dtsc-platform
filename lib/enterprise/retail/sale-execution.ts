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
import { prisma } from "@/lib/prisma";

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

  const persistedRelationshipUsages = result.idempotent
    ? await prisma.enterpriseRelationshipBenefitUsage.findMany({
        where: {
          organizationId: args.organizationId,
          executionMode: "AUTO_RETAIL",
          effectModuleCode: "RETAIL_POS",
          effectEntityType: "EnterpriseRetailSale",
          effectEntityId: result.sale.id,
          status: "CONSUMED",
        },
        include: {
          benefit: {
            select: { code: true, nameFr: true, nameEn: true },
          },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const promotionCount = result.idempotent
    ? await prisma.enterpriseRetailPromotionRedemption.count({
        where: { organizationId: args.organizationId, saleId: result.sale.id },
      })
    : new Set(finalDecisions.flatMap((decision) => decision.promotionIds)).size;

  const relationshipBenefits = result.idempotent
    ? persistedRelationshipUsages.map((usage) => ({
        benefitId: usage.benefitId,
        benefitCode: usage.benefit.code,
        nameFr: usage.benefit.nameFr,
        nameEn: usage.benefit.nameEn,
        discountAmount: usage.effectAmount?.toFixed() || "0",
        currencyCode: usage.effectCurrencyCode || result.sale.currencyCode,
      }))
    : serializeRetailRelationshipBenefitEffects(relationshipResolution.effects);

  const notificationEffects = result.idempotent
    ? persistedRelationshipUsages.map((usage) => ({
        benefitId: usage.benefitId,
        benefitNameFr: usage.benefit.nameFr,
        benefitNameEn: usage.benefit.nameEn,
        identityLinkId: usage.identityLinkId,
        userId: usage.userId,
      }))
    : relationshipResolution.effects.map((effect) => ({
        benefitId: effect.benefitId,
        benefitNameFr: effect.benefitNameFr,
        benefitNameEn: effect.benefitNameEn,
        identityLinkId: effect.identityLinkId,
        userId: effect.userId,
      }));

  const benefitUserIds = [...new Set(notificationEffects.map((effect) => effect.userId))];
  const benefitUsers = benefitUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: benefitUserIds } },
        select: { id: true, locale: true },
      })
    : [];
  const localeByUserId = new Map(
    benefitUsers.map((user) => [user.id, user.locale === "en" ? "en" : "fr"]),
  );
  await Promise.allSettled(
    notificationEffects.map((effect) => {
      const english = localeByUserId.get(effect.userId) === "en";
      return notifyUser({
        userId: effect.userId,
        organizationId: args.organizationId,
        type: "ENTERPRISE_RELATIONSHIP",
        title: english ? "Benefit applied" : "Avantage appliqué",
        body: english
          ? `${effect.benefitNameEn} was automatically applied to receipt ${result.sale.number}.`
          : `${effect.benefitNameFr} a été appliqué automatiquement au ticket ${result.sale.number}.`,
        targetUrl: `/enterprise-links?link=${effect.identityLinkId}&view=active`,
        idempotencyKey: `relationship-benefit-auto-retail:${result.sale.id}:${effect.benefitId}`,
      });
    }),
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
