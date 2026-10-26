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
    accountingDate: reversal ? usage.cancelledAt || new Date() : usage.executedAt,
    documentDate: reversal ? usage.cancelledAt || new Date() : usage.executedAt,
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
