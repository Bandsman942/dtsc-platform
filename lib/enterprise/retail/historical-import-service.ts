import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { normalizeRetailPhone } from "@/lib/enterprise/retail/commercial-guardrails";
import {
  historicalImportDraftSchema,
  type HistoricalImportDraftInput,
  type HistoricalImportLineInput,
} from "@/lib/enterprise/retail/historical-import-schemas";
import { finalizeMobileMoneyAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";
import { finalizeTelcoTopupAccounting } from "@/lib/enterprise/retail/telco-accounting";
import { resolveTelcoFloatAccountTx } from "@/lib/enterprise/retail/telco-multicurrency-service";
import { prisma } from "@/lib/prisma";

const ACTIVE_CASH_SESSION_STATUSES = ["OPEN", "CLOSING", "PENDING_VALIDATION"];
const ACCOUNT_TYPES = ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"];

type HistoricalPreviewAccount = {
  financialAccountId: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  openingBalance: string;
  netEffect: string;
  computedClosingBalance: string;
  expectedClosingBalance: string | null;
  expectedClosingMatches: boolean;
  used: boolean;
};

type HistoricalPreviewLine = {
  sequence: number;
  kind: "MOBILE_MONEY" | "TELCO_TOPUP";
  occurredAt: string;
  providerCode: string;
  providerLabel: string;
  currencyCode: string;
  primaryFinancialAccountId: string;
  primaryAccountCode: string;
  floatFinancialAccountId: string;
  floatAccountCode: string;
  primaryEffect: string;
  floatEffect: string;
  marginAmount: string;
  sourceLine: string | null;
};

export type HistoricalImportPreview = {
  sourceLabel: string;
  periodStart: string;
  periodEnd: string;
  lineCount: number;
  mobileMoneyCount: number;
  telcoTopupCount: number;
  accounts: HistoricalPreviewAccount[];
  lines: HistoricalPreviewLine[];
};

type PreparedLine = {
  originalIndex: number;
  line: HistoricalImportLineInput;
  occurredAt: Date;
  providerId: string;
  providerCode: string;
  providerLabel: string;
  currencyCode: string;
  normalizedPhone: string;
  primaryAccountId: string;
  floatAccountId: string;
  primaryEffect: Prisma.Decimal;
  floatEffect: Prisma.Decimal;
  marginAmount: Prisma.Decimal;
};

type HistoricalApplyResult = {
  cashSessionIds: string[];
  mobileMoneyTransactionIds: string[];
  telcoTopupIds: string[];
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function importReference() {
  return `HIST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code: string }).code).slice(0, 120);
  }
  return "RETAIL_HISTORY_POSTING_FAILED";
}

function resultFromJson(value: Prisma.JsonValue | null): HistoricalApplyResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const arrays = [record.cashSessionIds, record.mobileMoneyTransactionIds, record.telcoTopupIds];
  if (!arrays.every((item) => Array.isArray(item) && item.every((id) => typeof id === "string"))) return null;
  return {
    cashSessionIds: record.cashSessionIds as string[],
    mobileMoneyTransactionIds: record.mobileMoneyTransactionIds as string[],
    telcoTopupIds: record.telcoTopupIds as string[],
  };
}

async function assertRetailOrganizationTx(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: {
      id: organizationId,
      deletedAt: null,
      status: "ACTIVE",
      organizationType: "CLIENT",
      sectorCode: "COMMERCE_RETAIL",
    },
    select: { id: true, country: true },
  });
  if (!organization) throw new EnterpriseRetailError("RETAIL_SECTOR_REQUIRED", 409);
  return organization;
}

async function assertPostingDatesTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  lines: HistoricalImportLineInput[],
) {
  const checked = new Map<string, true>();
  for (const line of lines) {
    const date = new Date(line.occurredAt);
    const key = line.occurredAt.slice(0, 10);
    if (checked.has(key)) continue;
    await getPostingPeriod(tx, organizationId, date, { allowSoftClosed: true });
    checked.set(key, true);
  }
}

async function buildHistoricalPreviewTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: HistoricalImportDraftInput,
): Promise<{ preview: HistoricalImportPreview; preparedLines: PreparedLine[] }> {
  const organization = await assertRetailOrganizationTx(tx, organizationId);
  await assertPostingDatesTx(tx, organizationId, input.lines);

  const baselineIds = input.baselines.map((item) => item.financialAccountId);
  const directAccountIds = input.lines.map((line) => line.kind === "MOBILE_MONEY" ? line.cashAccountId : line.tenderFinancialAccountId);
  const requestedAccountIds = Array.from(new Set([...baselineIds, ...directAccountIds]));
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: {
      organizationId,
      id: { in: requestedAccountIds },
      accountType: { in: ACCOUNT_TYPES },
      status: "ACTIVE",
      archivedAt: null,
    },
  });
  if (accounts.length !== requestedAccountIds.length) {
    throw new EnterpriseRetailError("RETAIL_HISTORY_ACCOUNT_INVALID", 409);
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const baselineById = new Map(input.baselines.map((baseline) => [baseline.financialAccountId, baseline]));

  for (const baseline of input.baselines) {
    const account = accountById.get(baseline.financialAccountId);
    if (!account) throw new EnterpriseRetailError("RETAIL_HISTORY_ACCOUNT_INVALID", 409);
    if (!account.operationalBalance.equals(decimal(baseline.openingBalance))) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_BASELINE_CHANGED", 409, {
        financialAccountId: account.id,
        expectedOpeningBalance: baseline.openingBalance,
        currentBalance: account.operationalBalance.toFixed(),
      });
    }
  }

  const providerCodes = Array.from(new Set(input.lines.map((line) => line.providerCode)));
  const providers = await tx.enterpriseRetailProvider.findMany({
    where: { organizationId, providerCode: { in: providerCodes }, isActive: true },
  });
  const providerByCode = new Map(providers.map((provider) => [provider.providerCode, provider]));

  const requestedExternalRefs = input.lines
    .map((line) => line.externalReference?.trim() || null)
    .filter((value): value is string => Boolean(value));
  const [existingMobileRefs, existingTelcoRefs] = requestedExternalRefs.length
    ? await Promise.all([
        tx.enterpriseMobileMoneyTransaction.findMany({
          where: { organizationId, externalReference: { in: requestedExternalRefs } },
          select: { providerCode: true, externalReference: true },
        }),
        tx.enterpriseTelcoTopup.findMany({
          where: { organizationId, externalReference: { in: requestedExternalRefs } },
          select: { providerCode: true, externalReference: true },
        }),
      ])
    : [[], []];
  const existingExternalRefKeys = new Set([
    ...existingMobileRefs.map((item) => `MOBILE_MONEY:${item.providerCode}:${item.externalReference || ""}`),
    ...existingTelcoRefs.map((item) => `TELCO_TOPUP:${item.providerCode}:${item.externalReference || ""}`),
  ]);
  const batchExternalRefKeys = new Set<string>();
  const floatCache = new Map<string, { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: Prisma.Decimal; ledgerAccountId: string }>();
  const preparedLines: PreparedLine[] = [];

  for (const [originalIndex, line] of input.lines.entries()) {
    const provider = providerByCode.get(line.providerCode);
    const requiredProviderTypes = line.kind === "MOBILE_MONEY" ? ["MOBILE_MONEY", "BOTH"] : ["TELCO", "BOTH"];
    if (!provider || !requiredProviderTypes.includes(provider.providerType)) {
      throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode: line.providerCode });
    }
    const primaryAccountId = line.kind === "MOBILE_MONEY" ? line.cashAccountId : line.tenderFinancialAccountId;
    const primaryAccount = accountById.get(primaryAccountId);
    if (!primaryAccount) throw new EnterpriseRetailError("RETAIL_HISTORY_ACCOUNT_INVALID", 409);
    if (line.kind === "MOBILE_MONEY" && primaryAccount.accountType !== "CASH") {
      throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId: primaryAccount.id });
    }
    if (line.kind === "TELCO_TOPUP" && !["CASH", "MOBILE_MONEY", "BANK", "CLEARING"].includes(primaryAccount.accountType)) {
      throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId: primaryAccount.id });
    }

    const currencyCode = primaryAccount.currencyCode;
    const floatKey = `${line.kind}:${provider.id}:${currencyCode}`;
    let floatAccount = floatCache.get(floatKey);
    if (!floatAccount) {
      const resolved = line.kind === "MOBILE_MONEY"
        ? await resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, currencyCode)
        : await resolveTelcoFloatAccountTx(tx, organizationId, provider, currencyCode);
      floatAccount = resolved.account;
      floatCache.set(floatKey, floatAccount);
    }
    if (floatAccount.id === primaryAccount.id) {
      throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId: primaryAccount.id });
    }
    if (!baselineById.has(primaryAccount.id) || !baselineById.has(floatAccount.id)) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_BASELINE_REQUIRED", 409, {
        financialAccountId: !baselineById.has(primaryAccount.id) ? primaryAccount.id : floatAccount.id,
      });
    }
    const floatBaseline = baselineById.get(floatAccount.id)!;
    if (!floatAccount.operationalBalance.equals(decimal(floatBaseline.openingBalance))) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_BASELINE_CHANGED", 409, {
        financialAccountId: floatAccount.id,
        expectedOpeningBalance: floatBaseline.openingBalance,
        currentBalance: floatAccount.operationalBalance.toFixed(),
      });
    }

    const externalRef = line.externalReference?.trim() || null;
    if (externalRef) {
      const refKey = `${line.kind}:${provider.providerCode}:${externalRef}`;
      if (batchExternalRefKeys.has(refKey) || existingExternalRefKeys.has(refKey)) {
        throw new EnterpriseRetailError("RETAIL_EXTERNAL_REFERENCE_DUPLICATE", 409, { providerCode: provider.providerCode });
      }
      batchExternalRefKeys.add(refKey);
    }

    const normalizedPhone = normalizeRetailPhone(
      line.kind === "MOBILE_MONEY" ? line.customerPhone : line.destinationPhone,
      organization.country,
    );
    let primaryEffect: Prisma.Decimal;
    let floatEffect: Prisma.Decimal;
    let marginAmount = decimal(0);
    if (line.kind === "MOBILE_MONEY") {
      const principal = decimal(line.principalAmount);
      const cashFee = line.feeCollectionMode === "CASH" ? decimal(line.customerFeeAmount) : decimal(0);
      primaryEffect = line.transactionType === "DEPOSIT" ? principal.plus(cashFee) : principal.negated().plus(cashFee);
      floatEffect = line.transactionType === "DEPOSIT" ? principal.negated() : principal;
    } else {
      const saleAmount = decimal(line.saleAmount);
      const operatorCost = decimal(line.operatorCost);
      marginAmount = saleAmount.minus(operatorCost);
      if (marginAmount.isNegative()) throw new EnterpriseRetailError("RETAIL_HISTORY_TELCO_MARGIN_INVALID", 409);
      primaryEffect = saleAmount;
      floatEffect = operatorCost.negated();
    }

    preparedLines.push({
      originalIndex,
      line,
      occurredAt: new Date(line.occurredAt),
      providerId: provider.id,
      providerCode: provider.providerCode,
      providerLabel: provider.label,
      currencyCode,
      normalizedPhone,
      primaryAccountId: primaryAccount.id,
      floatAccountId: floatAccount.id,
      primaryEffect,
      floatEffect,
      marginAmount,
    });
  }

  const orderedLines = [...preparedLines].sort((a, b) => {
    const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
    return byTime || a.originalIndex - b.originalIndex;
  });
  const simulatedBalances = new Map<string, Prisma.Decimal>();
  const netEffects = new Map<string, Prisma.Decimal>();
  const usedAccountIds = new Set<string>();
  for (const baseline of input.baselines) {
    simulatedBalances.set(baseline.financialAccountId, decimal(baseline.openingBalance));
    netEffects.set(baseline.financialAccountId, decimal(0));
  }

  function applySimulatedEffect(accountId: string, effect: Prisma.Decimal) {
    const current = simulatedBalances.get(accountId);
    if (!current) throw new EnterpriseRetailError("RETAIL_HISTORY_BASELINE_REQUIRED", 409, { financialAccountId: accountId });
    if (effect.isNegative() && current.lessThan(effect.abs())) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_INSUFFICIENT_BALANCE", 409, {
        financialAccountId: accountId,
        requiredAmount: effect.abs().toFixed(),
        availableBalance: current.toFixed(),
      });
    }
    simulatedBalances.set(accountId, current.plus(effect));
    netEffects.set(accountId, (netEffects.get(accountId) || decimal(0)).plus(effect));
    usedAccountIds.add(accountId);
  }

  for (const line of orderedLines) {
    applySimulatedEffect(line.primaryAccountId, line.primaryEffect);
    applySimulatedEffect(line.floatAccountId, line.floatEffect);
  }

  const previewAccounts: HistoricalPreviewAccount[] = input.baselines.map((baseline) => {
    const account = accountById.get(baseline.financialAccountId) || floatCache.values().find((candidate) => candidate.id === baseline.financialAccountId);
    if (!account) throw new EnterpriseRetailError("RETAIL_HISTORY_ACCOUNT_INVALID", 409, { financialAccountId: baseline.financialAccountId });
    const computed = simulatedBalances.get(account.id) || decimal(baseline.openingBalance);
    const expected = baseline.expectedClosingBalance ? decimal(baseline.expectedClosingBalance) : null;
    const expectedMatches = expected ? expected.equals(computed) : true;
    if (!expectedMatches) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_CLOSING_BALANCE_MISMATCH", 409, {
        financialAccountId: account.id,
        expectedClosingBalance: expected?.toFixed(),
        computedClosingBalance: computed.toFixed(),
      });
    }
    return {
      financialAccountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      currencyCode: account.currencyCode,
      openingBalance: baseline.openingBalance,
      netEffect: (netEffects.get(account.id) || decimal(0)).toFixed(),
      computedClosingBalance: computed.toFixed(),
      expectedClosingBalance: expected?.toFixed() || null,
      expectedClosingMatches: expectedMatches,
      used: usedAccountIds.has(account.id),
    };
  });

  const previewLines = orderedLines.map((prepared, sequence) => {
    const primary = previewAccounts.find((account) => account.financialAccountId === prepared.primaryAccountId)!;
    const float = previewAccounts.find((account) => account.financialAccountId === prepared.floatAccountId)!;
    return {
      sequence: sequence + 1,
      kind: prepared.line.kind,
      occurredAt: prepared.occurredAt.toISOString(),
      providerCode: prepared.providerCode,
      providerLabel: prepared.providerLabel,
      currencyCode: prepared.currencyCode,
      primaryFinancialAccountId: prepared.primaryAccountId,
      primaryAccountCode: primary.code,
      floatFinancialAccountId: prepared.floatAccountId,
      floatAccountCode: float.code,
      primaryEffect: prepared.primaryEffect.toFixed(),
      floatEffect: prepared.floatEffect.toFixed(),
      marginAmount: prepared.marginAmount.toFixed(),
      sourceLine: prepared.line.sourceLine || null,
    } satisfies HistoricalPreviewLine;
  });

  return {
    preview: {
      sourceLabel: input.sourceLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lineCount: input.lines.length,
      mobileMoneyCount: input.lines.filter((line) => line.kind === "MOBILE_MONEY").length,
      telcoTopupCount: input.lines.filter((line) => line.kind === "TELCO_TOPUP").length,
      accounts: previewAccounts,
      lines: previewLines,
    },
    preparedLines: orderedLines,
  };
}

export async function previewHistoricalImport(organizationId: string, input: HistoricalImportDraftInput) {
  return prisma.$transaction(async (tx) => (await buildHistoricalPreviewTx(tx, organizationId, input)).preview, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function createHistoricalImportDraft(
  organizationId: string,
  actorUserId: string,
  input: HistoricalImportDraftInput,
) {
  const existing = await prisma.enterpriseRetailHistoricalImport.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    if (existing.preparedByUserId !== actorUserId || JSON.stringify(existing.payloadJson) !== JSON.stringify(input)) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_IDEMPOTENCY_CONFLICT", 409);
    }
    return { historicalImport: existing, idempotent: true };
  }

  return prisma.$transaction(async (tx) => {
    const preview = (await buildHistoricalPreviewTx(tx, organizationId, input)).preview;
    const historicalImport = await tx.enterpriseRetailHistoricalImport.create({
      data: {
        organizationId,
        reference: importReference(),
        idempotencyKey: input.idempotencyKey,
        sourceLabel: input.sourceLabel,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        payloadJson: jsonInput(input),
        previewJson: jsonInput(preview),
        preparedByUserId: actorUserId,
      },
    });
    return { historicalImport, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function createHistoricalOperationsTx(
  tx: Prisma.TransactionClient,
  historicalImport: {
    id: string;
    organizationId: string;
    sourceLabel: string;
    periodStart: Date;
    periodEnd: Date;
    preparedByUserId: string;
  },
  preview: HistoricalImportPreview,
  preparedLines: PreparedLine[],
  approvingUserId: string,
): Promise<HistoricalApplyResult> {
  const usedAccountIds = preview.accounts.filter((account) => account.used).map((account) => account.financialAccountId);
  if (usedAccountIds.length) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "EnterpriseFinancialAccount"
      WHERE "organizationId" = ${historicalImport.organizationId}
        AND "id" IN (${Prisma.join(usedAccountIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  const lockedAccounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId: historicalImport.organizationId, id: { in: usedAccountIds }, status: "ACTIVE", archivedAt: null },
  });
  const lockedById = new Map(lockedAccounts.map((account) => [account.id, account]));
  for (const summary of preview.accounts.filter((account) => account.used)) {
    const locked = lockedById.get(summary.financialAccountId);
    if (!locked || !locked.operationalBalance.equals(decimal(summary.openingBalance))) {
      throw new EnterpriseRetailError("RETAIL_HISTORY_BASELINE_CHANGED", 409, { financialAccountId: summary.financialAccountId });
    }
  }

  const activeCash = await tx.enterpriseCashSession.findFirst({
    where: {
      organizationId: historicalImport.organizationId,
      financialAccountId: { in: preview.accounts.filter((account) => account.used && account.accountType === "CASH").map((account) => account.financialAccountId) },
      status: { in: ACTIVE_CASH_SESSION_STATUSES },
    },
    select: { id: true, financialAccountId: true },
  });
  if (activeCash) {
    throw new EnterpriseRetailError("RETAIL_HISTORY_LIVE_CASH_SESSION", 409, { financialAccountId: activeCash.financialAccountId });
  }

  const overlappingTreasury = await tx.enterpriseTreasuryTransaction.findFirst({
    where: {
      organizationId: historicalImport.organizationId,
      financialAccountId: { in: usedAccountIds },
      transactionDate: { gte: historicalImport.periodStart, lte: historicalImport.periodEnd },
    },
    select: { id: true, financialAccountId: true },
  });
  if (overlappingTreasury) {
    throw new EnterpriseRetailError("RETAIL_HISTORY_OVERLAP", 409, { financialAccountId: overlappingTreasury.financialAccountId });
  }

  const cashSessionByAccountId = new Map<string, string>();
  const cashSessionIds: string[] = [];
  let cashIndex = 0;
  for (const summary of preview.accounts.filter((account) => account.used && account.accountType === "CASH")) {
    cashIndex += 1;
    const account = lockedById.get(summary.financialAccountId)!;
    const session = await tx.enterpriseCashSession.create({
      data: {
        organizationId: historicalImport.organizationId,
        number: `HIST-CASH-${historicalImport.id.slice(-8).toUpperCase()}-${cashIndex}`,
        financialAccountId: account.id,
        cashierUserId: historicalImport.preparedByUserId,
        siteId: account.siteId,
        status: "CLOSED",
        openedAt: historicalImport.periodStart,
        openingAmount: decimal(summary.openingBalance),
        expectedClosingAmount: decimal(summary.computedClosingBalance),
        countedClosingAmount: decimal(summary.expectedClosingBalance || summary.computedClosingBalance),
        discrepancyAmount: decimal(0),
        closingReason: `Reprise historique · ${historicalImport.sourceLabel}`.slice(0, 1000),
        submittedAt: historicalImport.periodEnd,
        validatedByUserId: approvingUserId,
        validatedAt: new Date(),
      },
    });
    cashSessionIds.push(session.id);
    cashSessionByAccountId.set(account.id, session.id);
  }

  for (const summary of preview.accounts.filter((account) => account.used)) {
    const effect = decimal(summary.netEffect);
    if (effect.isZero()) continue;
    await tx.enterpriseFinancialAccount.update({
      where: { id: summary.financialAccountId },
      data: effect.isPositive()
        ? { operationalBalance: { increment: effect }, revision: { increment: 1 } }
        : { operationalBalance: { decrement: effect.abs() }, revision: { increment: 1 } },
    });
  }

  const mobileMoneyTransactionIds: string[] = [];
  const telcoTopupIds: string[] = [];

  async function recordAccountEffect(input: {
    accountId: string;
    accountType: string;
    effect: Prisma.Decimal;
    transactionType: string;
    reference: string;
    occurredAt: Date;
    reason: string;
  }) {
    if (input.effect.isZero()) return;
    const outbound = input.effect.isNegative();
    const amount = input.effect.abs();
    await tx.enterpriseTreasuryTransaction.create({
      data: {
        organizationId: historicalImport.organizationId,
        financialAccountId: input.accountId,
        transactionType: input.transactionType,
        direction: outbound ? "OUTBOUND" : "INBOUND",
        currencyCode: lockedById.get(input.accountId)?.currencyCode || "",
        amount,
        transactionDate: input.occurredAt,
        reference: input.reference,
        createdByUserId: historicalImport.preparedByUserId,
      },
    });
    const cashSessionId = cashSessionByAccountId.get(input.accountId);
    if (input.accountType === "CASH" && cashSessionId) {
      await tx.enterpriseCashMovement.create({
        data: {
          organizationId: historicalImport.organizationId,
          cashSessionId,
          movementType: input.transactionType,
          direction: outbound ? "OUTBOUND" : "INBOUND",
          amount,
          currencyCode: lockedById.get(input.accountId)?.currencyCode || "",
          reference: input.reference,
          reason: input.reason.slice(0, 1000),
          createdByUserId: historicalImport.preparedByUserId,
        },
      });
    }
  }

  for (const [sequence, prepared] of preparedLines.entries()) {
    const primaryAccount = lockedById.get(prepared.primaryAccountId)!;
    const floatAccount = lockedById.get(prepared.floatAccountId)!;
    const idempotencyKey = `history:${historicalImport.id}:${prepared.originalIndex + 1}`;
    if (prepared.line.kind === "MOBILE_MONEY") {
      const number = `HMM-${historicalImport.id.slice(-8).toUpperCase()}-${sequence + 1}`;
      const transaction = await tx.enterpriseMobileMoneyTransaction.create({
        data: {
          organizationId: historicalImport.organizationId,
          number,
          providerCode: prepared.providerCode,
          transactionType: prepared.line.transactionType,
          customerPhone: prepared.normalizedPhone,
          currencyCode: prepared.currencyCode,
          principalAmount: decimal(prepared.line.principalAmount),
          customerFeeAmount: decimal(prepared.line.customerFeeAmount),
          providerCommissionAmount: decimal(prepared.line.providerCommissionAmount),
          feeCollectionMode: prepared.line.feeCollectionMode,
          cashAccountId: prepared.primaryAccountId,
          floatAccountId: prepared.floatAccountId,
          cashEffectAmount: prepared.primaryEffect,
          floatEffectAmount: prepared.floatEffect,
          externalReference: prepared.line.externalReference?.trim() || null,
          status: "CONFIRMED",
          occurredAt: prepared.occurredAt,
          agentUserId: historicalImport.preparedByUserId,
          idempotencyKey,
        },
      });
      mobileMoneyTransactionIds.push(transaction.id);
      await recordAccountEffect({
        accountId: prepared.primaryAccountId,
        accountType: primaryAccount.accountType,
        effect: prepared.primaryEffect,
        transactionType: `HISTORICAL_MOBILE_MONEY_${prepared.line.transactionType}_CASH`,
        reference: number,
        occurredAt: prepared.occurredAt,
        reason: `${historicalImport.sourceLabel} · ${prepared.providerLabel}`,
      });
      await recordAccountEffect({
        accountId: prepared.floatAccountId,
        accountType: floatAccount.accountType,
        effect: prepared.floatEffect,
        transactionType: `HISTORICAL_MOBILE_MONEY_${prepared.line.transactionType}_FLOAT`,
        reference: number,
        occurredAt: prepared.occurredAt,
        reason: `${historicalImport.sourceLabel} · ${prepared.providerLabel}`,
      });
    } else {
      const number = `HTEL-${historicalImport.id.slice(-8).toUpperCase()}-${sequence + 1}`;
      const saleAmount = decimal(prepared.line.saleAmount);
      const operatorCost = decimal(prepared.line.operatorCost);
      const topup = await tx.enterpriseTelcoTopup.create({
        data: {
          organizationId: historicalImport.organizationId,
          number,
          providerCode: prepared.providerCode,
          destinationPhone: prepared.normalizedPhone,
          offerLabel: prepared.line.offerLabel,
          currencyCode: prepared.currencyCode,
          saleAmount,
          operatorCost,
          marginAmount: prepared.marginAmount,
          tenderFinancialAccountId: prepared.primaryAccountId,
          operatorFloatAccountId: prepared.floatAccountId,
          externalReference: prepared.line.externalReference?.trim() || null,
          status: "SUCCESS",
          occurredAt: prepared.occurredAt,
          agentUserId: historicalImport.preparedByUserId,
          idempotencyKey,
        },
      });
      telcoTopupIds.push(topup.id);
      await recordAccountEffect({
        accountId: prepared.primaryAccountId,
        accountType: primaryAccount.accountType,
        effect: prepared.primaryEffect,
        transactionType: "HISTORICAL_TELCO_TOPUP_TENDER",
        reference: number,
        occurredAt: prepared.occurredAt,
        reason: `${historicalImport.sourceLabel} · ${prepared.providerLabel}`,
      });
      await recordAccountEffect({
        accountId: prepared.floatAccountId,
        accountType: floatAccount.accountType,
        effect: prepared.floatEffect,
        transactionType: "HISTORICAL_TELCO_TOPUP_FLOAT",
        reference: number,
        occurredAt: prepared.occurredAt,
        reason: `${historicalImport.sourceLabel} · ${prepared.providerLabel}`,
      });
    }
  }

  return { cashSessionIds, mobileMoneyTransactionIds, telcoTopupIds };
}

async function finalizeHistoricalPostings(
  organizationId: string,
  actorUserId: string,
  result: HistoricalApplyResult,
) {
  for (const transactionId of result.mobileMoneyTransactionIds) {
    await finalizeMobileMoneyAccounting(organizationId, actorUserId, transactionId);
  }
  for (const topupId of result.telcoTopupIds) {
    await finalizeTelcoTopupAccounting(organizationId, actorUserId, topupId);
  }
}

export async function applyHistoricalImport(
  organizationId: string,
  importId: string,
  actorUserId: string,
  revision: number,
) {
  const initial = await prisma.enterpriseRetailHistoricalImport.findFirst({ where: { id: importId, organizationId } });
  if (!initial) throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_NOT_FOUND", 404);
  if (initial.status === "APPLIED") return { historicalImport: initial, idempotent: true };
  if (initial.preparedByUserId === actorUserId) throw new EnterpriseRetailError("RETAIL_HISTORY_SELF_APPROVAL_FORBIDDEN", 403);
  if (initial.revision !== revision) throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_CONFLICT", 409);

  let result: HistoricalApplyResult;
  if (initial.status === "APPLYING") {
    const resumed = resultFromJson(initial.resultJson);
    if (!resumed) throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_CONFLICT", 409);
    result = resumed;
  } else if (initial.status === "DRAFT") {
    const parsed = historicalImportDraftSchema.safeParse(initial.payloadJson);
    if (!parsed.success) throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_INVALID", 409);
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "EnterpriseRetailHistoricalImport"
        WHERE "id" = ${importId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `);
      const lockedImport = await tx.enterpriseRetailHistoricalImport.findFirst({ where: { id: importId, organizationId } });
      if (!lockedImport || lockedImport.status !== "DRAFT" || lockedImport.revision !== revision) {
        throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_CONFLICT", 409);
      }
      if (lockedImport.preparedByUserId === actorUserId) throw new EnterpriseRetailError("RETAIL_HISTORY_SELF_APPROVAL_FORBIDDEN", 403);
      const built = await buildHistoricalPreviewTx(tx, organizationId, parsed.data);
      const applied = await createHistoricalOperationsTx(tx, lockedImport, built.preview, built.preparedLines, actorUserId);
      await tx.enterpriseRetailHistoricalImport.update({
        where: { id: lockedImport.id },
        data: {
          status: "APPLYING",
          approvedByUserId: actorUserId,
          approvedAt: new Date(),
          previewJson: jsonInput(built.preview),
          resultJson: jsonInput(applied),
          lastErrorCode: null,
          revision: { increment: 1 },
        },
      });
      return applied;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  } else {
    throw new EnterpriseRetailError("RETAIL_HISTORY_IMPORT_CONFLICT", 409, { status: initial.status });
  }

  try {
    await finalizeHistoricalPostings(organizationId, actorUserId, result);
  } catch (error) {
    await prisma.enterpriseRetailHistoricalImport.updateMany({
      where: { id: importId, organizationId, status: "APPLYING" },
      data: { lastErrorCode: errorCode(error) },
    });
    throw error;
  }

  const completed = await prisma.enterpriseRetailHistoricalImport.update({
    where: { id: importId },
    data: { status: "APPLIED", appliedAt: new Date(), lastErrorCode: null, revision: { increment: 1 } },
  });
  return { historicalImport: completed, idempotent: false };
}

export async function getHistoricalImportWorkspace(organizationId: string, actorUserId: string) {
  const [imports, accounts, providers] = await Promise.all([
    prisma.enterpriseRetailHistoricalImport.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        reference: true,
        sourceLabel: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        previewJson: true,
        preparedByUserId: true,
        approvedAt: true,
        appliedAt: true,
        lastErrorCode: true,
        revision: true,
        createdAt: true,
      },
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, accountType: { in: ACCOUNT_TYPES }, status: "ACTIVE", archivedAt: null },
      orderBy: [{ currencyCode: "asc" }, { accountType: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        currencyCode: true,
        operationalBalance: true,
        siteId: true,
      },
    }),
    prisma.enterpriseRetailProvider.findMany({
      where: { organizationId, isActive: true, providerType: { in: ["MOBILE_MONEY", "TELCO", "BOTH"] } },
      orderBy: { label: "asc" },
      select: { id: true, providerCode: true, label: true, providerType: true },
    }),
  ]);
  return {
    imports: imports.map(({ preparedByUserId, ...item }) => ({
      ...item,
      canApplyByCurrentUser: item.status !== "APPLIED" && preparedByUserId !== actorUserId,
    })),
    accounts,
    providers,
  };
}
