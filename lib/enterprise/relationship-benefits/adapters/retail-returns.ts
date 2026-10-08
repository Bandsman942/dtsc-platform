import { Prisma } from "@prisma/client";
import { reverseRelationshipBenefitApplicationAmountTx } from "@/lib/enterprise/relationship-benefits/enforcement";
import {
  reverseRetailRelationshipBenefitLoyaltyForReturnTx,
  reverseRetailRelationshipBenefitStoredValueForReturnTx,
} from "@/lib/enterprise/retail/customer-payments";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function reverseRetailRelationshipBenefitsForReturnTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    actorUserId: string;
    returnId: string;
    reason: string;
  },
) {
  const retailReturn = await tx.enterpriseRetailReturn.findFirst({
    where: {
      id: args.returnId,
      organizationId: args.organizationId,
    },
    include: {
      lines: true,
      sale: {
        include: { lines: true },
      },
    },
  });
  if (!retailReturn) throw new EnterpriseRetailError("RETAIL_RETURN_NOT_FOUND", 404);

  const applications = await tx.enterpriseRelationshipBenefitApplication.findMany({
    where: {
      organizationId: args.organizationId,
      sourceEntityType: "EnterpriseRetailSale",
      sourceEntityId: retailReturn.saleId,
      status: { in: ["APPLIED", "PARTIALLY_REVERSED"] },
    },
    orderBy: { appliedAt: "asc" },
  });
  const reversedApplicationIds: string[] = [];
  const loyaltyEntryIds: string[] = [];
  const storedValueEntryIds: string[] = [];

  for (const application of applications) {
    const context = jsonObject(application.contextJson);
    const scopedCatalogItemIds = stringArray(context.catalogItemIds);
    const appliesToCatalogItem = (catalogItemId: string) =>
      !scopedCatalogItemIds.length || scopedCatalogItemIds.includes(catalogItemId);

    const originalEligibleTotal = retailReturn.sale.lines
      .filter((line) => appliesToCatalogItem(line.catalogItemId))
      .reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const returnedEligibleTotal = retailReturn.lines
      .filter((line) => appliesToCatalogItem(line.catalogItemId))
      .reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    if (!originalEligibleTotal.isPositive() || !returnedEligibleTotal.isPositive()) continue;

    const ratio = Prisma.Decimal.min(
      1,
      returnedEligibleTotal.div(originalEligibleTotal),
    );
    const requestedReversal = application.appliedAmount
      .times(ratio)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (!requestedReversal.isPositive()) continue;

    const reversal = await reverseRelationshipBenefitApplicationAmountTx(tx, {
      organizationId: args.organizationId,
      applicationId: application.id,
      reversalSourceEntityType: "EnterpriseRetailReturn",
      reversalSourceEntityId: retailReturn.id,
      amount: requestedReversal,
      reason: args.reason,
      actorUserId: args.actorUserId,
    });
    if (!reversal) continue;
    reversedApplicationIds.push(application.id);

    if (application.applicationType === "LOYALTY") {
      const earnedEntryId =
        typeof context.retailLoyaltyEntryId === "string"
          ? context.retailLoyaltyEntryId
          : null;
      if (!earnedEntryId) {
        throw new EnterpriseRetailError(
          "RETAIL_RELATIONSHIP_BENEFIT_LOYALTY_ENTRY_NOT_FOUND",
          409,
          { applicationId: application.id },
        );
      }
      const entry = await reverseRetailRelationshipBenefitLoyaltyForReturnTx(
        tx,
        args.organizationId,
        args.actorUserId,
        {
          earnedEntryId,
          returnId: retailReturn.id,
          points: reversal.reversedAmount,
          reason: args.reason,
        },
      );
      if (entry) loyaltyEntryIds.push(entry.id);
    }

    if (["CASHBACK", "CREDIT"].includes(application.applicationType)) {
      const creditEntryId =
        typeof context.retailStoredValueEntryId === "string"
          ? context.retailStoredValueEntryId
          : null;
      if (!creditEntryId) {
        throw new EnterpriseRetailError(
          "RETAIL_RELATIONSHIP_BENEFIT_CREDIT_ENTRY_NOT_FOUND",
          409,
          { applicationId: application.id },
        );
      }
      const entry = await reverseRetailRelationshipBenefitStoredValueForReturnTx(
        tx,
        args.organizationId,
        args.actorUserId,
        {
          creditEntryId,
          returnId: retailReturn.id,
          amount: reversal.reversedAmount,
          reason: args.reason,
        },
      );
      if (entry) storedValueEntryIds.push(entry.id);
    }
  }

  return {
    reversedApplicationIds,
    loyaltyEntryIds,
    storedValueEntryIds,
  };
}
