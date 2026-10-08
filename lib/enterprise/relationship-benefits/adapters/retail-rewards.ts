import { Prisma } from "@prisma/client";
import {
  persistRelationshipBenefitApplicationsTx,
  type RelationshipBenefitApplicationDraft,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import type { RetailRelationshipRewardPlan } from "@/lib/enterprise/relationship-benefits/adapters/retail-pricing";
import {
  creditRetailRelationshipBenefitStoredValueTx,
  earnRetailRelationshipBenefitPointsTx,
} from "@/lib/enterprise/retail/customer-payments";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

export async function applyRetailRelationshipBenefitRewardsTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    actorUserId: string;
    sale: {
      id: string;
      customerBusinessPartyId: string | null;
      currencyCode: string;
      grandTotal: Prisma.Decimal;
    };
    rewards: RetailRelationshipRewardPlan[];
  },
) {
  if (!args.rewards.length) {
    return {
      applicationIds: [] as string[],
      loyaltyEntryIds: [] as string[],
      storedValueEntryIds: [] as string[],
    };
  }
  if (!args.sale.customerBusinessPartyId) {
    throw new EnterpriseRetailError("RETAIL_RELATIONSHIP_BENEFIT_CUSTOMER_REQUIRED", 409);
  }

  const drafts: RelationshipBenefitApplicationDraft[] = args.rewards.map((reward) => ({
    benefitId: reward.benefitId,
    benefitRevision: reward.benefitRevision,
    identityLinkId: reward.identityLinkId,
    userId: reward.userId,
    applicationType: reward.benefitType,
    baseAmount: reward.baseAmount,
    appliedAmount:
      reward.benefitType === "LOYALTY"
        ? reward.valueDecimal
        : reward.expectedAmount || 0,
    currencyCode: reward.currencyCode,
    context: {
      relationType: reward.relationType,
      stackable: reward.stackable,
      rewardUnit: reward.benefitType === "LOYALTY" ? "POINTS" : "MONEY",
      loyaltyProgramId: reward.loyaltyProgramId,
      storedValueAccountType: reward.storedValueAccountType,
    },
  }));

  const applications = await persistRelationshipBenefitApplicationsTx(tx, {
    organizationId: args.organizationId,
    actorUserId: args.actorUserId,
    sourceModuleCode: "RETAIL_POS",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: args.sale.id,
    applications: drafts,
  });
  const applicationByKey = new Map(
    applications.map((application) => [
      `${application.benefitId}:${application.identityLinkId}`,
      application,
    ]),
  );

  const loyaltyEntryIds: string[] = [];
  const storedValueEntryIds: string[] = [];
  for (const reward of args.rewards) {
    const application = applicationByKey.get(
      `${reward.benefitId}:${reward.identityLinkId}`,
    );
    if (!application) {
      throw new EnterpriseRetailError("RETAIL_RELATIONSHIP_BENEFIT_APPLICATION_MISSING", 409);
    }

    if (reward.benefitType === "LOYALTY") {
      if (!reward.loyaltyProgramId || reward.valueDecimal <= 0) {
        throw new EnterpriseRetailError("RETAIL_RELATIONSHIP_BENEFIT_LOYALTY_INVALID", 409);
      }
      const result = await earnRetailRelationshipBenefitPointsTx(
        tx,
        args.organizationId,
        args.actorUserId,
        {
          programId: reward.loyaltyProgramId,
          customerBusinessPartyId: args.sale.customerBusinessPartyId,
          points: reward.valueDecimal,
          monetaryAmount: Number(args.sale.grandTotal),
          currencyCode: args.sale.currencyCode,
          saleId: args.sale.id,
          benefitId: reward.benefitId,
          identityLinkId: reward.identityLinkId,
        },
      );
      loyaltyEntryIds.push(result.entry.id);
      await tx.enterpriseRelationshipBenefitApplication.update({
        where: { id: application.id },
        data: {
          contextJson: {
            ...(application.contextJson && typeof application.contextJson === "object" && !Array.isArray(application.contextJson)
              ? application.contextJson as Record<string, unknown>
              : {}),
            retailLoyaltyProgramId: reward.loyaltyProgramId,
            retailLoyaltyAccountId: result.account.id,
            retailLoyaltyEntryId: result.entry.id,
          } as Prisma.InputJsonValue,
        },
      });
      continue;
    }

    if (!reward.expectedAmount || reward.expectedAmount <= 0 || !reward.storedValueAccountType) {
      throw new EnterpriseRetailError("RETAIL_RELATIONSHIP_BENEFIT_REWARD_INVALID", 409);
    }
    const result = await creditRetailRelationshipBenefitStoredValueTx(
      tx,
      args.organizationId,
      args.actorUserId,
      {
        customerBusinessPartyId: args.sale.customerBusinessPartyId,
        accountType: reward.storedValueAccountType,
        currencyCode: args.sale.currencyCode,
        amount: reward.expectedAmount,
        saleId: args.sale.id,
        benefitId: reward.benefitId,
        identityLinkId: reward.identityLinkId,
      },
    );
    storedValueEntryIds.push(result.entry.id);
    await tx.enterpriseRelationshipBenefitApplication.update({
      where: { id: application.id },
      data: {
        contextJson: {
          ...(application.contextJson && typeof application.contextJson === "object" && !Array.isArray(application.contextJson)
            ? application.contextJson as Record<string, unknown>
            : {}),
          retailStoredValueAccountId: result.account.id,
          retailStoredValueEntryId: result.entry.id,
          retailStoredValueAccountType: reward.storedValueAccountType,
        } as Prisma.InputJsonValue,
      },
    });
  }

  return {
    applicationIds: applications.map((application) => application.id),
    loyaltyEntryIds,
    storedValueEntryIds,
  };
}
