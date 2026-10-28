import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder } from "@/lib/enterprise/accounting/posting-types";
import { relationalStoreCreditScope } from "@/lib/enterprise/retail/relationship-store-credit";

// Only verified canonical Stored Value entries are permitted to generate
// liabilities. A request, approval without an EARN, or UI state is never
// accepted as a financial event.
function field(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadata(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

async function buildManualCreditPosting(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityType: string; sourceEntityId: string },
  reversal: boolean,
) {
  if (input.sourceEntityType === "EnterpriseRetailStoredValueEntry") {
    return buildOmnichannelCashbackPosting(tx, input, reversal);
  }
  if (input.sourceEntityType !== "EnterpriseRelationshipBenefitUsage") {
    throw new EnterpriseAccountingError("RELATIONSHIP_CREDIT_POSTING_SOURCE_INVALID", 409);
  }
  const usage = await tx.enterpriseRelationshipBenefitUsage.findFirst({
    where: {
      id: input.sourceEntityId,
      organizationId: input.organizationId,
      executionMode: "MANUAL_RETAIL_CREDIT",
      status: reversal ? "CANCELLED" : "CONSUMED",
    },
    include: { benefit: { select: { code: true, benefitType: true, currencyCode: true } } },
  });
  if (!usage || usage.benefit.benefitType !== "CREDIT" || !usage.decidedByUserId ||
      !usage.executedAt || !usage.effectAmount?.gt(0) ||
      usage.effectModuleCode !== "RETAIL_POS" ||
      (reversal && !usage.cancelledAt) ||
      !usage.effectCurrencyCode || usage.benefit.currencyCode !== usage.effectCurrencyCode) {
    throw new EnterpriseAccountingError("RELATIONSHIP_CREDIT_POSTING_SOURCE_INVALID", 409);
  }
  const context = metadata(usage.requestContextJson);
  const details = metadata(usage.effectMetadataJson);
  const businessPartyId = field(context.businessPartyId);
  const accountId = field(details.storedValueAccountId);
  const entryId = reversal ? field(details.reversalEntryId) : field(usage.effectEntityId);
  const expectedKey = reversal
    ? `credit:relationship:reversal:${usage.id}`
    : `credit:relationship:usage:${usage.id}`;
  if (!businessPartyId || !accountId || !entryId || usage.effectIdempotencyKey !== `credit:relationship:usage:${usage.id}`) {
    throw new EnterpriseAccountingError("RELATIONSHIP_CREDIT_POSTING_PROOF_MISSING", 409);
  }
  const entry = await tx.enterpriseRetailStoredValueEntry.findFirst({
    where: {
      id: entryId, organizationId: input.organizationId, accountId,
      idempotencyKey: expectedKey, entryType: reversal ? "REVERSAL" : "EARN",
    },
  });
  const account = await tx.enterpriseRetailStoredValueAccount.findFirst({
    where: {
      id: accountId, organizationId: input.organizationId,
      accountType: "STORE_CREDIT", customerBusinessPartyId: businessPartyId,
      currencyCode: usage.effectCurrencyCode,
      benefitScopeKey: relationalStoreCreditScope(businessPartyId, usage.effectCurrencyCode),
    },
  });
  if (!entry || !account || !entry.amount.equals(reversal ? usage.effectAmount.negated() : usage.effectAmount)) {
    throw new EnterpriseAccountingError("RELATIONSHIP_CREDIT_POSTING_ENTRY_MISMATCH", 409);
  }
  const amount = usage.effectAmount;
  const description = reversal ? "Reprise de crédit relationnel" : "Attribution de crédit relationnel";
  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT",
    accountingDate: reversal ? usage.cancelledAt! : usage.executedAt,
    documentDate: reversal ? usage.cancelledAt! : usage.executedAt,
    reference: `CREDIT-${usage.id.slice(-10)}`,
    description: `${description} · ${usage.benefit.code}`,
    sourceModule: "RETAIL_POS",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: usage.id,
    currencyCode: usage.effectCurrencyCode,
    lines: [
      {
        accountMappingKey: reversal ? "CUSTOMER_ADVANCES" : "OPERATING_EXPENSE",
        description,
        debit: amount,
        transactionCurrencyCode: usage.effectCurrencyCode,
        transactionAmount: amount,
        businessPartyId,
      },
      {
        accountMappingKey: reversal ? "OPERATING_EXPENSE" : "CUSTOMER_ADVANCES",
        description,
        credit: amount,
        transactionCurrencyCode: usage.effectCurrencyCode,
        transactionAmount: amount,
        businessPartyId,
      },
    ],
  };
}

export const buildRetailRelationshipCreditGrantPosting: PostingBuilder =
  (tx, input) => buildManualCreditPosting(tx, input, false);

export const buildRetailRelationshipCreditReversalPosting: PostingBuilder =
  (tx, input) => buildManualCreditPosting(tx, input, true);

/**
 * The existing relationship credit posting event is also the canonical
 * liability/expense authority for a verified omnichannel CASHBACK entry.
 * Each EARN/REVERSAL entry is a unique posting source, so partial returns
 * cannot reuse a journal idempotency key or rewrite POSTED history.
 */
async function buildOmnichannelCashbackPosting(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityType: string; sourceEntityId: string },
  reversal: boolean,
) {
  const entry = await tx.enterpriseRetailStoredValueEntry.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId },
  });
  const match = entry?.idempotencyKey.match(reversal
    ? /^omni-cashback:return:([^:]+):([^:]+):([^:]+)$/
    : /^omni-cashback:order:([^:]+):benefit:([^:]+)$/);
  if (!entry || !match || entry.entryType !== (reversal ? "REVERSAL" : "EARN") ||
      (reversal ? !entry.amount.lt(0) : !entry.amount.gt(0))) {
    throw new EnterpriseAccountingError("RELATIONSHIP_OMNI_CASHBACK_POSTING_INVALID", 409);
  }
  const [, orderId, benefitId] = match;
  const usage = await tx.enterpriseRelationshipBenefitUsage.findFirst({
    where: {
      organizationId: input.organizationId, benefitId,
      executionMode: "AUTO_RETAIL_OMNICHANNEL_CASHBACK",
      effectEntityType: "EnterpriseSalesOrder", effectEntityId: orderId,
      status: { in: ["CONSUMED", "CANCELLED"] },
    },
    include: { benefit: { select: { benefitType: true, code: true } } },
  });
  const details = metadata(usage?.effectMetadataJson || null);
  const businessPartyId = field(details.customerBusinessPartyId);
  const accountId = field(details.storedValueAccountId);
  const earnedId = field(details.storedValueEntryId);
  const account = await tx.enterpriseRetailStoredValueAccount.findFirst({
    where: { id: entry.accountId, organizationId: input.organizationId, accountType: "STORE_CREDIT" },
    select: { customerBusinessPartyId: true, currencyCode: true, benefitScopeKey: true, archivedAt: true },
  });
  if (!usage || !usage.effectAmount?.gt(0) || usage.benefit.benefitType !== "CASHBACK" ||
      !businessPartyId || !accountId || !earnedId || !account || account.archivedAt ||
      entry.accountId !== accountId || account.customerBusinessPartyId !== businessPartyId ||
      account.currencyCode !== usage.effectCurrencyCode ||
      account.benefitScopeKey !== relationalStoreCreditScope(businessPartyId, account.currencyCode)) {
    throw new EnterpriseAccountingError("RELATIONSHIP_OMNI_CASHBACK_POSTING_PROOF_MISSING", 409);
  }
  if (reversal) {
    const returnId = match[3];
    const actualReturn = await tx.enterpriseRetailOmnichannelReturn.findFirst({
      where: {
        id: returnId, organizationId: input.organizationId,
        salesOrderId: orderId, status: "COMPLETED",
      }, select: { id: true, currencyCode: true, refundPaymentId: true },
    });
    const paidRefund = actualReturn?.refundPaymentId
      ? await tx.enterprisePayment.findFirst({
          where: {
            organizationId: input.organizationId, id: actualReturn.refundPaymentId,
            status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "OUTBOUND",
            paymentType: "REFUND", businessPartyId, currencyCode: account.currencyCode,
          }, select: { id: true },
        })
      : null;
    if (!actualReturn || actualReturn.currencyCode !== account.currencyCode ||
        !paidRefund || entry.returnId !== returnId || entry.amount.abs().gt(usage.effectAmount)) {
      throw new EnterpriseAccountingError("RELATIONSHIP_OMNI_CASHBACK_REFUND_PROOF_INVALID", 409);
    }
  } else if (earnedId !== entry.id || !entry.amount.equals(usage.effectAmount)) {
    throw new EnterpriseAccountingError("RELATIONSHIP_OMNI_CASHBACK_EARN_PROOF_INVALID", 409);
  }
  const amount = entry.amount.abs();
  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT" as const,
    accountingDate: entry.createdAt,
    documentDate: entry.createdAt,
    reference: `OMNI-CASHBACK-${entry.id.slice(-10)}`,
    description: reversal ? "Réversion cashback omnicanal" : "Attribution cashback omnicanal",
    sourceModule: "RETAIL_POS",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: entry.id,
    currencyCode: account.currencyCode,
    lines: [
      {
        accountMappingKey: reversal ? "CUSTOMER_ADVANCES" : "OPERATING_EXPENSE",
        description: reversal ? "Reprise dette cashback" : "Charge cashback omnicanal",
        debit: amount,
        transactionCurrencyCode: account.currencyCode,
        transactionAmount: amount,
        businessPartyId,
      },
      {
        accountMappingKey: reversal ? "OPERATING_EXPENSE" : "CUSTOMER_ADVANCES",
        description: reversal ? "Reprise charge cashback" : "Dette avoir cashback",
        credit: amount,
        transactionCurrencyCode: account.currencyCode,
        transactionAmount: amount,
        businessPartyId,
      },
    ],
  };
}
