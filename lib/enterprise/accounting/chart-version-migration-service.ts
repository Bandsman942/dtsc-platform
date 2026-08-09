import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getChartTemplate, chartTemplateReference, DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE } from "@/lib/enterprise/accounting/chart-template-registry";
import type { AccountingChartTemplateDefinition } from "@/lib/enterprise/accounting/chart-template-types";
import { validateTemplateSemanticCoverage } from "@/lib/enterprise/accounting/semantic-account-registry";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export type AccountingTemplateDiff = {
  fromReference: string;
  toReference: string;
  accounts: {
    added: Array<{ code: string; nameFr: string }>;
    removed: Array<{ code: string; nameFr: string }>;
    modified: Array<{ code: string; changes: string[] }>;
  };
  semanticMappings: {
    added: string[];
    removed: string[];
    modified: Array<{ mappingKey: string; fromAccountCode: string; toAccountCode: string }>;
  };
  journals: {
    added: string[];
    removed: string[];
    modified: Array<{ code: string; changes: string[] }>;
  };
  statementMappings: { added: string[]; removed: string[]; modified: string[] };
};

function statementMappingKey(mapping: AccountingChartTemplateDefinition["financialStatementMappings"][number]) {
  return `${mapping.statementType}:${mapping.lineCode}`;
}

export function diffAccountingTemplates(from: AccountingChartTemplateDefinition, to: AccountingChartTemplateDefinition): AccountingTemplateDiff {
  const fromAccounts = new Map(from.accounts.map((account) => [account.code, account]));
  const toAccounts = new Map(to.accounts.map((account) => [account.code, account]));
  const added = to.accounts.filter((account) => !fromAccounts.has(account.code)).map((account) => ({ code: account.code, nameFr: account.nameFr }));
  const removed = from.accounts.filter((account) => !toAccounts.has(account.code)).map((account) => ({ code: account.code, nameFr: account.nameFr }));
  const modified = from.accounts.flatMap((source) => {
    const target = toAccounts.get(source.code);
    if (!target) return [];
    const changes: string[] = [];
    if (source.nameFr !== target.nameFr) changes.push("nameFr");
    if (source.nameEn !== target.nameEn) changes.push("nameEn");
    if (source.parentCode !== target.parentCode) changes.push("parentCode");
    if (source.groupCode !== target.groupCode) changes.push("groupCode");
    if (source.accountType !== target.accountType) changes.push("accountType");
    if (source.accountSubtype !== target.accountSubtype) changes.push("accountSubtype");
    if (source.allowDirectPosting !== target.allowDirectPosting) changes.push("allowDirectPosting");
    if (source.isControlAccount !== target.isControlAccount) changes.push("isControlAccount");
    if (source.isSystemAccount !== target.isSystemAccount) changes.push("isSystemAccount");
    return changes.length ? [{ code: source.code, changes }] : [];
  });

  const fromMappings = new Map(from.semanticMappings.map((mapping) => [mapping.mappingKey, mapping.accountCode]));
  const toMappings = new Map(to.semanticMappings.map((mapping) => [mapping.mappingKey, mapping.accountCode]));
  const mappingAdded = Array.from(toMappings.keys()).filter((key) => !fromMappings.has(key));
  const mappingRemoved = Array.from(fromMappings.keys()).filter((key) => !toMappings.has(key));
  const mappingModified = Array.from(fromMappings.entries()).flatMap(([mappingKey, fromAccountCode]) => {
    const toAccountCode = toMappings.get(mappingKey);
    return toAccountCode && toAccountCode !== fromAccountCode ? [{ mappingKey, fromAccountCode, toAccountCode }] : [];
  });

  const fromJournals = new Map(from.journals.map((journal) => [journal.code, journal]));
  const toJournals = new Map(to.journals.map((journal) => [journal.code, journal]));
  const journalAdded = Array.from(toJournals.keys()).filter((key) => !fromJournals.has(key));
  const journalRemoved = Array.from(fromJournals.keys()).filter((key) => !toJournals.has(key));
  const journalModified = Array.from(fromJournals.entries()).flatMap(([code, source]) => {
    const target = toJournals.get(code);
    if (!target) return [];
    const changes: string[] = [];
    if (source.nameFr !== target.nameFr) changes.push("nameFr");
    if (source.nameEn !== target.nameEn) changes.push("nameEn");
    if (source.journalType !== target.journalType) changes.push("journalType");
    if (source.sequencePrefix !== target.sequencePrefix) changes.push("sequencePrefix");
    if (source.requiresApproval !== target.requiresApproval) changes.push("requiresApproval");
    return changes.length ? [{ code, changes }] : [];
  });

  const fromStatements = new Map(from.financialStatementMappings.map((mapping) => [statementMappingKey(mapping), mapping]));
  const toStatements = new Map(to.financialStatementMappings.map((mapping) => [statementMappingKey(mapping), mapping]));
  const statementAdded = Array.from(toStatements.keys()).filter((key) => !fromStatements.has(key));
  const statementRemoved = Array.from(fromStatements.keys()).filter((key) => !toStatements.has(key));
  const statementModified = Array.from(fromStatements.entries()).flatMap(([key, source]) => {
    const target = toStatements.get(key);
    if (!target) return [];
    return source.nameFr !== target.nameFr || source.nameEn !== target.nameEn || source.normalBalance !== target.normalBalance || source.sortOrder !== target.sortOrder || JSON.stringify(source.accountCodes) !== JSON.stringify(target.accountCodes) ? [key] : [];
  });

  return {
    fromReference: chartTemplateReference(from),
    toReference: chartTemplateReference(to),
    accounts: { added, removed, modified },
    semanticMappings: { added: mappingAdded, removed: mappingRemoved, modified: mappingModified },
    journals: { added: journalAdded, removed: journalRemoved, modified: journalModified },
    statementMappings: { added: statementAdded, removed: statementRemoved, modified: statementModified },
  };
}

export async function previewChartTemplateUpgrade(organizationId: string, chartId: string, targetTemplateReference: string) {
  const chart = await prisma.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId } });
  if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_NOT_FOUND", 404);
  if (!chart.templateCode) throw new EnterpriseAccountingError("CHART_TEMPLATE_LINEAGE_UNKNOWN", 409);
  const from = getChartTemplate(chart.templateCode);
  const to = getChartTemplate(targetTemplateReference);
  if (!from || !to || to.status !== "PUBLISHED") throw new EnterpriseAccountingError("CHART_TEMPLATE_UPGRADE_TARGET_INVALID", 409, { targetTemplateReference });
  if (from.frameworkCode !== to.frameworkCode) throw new EnterpriseAccountingError("CHART_TEMPLATE_FRAMEWORK_CHANGE_REQUIRES_SEPARATE_MIGRATION", 409);
  if (chartTemplateReference(from) === chartTemplateReference(to)) return { chart, diff: diffAccountingTemplates(from, to), postedEntries: 0, customAccountCount: 0, requiresHumanDecision: false, canApplyAutomatically: true };
  const templateCodes = new Set(from.accounts.map((account) => account.code));
  const [postedEntries, organizationAccounts] = await Promise.all([
    prisma.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } }),
    prisma.enterpriseLedgerAccount.findMany({ where: { organizationId, chartId }, select: { code: true, isSystemAccount: true } }),
  ]);
  const customAccountCount = organizationAccounts.filter((account) => !templateCodes.has(account.code)).length;
  const diff = diffAccountingTemplates(from, to);
  const breaking = diff.accounts.removed.length > 0 || diff.accounts.modified.some((item) => item.changes.some((change) => ["accountType", "accountSubtype", "parentCode"].includes(change))) || diff.semanticMappings.removed.length > 0 || diff.semanticMappings.modified.length > 0;
  return { chart, diff, postedEntries, customAccountCount, requiresHumanDecision: postedEntries > 0 || customAccountCount > 0 || breaking, canApplyAutomatically: postedEntries === 0 && customAccountCount === 0 && !breaking && ["DRAFT", "READY"].includes(chart.status) };
}

export async function applySafeChartTemplateUpgrade(organizationId: string, chartId: string, targetTemplateReference: string, actorUserId: string, revision: number) {
  const preview = await previewChartTemplateUpgrade(organizationId, chartId, targetTemplateReference);
  if (preview.chart.revision !== revision) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_REVISION_CONFLICT", 409, { currentRevision: preview.chart.revision });
  if (!preview.canApplyAutomatically) throw new EnterpriseAccountingError("CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", 409, { postedEntries: preview.postedEntries, customAccountCount: preview.customAccountCount, requiresHumanDecision: preview.requiresHumanDecision });
  const target = getChartTemplate(targetTemplateReference);
  if (!target) throw new EnterpriseAccountingError("CHART_TEMPLATE_UPGRADE_TARGET_INVALID", 409);
  const current = getChartTemplate(preview.chart.templateCode || "");
  if (!current) throw new EnterpriseAccountingError("CHART_TEMPLATE_LINEAGE_UNKNOWN", 409);
  if (chartTemplateReference(current) === chartTemplateReference(target)) return preview.chart;

  return prisma.$transaction(async (tx) => {
    const chart = await tx.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId, revision } });
    if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_REVISION_CONFLICT", 409);
    const existingByCode = new Map((await tx.enterpriseLedgerAccount.findMany({ where: { organizationId, chartId } })).map((account) => [account.code, account]));
    const targetByCode = new Map(target.accounts.map((account) => [account.code, account]));
    for (const source of preview.diff.accounts.added) {
      const targetAccount = targetByCode.get(source.code);
      if (!targetAccount) continue;
      const parent = targetAccount.parentCode ? existingByCode.get(targetAccount.parentCode) : undefined;
      const created = await tx.enterpriseLedgerAccount.create({ data: { organizationId, chartId, code: targetAccount.code, nameFr: targetAccount.nameFr, nameEn: targetAccount.nameEn, accountType: targetAccount.accountType, accountSubtype: targetAccount.accountSubtype || null, parentId: parent?.id || null, level: parent ? parent.level + 1 : 1, currencyCode: targetAccount.currencyCode || null, isControlAccount: targetAccount.isControlAccount, isSystemAccount: targetAccount.isSystemAccount, allowDirectPosting: targetAccount.allowDirectPosting } });
      existingByCode.set(created.code, created);
    }
    for (const change of preview.diff.accounts.modified) {
      const targetAccount = targetByCode.get(change.code);
      const existing = existingByCode.get(change.code);
      if (!targetAccount || !existing) continue;
      await tx.enterpriseLedgerAccount.update({ where: { id: existing.id }, data: { nameFr: targetAccount.nameFr, nameEn: targetAccount.nameEn, allowDirectPosting: targetAccount.allowDirectPosting, revision: { increment: 1 } } });
    }
    const updated = await tx.enterpriseChartOfAccounts.update({ where: { id: chart.id }, data: { templateCode: chartTemplateReference(target), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseChartOfAccounts", entityId: chart.id, eventType: "CHART_TEMPLATE_VERSION_UPGRADED", summary: `Chart template upgraded ${chart.templateCode} -> ${chartTemplateReference(target)}`, actorUserId, metadataJson: { fromReference: chart.templateCode, toReference: chartTemplateReference(target), diff: preview.diff as unknown as Prisma.InputJsonValue } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function accountingTemplateProductionReadiness(templateReference: string) {
  const template = getChartTemplate(templateReference);
  if (!template || template.status !== "PUBLISHED") return { ready: false, status: "TEMPLATE_NOT_PUBLISHED", blockers: ["PUBLISHED_TEMPLATE_REQUIRED"] } as const;
  if (template.source.kind !== "OFFICIAL" && template.source.kind !== "LICENSED") return { ready: false, status: "SOURCE_NOT_TRUSTED", blockers: ["TRUSTED_REGULATORY_SOURCE_REQUIRED"] } as const;
  const semanticCoverage = validateTemplateSemanticCoverage(template);
  if (!semanticCoverage.valid) return { ready: false, status: "SEMANTIC_MAPPING_INCOMPLETE", blockers: semanticCoverage.issues } as const;
  if (!template.financialStatementMappings.length) return { ready: false, status: "STATEMENTS_NOT_VALIDATED", blockers: ["REGULATORY_STATEMENT_MAPPINGS_NOT_VALIDATED"] } as const;
  return {
    ready: true,
    status: "ACCOUNTING_TEMPLATE_PRODUCTION_READY",
    blockers: [] as string[],
    governance: {
      defaultTemplate: templateReference === DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE,
      approvedBy: "DTSC_PLATFORM_OWNER",
      approvedAt: "2026-08-09",
      futureVersionsRequireControlledMigration: true,
    },
  } as const;
}
