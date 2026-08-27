import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import {
  getFinanceConfiguration,
  resolveExchangeRateDetails,
  snapshotExchangeRate,
} from "@/lib/enterprise/accounting/currency";
import { financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { createJournalEntryDraft, postJournalEntry } from "@/lib/enterprise/accounting/journal-service";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import type { accountTransferSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type TransferInput = z.infer<typeof accountTransferSchema>;

async function resolveTransfer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: TransferInput,
) {
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: {
      organizationId,
      id: { in: [input.sourceFinancialAccountId, input.targetFinancialAccountId] },
      status: "ACTIVE",
      archivedAt: null,
    },
  });
  if (accounts.length !== 2) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);
  const source = accounts.find((account) => account.id === input.sourceFinancialAccountId);
  const target = accounts.find((account) => account.id === input.targetFinancialAccountId);
  if (!source || !target || source.id === target.id) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);

  const sourceAmount = money(new Prisma.Decimal(input.sourceAmount));
  if (!sourceAmount.isPositive()) throw new EnterpriseAccountingError("FINANCE_AMOUNT_MUST_BE_POSITIVE", 400);
  if (source.operationalBalance.lessThan(sourceAmount)) {
    throw new EnterpriseAccountingError("TRANSFER_INSUFFICIENT_OPERATIONAL_BALANCE", 409);
  }

  const rate = await resolveExchangeRateDetails(tx, {
    organizationId,
    sourceCurrencyCode: source.currencyCode,
    targetCurrencyCode: target.currencyCode,
    rateDate: input.transferDate,
  });
  const targetAmount = money(sourceAmount.times(rate.rate));

  return { source, target, sourceAmount, targetAmount, rate };
}

function preferredTransferJournalType(accountType: string) {
  if (accountType === "CASH") return "CASH";
  if (accountType === "MOBILE_MONEY") return "MOBILE_MONEY";
  if (accountType === "CLEARING") return "GENERAL";
  return "BANK";
}

async function resolveTransferPostingContext(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    sourceAccountType: string;
    sourceLedgerAccountId: string;
    targetLedgerAccountId: string;
    transferDate: Date;
  },
) {
  const preferredJournalType = preferredTransferJournalType(input.sourceAccountType);
  const journal = await tx.enterpriseJournal.findFirst({
    where: { organizationId, journalType: preferredJournalType, isActive: true },
    select: { id: true },
  }) || (preferredJournalType === "GENERAL"
    ? await tx.enterpriseJournal.findFirst({
        where: { organizationId, journalType: "BANK", isActive: true },
        select: { id: true },
      })
    : null);
  if (!journal) throw new EnterpriseAccountingError("TRANSFER_JOURNAL_REQUIRED", 409);

  const ledgerAccountIds = [...new Set([input.sourceLedgerAccountId, input.targetLedgerAccountId])];
  const postableLedgerCount = await tx.enterpriseLedgerAccount.count({
    where: {
      organizationId,
      id: { in: ledgerAccountIds },
      isActive: true,
      archivedAt: null,
    },
  });
  if (postableLedgerCount !== ledgerAccountIds.length) {
    throw new EnterpriseAccountingError("TREASURY_LEDGER_ACCOUNT_INVALID", 409);
  }

  const period = await getPostingPeriod(tx, organizationId, input.transferDate, { allowSoftClosed: true });
  return { journalId: journal.id, fiscalPeriodId: period.id };
}

export async function previewTreasuryTransfer(organizationId: string, input: TransferInput) {
  return prisma.$transaction(async (tx) => {
    const resolved = await resolveTransfer(tx, organizationId, input);
    return {
      sourceAccount: {
        id: resolved.source.id,
        code: resolved.source.code,
        name: resolved.source.name,
        accountType: resolved.source.accountType,
        currencyCode: resolved.source.currencyCode,
        operationalBalance: resolved.source.operationalBalance.toFixed(),
      },
      targetAccount: {
        id: resolved.target.id,
        code: resolved.target.code,
        name: resolved.target.name,
        accountType: resolved.target.accountType,
        currencyCode: resolved.target.currencyCode,
        operationalBalance: resolved.target.operationalBalance.toFixed(),
      },
      sourceAmount: resolved.sourceAmount.toFixed(),
      targetAmount: resolved.targetAmount.toFixed(),
      transferDate: input.transferDate.toISOString(),
      exchangeRate: {
        value: resolved.rate.rate.toFixed(),
        rateId: resolved.rate.rateId,
        rateDate: resolved.rate.rateDate.toISOString(),
        source: resolved.rate.source,
        direction: resolved.rate.direction,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createTreasuryTransfer(
  organizationId: string,
  actorUserId: string,
  input: TransferInput,
) {
  return prisma.$transaction(async (tx) => {
    const resolved = await resolveTransfer(tx, organizationId, input);
    const transfer = await tx.enterpriseAccountTransfer.create({
      data: {
        organizationId,
        number: financeReference("TRF"),
        sourceFinancialAccountId: resolved.source.id,
        targetFinancialAccountId: resolved.target.id,
        sourceCurrencyCode: resolved.source.currencyCode,
        targetCurrencyCode: resolved.target.currencyCode,
        sourceAmount: resolved.sourceAmount,
        targetAmount: resolved.targetAmount,
        exchangeRate: resolved.rate.rate,
        transferDate: input.transferDate,
        initiatedByUserId: actorUserId,
      },
    });
    await snapshotExchangeRate(tx, {
      organizationId,
      sourceEntityType: "EnterpriseAccountTransfer",
      sourceEntityId: transfer.id,
      sourceCurrencyCode: resolved.source.currencyCode,
      targetCurrencyCode: resolved.target.currencyCode,
      rateDate: resolved.rate.rateDate,
      rate: resolved.rate.rate,
      source: resolved.rate.direction === "IDENTITY"
        ? "IDENTITY"
        : `ENTERPRISE_RATE:${resolved.rate.direction}:${resolved.rate.rateId || "NONE"}:${resolved.rate.source}`,
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountTransfer",
      entityId: transfer.id,
      eventType: "ACCOUNT_TRANSFER_CREATED",
      summary: `Transfer ${transfer.number} created`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: {
        sourceAccountId: resolved.source.id,
        targetAccountId: resolved.target.id,
        sourceCurrency: resolved.source.currencyCode,
        targetCurrency: resolved.target.currencyCode,
        exchangeRate: resolved.rate.rate.toFixed(),
        exchangeRateDate: resolved.rate.rateDate.toISOString(),
      },
    });
    return transfer;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmTreasuryTransfer(
  organizationId: string,
  transferId: string,
  actorUserId: string,
  revision: number,
) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountTransfer" WHERE id = ${transferId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transfer = await tx.enterpriseAccountTransfer.findFirst({ where: { id: transferId, organizationId } });
    if (!transfer) throw new EnterpriseAccountingError("TRANSFER_NOT_FOUND", 404);
    if (transfer.status === "CONFIRMED") {
      const accounts = await tx.enterpriseFinancialAccount.findMany({
        where: { organizationId, id: { in: [transfer.sourceFinancialAccountId, transfer.targetFinancialAccountId] } },
      });
      const source = accounts.find((account) => account.id === transfer.sourceFinancialAccountId);
      const target = accounts.find((account) => account.id === transfer.targetFinancialAccountId);
      if (!source || !target) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);
      const configuration = await getFinanceConfiguration(tx, organizationId);
      const functionalResolution = await resolveExchangeRateDetails(tx, {
        organizationId,
        sourceCurrencyCode: transfer.sourceCurrencyCode,
        targetCurrencyCode: configuration.functionalCurrencyCode,
        rateDate: transfer.transferDate,
      });
      const postingContext = await resolveTransferPostingContext(tx, organizationId, {
        sourceAccountType: source.accountType,
        sourceLedgerAccountId: source.ledgerAccountId,
        targetLedgerAccountId: target.ledgerAccountId,
        transferDate: transfer.transferDate,
      });
      return {
        transfer,
        source,
        target,
        functionalCurrencyCode: configuration.functionalCurrencyCode,
        functionalAmount: money(transfer.sourceAmount.times(functionalResolution.rate)),
        ...postingContext,
      };
    }
    if (transfer.status !== "APPROVED" || transfer.revision !== revision) throw new EnterpriseAccountingError("TRANSFER_NOT_APPROVED", 409);

    const [source, target, configuration] = await Promise.all([
      tx.enterpriseFinancialAccount.findFirst({ where: { id: transfer.sourceFinancialAccountId, organizationId, status: "ACTIVE", archivedAt: null } }),
      tx.enterpriseFinancialAccount.findFirst({ where: { id: transfer.targetFinancialAccountId, organizationId, status: "ACTIVE", archivedAt: null } }),
      getFinanceConfiguration(tx, organizationId),
    ]);
    if (!source || !target) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);
    if (source.operationalBalance.lessThan(transfer.sourceAmount)) throw new EnterpriseAccountingError("TRANSFER_INSUFFICIENT_OPERATIONAL_BALANCE", 409);

    const functionalResolution = await resolveExchangeRateDetails(tx, {
      organizationId,
      sourceCurrencyCode: source.currencyCode,
      targetCurrencyCode: configuration.functionalCurrencyCode,
      rateDate: transfer.transferDate,
    });
    const functionalAmount = money(transfer.sourceAmount.times(functionalResolution.rate));
    const postingContext = await resolveTransferPostingContext(tx, organizationId, {
      sourceAccountType: source.accountType,
      sourceLedgerAccountId: source.ledgerAccountId,
      targetLedgerAccountId: target.ledgerAccountId,
      transferDate: transfer.transferDate,
    });

    await snapshotExchangeRate(tx, {
      organizationId,
      sourceEntityType: "EnterpriseAccountTransfer",
      sourceEntityId: transfer.id,
      sourceCurrencyCode: source.currencyCode,
      targetCurrencyCode: configuration.functionalCurrencyCode,
      rateDate: functionalResolution.rateDate,
      rate: functionalResolution.rate,
      source: functionalResolution.direction === "IDENTITY"
        ? "FUNCTIONAL"
        : `ENTERPRISE_RATE:${functionalResolution.direction}:${functionalResolution.rateId || "NONE"}:${functionalResolution.source}`,
    });

    await tx.enterpriseFinancialAccount.update({
      where: { id: source.id },
      data: { operationalBalance: { decrement: transfer.sourceAmount }, revision: { increment: 1 } },
    });
    await tx.enterpriseFinancialAccount.update({
      where: { id: target.id },
      data: { operationalBalance: { increment: transfer.targetAmount }, revision: { increment: 1 } },
    });
    await tx.enterpriseTreasuryTransaction.createMany({ data: [
      {
        organizationId,
        financialAccountId: source.id,
        transferId: transfer.id,
        transactionType: "TRANSFER",
        direction: "OUTBOUND",
        currencyCode: source.currencyCode,
        amount: transfer.sourceAmount,
        transactionDate: transfer.transferDate,
        reference: transfer.number,
        createdByUserId: actorUserId,
      },
      {
        organizationId,
        financialAccountId: target.id,
        transferId: transfer.id,
        transactionType: "TRANSFER",
        direction: "INBOUND",
        currencyCode: target.currencyCode,
        amount: transfer.targetAmount,
        transactionDate: transfer.transferDate,
        reference: transfer.number,
        createdByUserId: actorUserId,
      },
    ] });
    const confirmed = await tx.enterpriseAccountTransfer.update({
      where: { id: transfer.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountTransfer",
      entityId: transfer.id,
      eventType: "ACCOUNT_TRANSFER_CONFIRMED",
      summary: `Transfer ${transfer.number} confirmed`,
      actorUserId,
      fromStatus: transfer.status,
      toStatus: "CONFIRMED",
      metadataJson: {
        sourceAccountId: source.id,
        targetAccountId: target.id,
        sourceCurrency: source.currencyCode,
        targetCurrency: target.currencyCode,
        sourceAmount: transfer.sourceAmount.toFixed(),
        targetAmount: transfer.targetAmount.toFixed(),
        exchangeRate: transfer.exchangeRate?.toFixed() || "1",
      },
    });
    return {
      transfer: confirmed,
      source,
      target,
      functionalCurrencyCode: configuration.functionalCurrencyCode,
      functionalAmount,
      ...postingContext,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const idempotency = `${organizationId}:ACCOUNT_TRANSFER:${result.transfer.id}:1`;
  let entry = await prisma.enterpriseJournalEntry.findFirst({ where: { organizationId, idempotencyKey: idempotency } });
  if (!entry) {
    const functionalAmount = result.functionalAmount.toFixed();
    entry = await createJournalEntryDraft(organizationId, actorUserId, {
      journalId: result.journalId,
      fiscalPeriodId: result.fiscalPeriodId,
      accountingDate: result.transfer.transferDate,
      documentDate: result.transfer.transferDate,
      reference: result.transfer.number,
      description: `Internal transfer ${result.transfer.number}`,
      sourceModule: "FINANCE_TREASURY",
      sourceEntityType: "EnterpriseAccountTransfer",
      sourceEntityId: result.transfer.id,
      postingVersion: 1,
      idempotencyKey: idempotency,
      lines: [
        {
          ledgerAccountId: result.target.ledgerAccountId,
          description: `Transfer in ${result.transfer.number}`,
          debit: functionalAmount,
          credit: "0",
          transactionCurrencyCode: result.functionalCurrencyCode,
          transactionAmount: functionalAmount,
        },
        {
          ledgerAccountId: result.source.ledgerAccountId,
          description: `Transfer out ${result.transfer.number}`,
          debit: "0",
          credit: functionalAmount,
          transactionCurrencyCode: result.functionalCurrencyCode,
          transactionAmount: functionalAmount,
        },
      ],
    });
  }
  if (entry.status === "APPROVED") await postJournalEntry(organizationId, entry.id, actorUserId, entry.revision);
  return result.transfer;
}
