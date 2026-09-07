import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

function record(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_PAYLOAD_INVALID", 409);
  }
  return value as Record<string, Prisma.JsonValue>;
}

function stringValue(value: Prisma.JsonValue | undefined, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_PAYLOAD_INVALID", 409, { field });
  }
  return value.trim();
}

function optionalString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function automationLines(value: Prisma.JsonValue | undefined, currencyCode: string): PostingLineDraft[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_LINES_INVALID", 409);
  }
  return value.map((item, index) => {
    const row = record(item);
    const direction = stringValue(row.direction, `lines.${index}.direction`).toUpperCase();
    if (direction !== "DEBIT" && direction !== "CREDIT") {
      throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_DIRECTION_INVALID", 409, { index });
    }
    const amount = new Prisma.Decimal(stringValue(row.amount, `lines.${index}.amount`));
    if (!amount.gt(0)) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_AMOUNT_INVALID", 409, { index });
    const lineCurrency = optionalString(row.transactionCurrencyCode) || currencyCode;
    const transactionAmount = optionalString(row.transactionAmount) || amount.toFixed();
    return {
      accountMappingKey: stringValue(row.accountMappingKey, `lines.${index}.accountMappingKey`),
      description: stringValue(row.description, `lines.${index}.description`),
      ...(direction === "DEBIT" ? { debit: amount } : { credit: amount }),
      transactionCurrencyCode: lineCurrency,
      transactionAmount,
      businessPartyId: optionalString(row.businessPartyId),
      projectId: optionalString(row.projectId),
      departmentId: optionalString(row.departmentId),
      siteId: optionalString(row.siteId),
      assetId: optionalString(row.assetId),
      inventoryItemId: optionalString(row.inventoryItemId),
    };
  });
}

export const buildAccountingAutomationPosting: PostingBuilder = async (tx, input) => {
  const run = await tx.enterpriseAccountingAutomationRun.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId },
  });
  if (!run) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_RUN_NOT_FOUND", 404);
  if (!["PENDING", "PROCESSING", "POSTED"].includes(run.status)) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_RUN_NOT_POSTABLE", 409, { status: run.status });
  }
  const payload = record(run.payloadJson);
  const currencyCode = stringValue(payload.currencyCode, "currencyCode").toUpperCase();
  const journalType = stringValue(payload.journalType, "journalType").toUpperCase();
  const sourceModule = optionalString(payload.sourceModule) || "FINANCE_ACCOUNTING";
  return {
    organizationId: input.organizationId,
    journalType,
    accountingDate: run.accountingDate,
    documentDate: run.accountingDate,
    reference: optionalString(payload.reference) || run.sourceReference || run.runKey,
    description: stringValue(payload.description, "description"),
    sourceModule,
    sourceEntityType: "EnterpriseAccountingAutomationRun",
    sourceEntityId: run.id,
    currencyCode,
    lines: automationLines(payload.lines, currencyCode),
  };
};

export const buildAssetDisposalPosting: PostingBuilder = async (tx, input) => {
  const disposal = await tx.enterpriseAssetDisposal.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED"] } },
    include: { profile: true },
  });
  if (!disposal) throw new EnterpriseAccountingError("ASSET_DISPOSAL_NOT_POSTABLE", 409);
  const settlement = await tx.enterpriseAssetDisposalAccountingSettlement.findUnique({
    where: { organizationId_assetDisposalId: { organizationId: input.organizationId, assetDisposalId: disposal.id } },
  });
  if (!settlement) throw new EnterpriseAccountingError("ASSET_DISPOSAL_SETTLEMENT_REQUIRED", 409);

  const profile = disposal.profile;
  const lines: PostingLineDraft[] = [
    {
      accountMappingKey: `ACCOUNT_ID:${profile.accumulatedDepreciationAccountId}`,
      description: `Accumulated depreciation disposal ${profile.assetId}`,
      debit: disposal.accumulatedDepreciation,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: disposal.accumulatedDepreciation,
      assetId: profile.assetId,
    },
    {
      accountMappingKey: `ACCOUNT_ID:${profile.assetAccountId}`,
      description: `Asset cost disposal ${profile.assetId}`,
      credit: disposal.grossValue,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: disposal.grossValue,
      assetId: profile.assetId,
    },
  ];

  if (disposal.proceeds.gt(0)) {
    if (!settlement.proceedsLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_PROCEEDS_ACCOUNT_REQUIRED", 409);
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${settlement.proceedsLedgerAccountId}`,
      description: `Asset disposal proceeds ${profile.assetId}`,
      debit: disposal.proceeds,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: disposal.proceeds,
      assetId: profile.assetId,
    });
  }

  if (disposal.gainLoss.gt(0)) {
    if (!settlement.gainLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_GAIN_ACCOUNT_REQUIRED", 409);
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${settlement.gainLedgerAccountId}`,
      description: `Asset disposal gain ${profile.assetId}`,
      credit: disposal.gainLoss,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: disposal.gainLoss,
      assetId: profile.assetId,
    });
  } else if (disposal.gainLoss.lt(0)) {
    if (!settlement.lossLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_LOSS_ACCOUNT_REQUIRED", 409);
    const loss = disposal.gainLoss.abs();
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${settlement.lossLedgerAccountId}`,
      description: `Asset disposal loss ${profile.assetId}`,
      debit: loss,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: loss,
      assetId: profile.assetId,
    });
  }

  return {
    organizationId: input.organizationId,
    journalType: "ASSETS",
    accountingDate: disposal.disposalDate,
    documentDate: disposal.disposalDate,
    reference: `DISPOSAL-${disposal.id}`,
    description: `Asset disposal ${profile.assetId}`,
    sourceModule: "FINANCE_ASSETS",
    sourceEntityType: "EnterpriseAssetDisposal",
    sourceEntityId: disposal.id,
    currencyCode: disposal.currencyCode,
    lines,
  };
};
