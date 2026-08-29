import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { prisma } from "@/lib/prisma";

function stableNumericSuffix(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash % 100_000_000).padStart(8, "0");
}

async function ensureWalletSubledgerTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    actorUserId: string;
    financialAccountId: string;
    providerCode: string;
    providerLabel: string;
    currencyCode: string;
    accountingDate: Date;
  },
) {
  const financialAccount = await tx.enterpriseFinancialAccount.findFirst({
    where: {
      id: input.financialAccountId,
      organizationId: input.organizationId,
      accountType: "MOBILE_MONEY",
      currencyCode: input.currencyCode,
      status: "ACTIVE",
      archivedAt: null,
    },
  });
  if (!financialAccount) {
    throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FINANCIAL_ACCOUNTS_INVALID", 409, {
      financialAccountId: input.financialAccountId,
      currencyCode: input.currencyCode,
    });
  }

  // The semantic mapping owns the regulatory account. Retail never knows or
  // hardcodes an OHADA account number; the current chart decides the parent.
  const semanticParent = await resolveSemanticPostingAccount(tx, {
    organizationId: input.organizationId,
    mappingKey: "MOBILE_MONEY",
    accountingDate: input.accountingDate,
  });
  const currentLedger = await tx.enterpriseLedgerAccount.findFirst({
    where: {
      id: financialAccount.ledgerAccountId,
      organizationId: input.organizationId,
      isActive: true,
      archivedAt: null,
    },
  });
  if (!currentLedger) throw new EnterpriseAccountingError("POSTING_DIRECT_ACCOUNT_INVALID", 409);

  // Respect an explicit/custom account selected by the company. If it is already
  // a child of the semantic Mobile Money parent, the granular contract is met.
  if (currentLedger.id !== semanticParent.id) return currentLedger;

  const nameFr = `Wallet ${input.providerLabel} ${input.currencyCode}`;
  const nameEn = `${input.providerLabel} ${input.currencyCode} wallet`;
  const existingChild = await tx.enterpriseLedgerAccount.findFirst({
    where: {
      organizationId: input.organizationId,
      chartId: semanticParent.chartId,
      parentId: semanticParent.id,
      accountSubtype: "MOBILE_MONEY",
      currencyCode: input.currencyCode,
      nameFr,
      isActive: true,
      archivedAt: null,
    },
  });
  if (existingChild) {
    await tx.enterpriseFinancialAccount.update({
      where: { id: financialAccount.id },
      data: { ledgerAccountId: existingChild.id, revision: { increment: 1 } },
    });
    return existingChild;
  }

  // Once direct postings already exist on the shared parent, silently moving a
  // wallet would break subledger continuity. Keep the historical mapping intact;
  // a controlled reclassification can be introduced separately if ever needed.
  const postedUsage = await tx.enterpriseJournalLine.count({
    where: { organizationId: input.organizationId, ledgerAccountId: semanticParent.id },
  });
  if (postedUsage > 0) return semanticParent;

  const code = `${semanticParent.code}${stableNumericSuffix(`${input.providerCode}:${input.currencyCode}`)}`;
  const collision = await tx.enterpriseLedgerAccount.findFirst({
    where: { organizationId: input.organizationId, code },
  });
  if (collision) {
    throw new EnterpriseAccountingError("MOBILE_MONEY_SUBLEDGER_CODE_CONFLICT", 409, {
      providerCode: input.providerCode,
      currencyCode: input.currencyCode,
    });
  }

  const child = await tx.enterpriseLedgerAccount.create({
    data: {
      organizationId: input.organizationId,
      chartId: semanticParent.chartId,
      accountGroupId: semanticParent.accountGroupId,
      code,
      nameFr,
      nameEn,
      accountType: semanticParent.accountType,
      accountSubtype: semanticParent.accountSubtype,
      parentId: semanticParent.id,
      level: semanticParent.level + 1,
      currencyCode: input.currencyCode,
      isControlAccount: false,
      isSystemAccount: false,
      allowDirectPosting: true,
    },
  });
  await tx.enterpriseFinancialAccount.update({
    where: { id: financialAccount.id },
    data: { ledgerAccountId: child.id, revision: { increment: 1 } },
  });
  await publishFinanceEvent(tx, {
    organizationId: input.organizationId,
    entityType: "EnterpriseLedgerAccount",
    entityId: child.id,
    eventType: "MOBILE_MONEY_SUBLEDGER_PROVISIONED",
    summary: `Mobile Money wallet ledger ${child.code} provisioned`,
    actorUserId: input.actorUserId,
    toStatus: "ACTIVE",
    metadataJson: {
      financialAccountId: financialAccount.id,
      providerCode: input.providerCode,
      currencyCode: input.currencyCode,
      semanticMappingKey: "MOBILE_MONEY",
      parentLedgerAccountId: semanticParent.id,
    },
  });
  return child;
}

export async function ensureMobileMoneyTransactionLedgerMapping(
  organizationId: string,
  actorUserId: string,
  transactionId: string,
) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.enterpriseMobileMoneyTransaction.findFirst({
      where: { id: transactionId, organizationId },
      select: {
        id: true,
        providerCode: true,
        currencyCode: true,
        floatAccountId: true,
        occurredAt: true,
      },
    });
    if (!transaction) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_NOT_POSTABLE", 409);
    const provider = await tx.enterpriseRetailProvider.findFirst({
      where: { organizationId, providerCode: transaction.providerCode, isActive: true },
      select: { providerCode: true, label: true },
    });
    if (!provider) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FINANCIAL_ACCOUNTS_INVALID", 409);

    const ledger = await ensureWalletSubledgerTx(tx, {
      organizationId,
      actorUserId,
      financialAccountId: transaction.floatAccountId,
      providerCode: provider.providerCode,
      providerLabel: provider.label,
      currencyCode: transaction.currencyCode,
      accountingDate: transaction.occurredAt,
    });
    return { ledgerAccountId: ledger.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function ensureMobileMoneyFxLedgerMappings(
  organizationId: string,
  actorUserId: string,
  transferId: string,
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.enterpriseMobileMoneyFxTransfer.findFirst({
      where: { id: transferId, organizationId },
    });
    if (!transfer) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FX_NOT_POSTABLE", 409);
    const provider = await tx.enterpriseRetailProvider.findFirst({
      where: { id: transfer.providerId, organizationId, isActive: true },
      select: { providerCode: true, label: true },
    });
    if (!provider) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FX_ACCOUNTS_INVALID", 409);

    const source = await ensureWalletSubledgerTx(tx, {
      organizationId,
      actorUserId,
      financialAccountId: transfer.sourceFloatAccountId,
      providerCode: provider.providerCode,
      providerLabel: provider.label,
      currencyCode: transfer.sourceCurrencyCode,
      accountingDate: transfer.occurredAt,
    });
    const target = await ensureWalletSubledgerTx(tx, {
      organizationId,
      actorUserId,
      financialAccountId: transfer.targetFloatAccountId,
      providerCode: provider.providerCode,
      providerLabel: provider.label,
      currencyCode: transfer.targetCurrencyCode,
      accountingDate: transfer.occurredAt,
    });
    return { sourceLedgerAccountId: source.id, targetLedgerAccountId: target.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
