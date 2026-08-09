import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { chartTemplateReference, getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";
import type { AccountingChartTemplateDefinition } from "@/lib/enterprise/accounting/chart-template-types";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";

async function applyTemplateGroups(
  tx: Prisma.TransactionClient,
  organizationId: string,
  chartId: string,
  template: AccountingChartTemplateDefinition,
) {
  const pending = new Map(template.groups.map((group) => [group.code, group]));
  const ids = new Map<string, string>();

  while (pending.size > 0) {
    const ready = Array.from(pending.values()).filter((group) => !group.parentGroupCode || ids.has(group.parentGroupCode));
    if (ready.length === 0) throw new EnterpriseAccountingError("CHART_TEMPLATE_GROUP_HIERARCHY_INVALID", 409);

    await tx.enterpriseAccountGroup.createMany({
      data: ready.map((group) => ({
        organizationId,
        chartId,
        code: group.code,
        nameFr: group.nameFr,
        nameEn: group.nameEn,
        accountType: group.accountType,
        parentGroupId: group.parentGroupCode ? ids.get(group.parentGroupCode) : null,
        sortOrder: group.sortOrder,
      })),
    });

    const created = await tx.enterpriseAccountGroup.findMany({
      where: { organizationId, chartId, code: { in: ready.map((group) => group.code) } },
      select: { id: true, code: true },
    });
    for (const group of created) ids.set(group.code, group.id);
    for (const group of ready) pending.delete(group.code);
  }

  return ids;
}

async function applyTemplateAccounts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  chartId: string,
  template: AccountingChartTemplateDefinition,
  groupIds: ReadonlyMap<string, string>,
) {
  const pending = new Map(template.accounts.map((account) => [account.code, account]));
  const ids = new Map<string, string>();
  const levels = new Map<string, number>();

  while (pending.size > 0) {
    const ready = Array.from(pending.values()).filter((account) => !account.parentCode || ids.has(account.parentCode));
    if (ready.length === 0) throw new EnterpriseAccountingError("CHART_TEMPLATE_ACCOUNT_HIERARCHY_INVALID", 409);

    await tx.enterpriseLedgerAccount.createMany({
      data: ready.map((account) => ({
        organizationId,
        chartId,
        accountGroupId: account.groupCode ? groupIds.get(account.groupCode) || null : null,
        code: account.code,
        nameFr: account.nameFr,
        nameEn: account.nameEn,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype || null,
        parentId: account.parentCode ? ids.get(account.parentCode) : null,
        level: account.parentCode ? (levels.get(account.parentCode) || 0) + 1 : 1,
        currencyCode: account.currencyCode || null,
        isControlAccount: account.isControlAccount,
        isSystemAccount: account.isSystemAccount,
        allowDirectPosting: account.allowDirectPosting,
      })),
    });

    const created = await tx.enterpriseLedgerAccount.findMany({
      where: { organizationId, chartId, code: { in: ready.map((account) => account.code) } },
      select: { id: true, code: true, level: true },
    });
    for (const account of created) {
      ids.set(account.code, account.id);
      levels.set(account.code, account.level);
    }
    for (const account of ready) pending.delete(account.code);
  }

  return ids;
}

async function applyTemplateMappings(
  tx: Prisma.TransactionClient,
  organizationId: string,
  template: AccountingChartTemplateDefinition,
  accountIds: ReadonlyMap<string, string>,
  actorUserId: string,
) {
  const effectiveFrom = new Date(`${template.effectiveFrom}T00:00:00.000Z`);
  for (const mapping of template.semanticMappings) {
    const ledgerAccountId = accountIds.get(mapping.accountCode);
    if (!ledgerAccountId) throw new EnterpriseAccountingError("CHART_TEMPLATE_MAPPING_ACCOUNT_MISSING", 409, { mappingKey: mapping.mappingKey, accountCode: mapping.accountCode });
    const existing = await tx.enterpriseAccountMapping.findFirst({
      where: { organizationId, mappingKey: mapping.mappingKey, effectiveFrom },
    });
    if (existing) continue;
    await tx.enterpriseAccountMapping.create({
      data: {
        organizationId,
        mappingKey: mapping.mappingKey,
        ledgerAccountId,
        sourceModule: mapping.sourceModule || null,
        sourceEntityType: mapping.sourceEntityType || null,
        effectiveFrom,
        createdByUserId: actorUserId,
      },
    });
  }
}

async function applyTemplateJournals(
  tx: Prisma.TransactionClient,
  organizationId: string,
  template: AccountingChartTemplateDefinition,
  actorUserId: string,
) {
  if (!template.journals.length) return;
  await tx.enterpriseJournal.createMany({
    data: template.journals.map((journal) => ({
      organizationId,
      code: journal.code,
      nameFr: journal.nameFr,
      nameEn: journal.nameEn,
      journalType: journal.journalType,
      sequencePrefix: journal.sequencePrefix || null,
      requiresApproval: journal.requiresApproval,
      createdByUserId: actorUserId,
    })),
    skipDuplicates: true,
  });
}

async function populateDraftChartTemplate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  chartId: string,
  template: AccountingChartTemplateDefinition,
  targetStatus: "DRAFT" | "ACTIVE",
) {
  const reference = chartTemplateReference(template);
  const [chart, postedEntries, accounts] = await Promise.all([
    tx.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId, status: { in: ["DRAFT", "ACTIVE"] } } }),
    tx.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } }),
    tx.enterpriseLedgerAccount.count({ where: { organizationId, chartId } }),
  ]);
  if (!chart) throw new EnterpriseAccountingError("CHART_TEMPLATE_NOT_APPLICABLE", 409);

  if (accounts > 0 && chart.templateCode === reference) return chart;
  if (postedEntries > 0 || accounts > 0) throw new EnterpriseAccountingError("CHART_TEMPLATE_NOT_APPLICABLE", 409);

  const groupIds = await applyTemplateGroups(tx, organizationId, chart.id, template);
  const accountIds = await applyTemplateAccounts(tx, organizationId, chart.id, template, groupIds);
  await applyTemplateMappings(tx, organizationId, template, accountIds, actorUserId);
  await applyTemplateJournals(tx, organizationId, template, actorUserId);

  const updated = await tx.enterpriseChartOfAccounts.update({
    where: { id: chart.id },
    data: { templateCode: reference, status: targetStatus, revision: { increment: 1 } },
  });
  await publishFinanceEvent(tx, {
    organizationId,
    entityType: "EnterpriseChartOfAccounts",
    entityId: chart.id,
    eventType: targetStatus === "ACTIVE" ? "CHART_TEMPLATE_APPLIED" : "CHART_TEMPLATE_ADOPTED",
    summary: `Chart template ${reference} ${targetStatus === "ACTIVE" ? "applied" : "adopted"}`,
    actorUserId,
    fromStatus: chart.status,
    toStatus: targetStatus,
    metadataJson: {
      frameworkCode: template.frameworkCode,
      templateCode: template.code,
      templateVersion: template.version,
      templateReference: reference,
      effectiveFrom: template.effectiveFrom,
      sourceAuthority: template.source.authority,
      sourceReference: template.source.reference,
    },
  });
  return updated;
}

export async function adoptDraftChartTemplate(
  organizationId: string,
  actorUserId: string,
  chartId: string,
  templateCodeOrReference: string,
) {
  const template = getChartTemplate(templateCodeOrReference);
  if (!template || template.status !== "PUBLISHED") {
    throw new EnterpriseAccountingError("CHART_TEMPLATE_UNKNOWN", 409, { templateCode: templateCodeOrReference });
  }
  return prisma.$transaction(
    (tx) => populateDraftChartTemplate(tx, organizationId, actorUserId, chartId, template, "DRAFT"),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function applyDraftChartTemplate(
  organizationId: string,
  actorUserId: string,
  chartId: string,
  templateCodeOrReference: string,
) {
  const template = getChartTemplate(templateCodeOrReference);
  if (!template || template.status !== "PUBLISHED") {
    throw new EnterpriseAccountingError("CHART_TEMPLATE_UNKNOWN", 409, { templateCode: templateCodeOrReference });
  }
  return prisma.$transaction(
    (tx) => populateDraftChartTemplate(tx, organizationId, actorUserId, chartId, template, "ACTIVE"),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
