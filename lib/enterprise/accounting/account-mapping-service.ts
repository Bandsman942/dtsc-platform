import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { getSemanticAccountDefinition } from "@/lib/enterprise/accounting/semantic-account-registry";

async function assertManualMappingTarget(
  tx: Prisma.TransactionClient,
  organizationId: string,
  mappingKey: string,
  ledgerAccountId: string,
  expectedChartId?: string,
) {
  const definition = getSemanticAccountDefinition(mappingKey);
  if (!definition || definition.deprecated) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_KEY_INVALID", 409, { mappingKey });
  }
  const account = await tx.enterpriseLedgerAccount.findFirst({
    where: { id: ledgerAccountId, organizationId, isActive: true, archivedAt: null },
    include: { chart: true },
  });
  if (!account) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_ACCOUNT_INVALID", 409);
  if (expectedChartId && account.chartId !== expectedChartId) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_CHART_MISMATCH", 409);
  }
  if (account.chart.templateCode) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_TEMPLATE_MANAGED", 409, {
      templateReference: account.chart.templateCode,
    });
  }
  if (!["DRAFT", "READY", "ACTIVE"].includes(account.chart.status)) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_CHART_NOT_CONFIGURABLE", 409, { status: account.chart.status });
  }
  if (!definition.expectedAccountTypes.includes(account.accountType)) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_ACCOUNT_TYPE_INCOMPATIBLE", 409, {
      mappingKey,
      accountType: account.accountType,
      expectedAccountTypes: definition.expectedAccountTypes,
    });
  }
  if (
    definition.expectedAccountSubtypes?.length &&
    account.accountSubtype &&
    !definition.expectedAccountSubtypes.includes(account.accountSubtype)
  ) {
    throw new EnterpriseAccountingError("ACCOUNT_MAPPING_ACCOUNT_SUBTYPE_INCOMPATIBLE", 409, {
      mappingKey,
      accountSubtype: account.accountSubtype,
      expectedAccountSubtypes: definition.expectedAccountSubtypes,
    });
  }
  return { account, definition };
}

export async function createManualAccountMapping(
  organizationId: string,
  actorUserId: string,
  input: { mappingKey: string; ledgerAccountId: string; effectiveFrom?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const { account } = await assertManualMappingTarget(tx, organizationId, input.mappingKey, input.ledgerAccountId);
    const duplicate = await tx.enterpriseAccountMapping.findFirst({
      where: {
        organizationId,
        chartId: account.chartId,
        mappingKey: input.mappingKey,
        isActive: true,
        ledgerAccount: { chartId: account.chartId },
      },
    });
    if (duplicate) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_ACTIVE_EXISTS", 409, { mappingId: duplicate.id });
    const mapping = await tx.enterpriseAccountMapping.create({
      data: {
        organizationId,
        chartId: account.chartId,
        mappingKey: input.mappingKey,
        ledgerAccountId: account.id,
        effectiveFrom: input.effectiveFrom || null,
        createdByUserId: actorUserId,
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountMapping",
      entityId: mapping.id,
      eventType: "ACCOUNT_MAPPING_CREATED",
      summary: `Manual accounting mapping ${mapping.mappingKey} created`,
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { ledgerAccountId: account.id, chartId: account.chartId },
    });
    return mapping;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateManualAccountMapping(
  organizationId: string,
  mappingId: string,
  actorUserId: string,
  input: { ledgerAccountId: string; effectiveFrom?: Date; effectiveTo?: Date | null; isActive: boolean; revision: number },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountMapping" WHERE id = ${mappingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseAccountMapping.findFirst({
      where: { id: mappingId, organizationId },
      include: { ledgerAccount: { include: { chart: true } } },
    });
    if (!current) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_RECORD_NOT_FOUND", 404);
    if (current.revision !== input.revision) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_REVISION_CONFLICT", 409);
    if (current.ledgerAccount.chart.templateCode) {
      throw new EnterpriseAccountingError("ACCOUNT_MAPPING_TEMPLATE_MANAGED", 409, { templateReference: current.ledgerAccount.chart.templateCode });
    }
    const { account } = await assertManualMappingTarget(tx, organizationId, current.mappingKey, input.ledgerAccountId, current.chartId);
    if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new EnterpriseAccountingError("ACCOUNT_MAPPING_DATE_RANGE_INVALID", 409);
    }
    const updated = await tx.enterpriseAccountMapping.update({
      where: { id: current.id },
      data: {
        chartId: account.chartId,
        ledgerAccountId: input.ledgerAccountId,
        effectiveFrom: input.effectiveFrom ?? current.effectiveFrom,
        effectiveTo: input.effectiveTo === undefined ? current.effectiveTo : input.effectiveTo,
        isActive: input.isActive,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountMapping",
      entityId: current.id,
      eventType: "ACCOUNT_MAPPING_UPDATED",
      summary: `Manual accounting mapping ${current.mappingKey} updated`,
      actorUserId,
      fromStatus: current.isActive ? "ACTIVE" : "INACTIVE",
      toStatus: updated.isActive ? "ACTIVE" : "INACTIVE",
      metadataJson: { ledgerAccountId: updated.ledgerAccountId },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deactivateManualAccountMapping(
  organizationId: string,
  mappingId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountMapping" WHERE id = ${mappingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseAccountMapping.findFirst({
      where: { id: mappingId, organizationId },
      include: { ledgerAccount: { include: { chart: true } } },
    });
    if (!current) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_RECORD_NOT_FOUND", 404);
    if (current.revision !== revision) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_REVISION_CONFLICT", 409);
    if (current.ledgerAccount.chart.templateCode) {
      throw new EnterpriseAccountingError("ACCOUNT_MAPPING_TEMPLATE_MANAGED", 409, { templateReference: current.ledgerAccount.chart.templateCode });
    }
    if (!current.isActive) return current;
    const updated = await tx.enterpriseAccountMapping.update({
      where: { id: current.id },
      data: { isActive: false, effectiveTo: current.effectiveTo || new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountMapping",
      entityId: current.id,
      eventType: "ACCOUNT_MAPPING_DEACTIVATED",
      summary: `Manual accounting mapping ${current.mappingKey} deactivated`,
      actorUserId,
      fromStatus: "ACTIVE",
      toStatus: "INACTIVE",
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
