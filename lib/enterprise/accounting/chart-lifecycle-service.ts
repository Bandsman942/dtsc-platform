import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { chartTemplateReference, getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";
import { validateTemplateSemanticCoverage } from "@/lib/enterprise/accounting/semantic-account-registry";
import { resolveEnterpriseFinanceReadiness, type FinanceReadinessDiagnostic, type FinanceReadinessSeverity } from "@/lib/enterprise/accounting/finance-readiness-service";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export type AccountingReadinessSeverity = FinanceReadinessSeverity;
export type AccountingReadinessDiagnostic = FinanceReadinessDiagnostic;

export async function previewChartTemplateAdoption(organizationId: string, templateCodeOrReference: string) {
  const template = getChartTemplate(templateCodeOrReference);
  if (!template || template.status !== "PUBLISHED") throw new EnterpriseAccountingError("CHART_TEMPLATE_UNKNOWN", 409, { templateCode: templateCodeOrReference });
  const [existingCharts, postedEntries] = await Promise.all([
    prisma.enterpriseChartOfAccounts.findMany({ where: { organizationId }, select: { id: true, code: true, status: true, templateCode: true, revision: true } }),
    prisma.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } }),
  ]);
  const semanticCoverage = validateTemplateSemanticCoverage(template);
  return {
    template: {
      code: template.code,
      frameworkCode: template.frameworkCode,
      version: template.version,
      reference: chartTemplateReference(template),
      nameFr: template.nameFr,
      nameEn: template.nameEn,
      effectiveFrom: template.effectiveFrom,
      source: template.source,
      accountCount: template.accounts.length,
      mappingCount: template.semanticMappings.length,
      journalCount: template.journals.length,
    },
    semanticCoverage,
    existingCharts,
    postedEntries,
    canAdoptWithoutMigration: postedEntries === 0 && existingCharts.every((chart) => chart.status !== "ACTIVE"),
  };
}

export async function getAccountingChartReadiness(organizationId: string, chartId: string) {
  const readiness = await resolveEnterpriseFinanceReadiness(prisma, organizationId, { chartId, mode: "SETUP" });
  if (!readiness.chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_NOT_FOUND", 404);
  return {
    chart: readiness.chart,
    templateReference: readiness.templateReference,
    diagnostics: readiness.diagnostics,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    missingMappings: readiness.missingMappings,
    missingJournalTypes: readiness.missingJournalTypes,
    ready: readiness.ready,
  };
}

export async function activateAccountingChart(
  organizationId: string,
  chartId: string,
  actorUserId: string,
  revision: number,
) {
  const readiness = await getAccountingChartReadiness(organizationId, chartId);
  if (!readiness.ready) throw new EnterpriseAccountingError("ACCOUNTING_CHART_NOT_READY", 409, { blockers: readiness.blockers.map((item) => item.code) });
  return prisma.$transaction(async (tx) => {
    const chart = await tx.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId } });
    if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_NOT_FOUND", 404);
    if (chart.revision !== revision) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_REVISION_CONFLICT", 409, { currentRevision: chart.revision });
    if (!["DRAFT", "READY", "ACTIVE"].includes(chart.status)) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_NOT_ACTIVATABLE", 409, { status: chart.status });
    if (chart.status === "ACTIVE") return chart;

    const otherActive = await tx.enterpriseChartOfAccounts.findFirst({ where: { organizationId, status: "ACTIVE", id: { not: chart.id } } });
    if (otherActive) {
      const postedEntries = await tx.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } });
      if (postedEntries > 0) throw new EnterpriseAccountingError("ACTIVE_CHART_REPLACEMENT_AFTER_POSTING_FORBIDDEN", 409, { activeChartId: otherActive.id });
      await tx.enterpriseChartOfAccounts.update({ where: { id: otherActive.id }, data: { status: "SUPERSEDED", revision: { increment: 1 } } });
    }

    const updated = await tx.enterpriseChartOfAccounts.update({ where: { id: chart.id }, data: { status: "ACTIVE", revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseChartOfAccounts", entityId: chart.id, eventType: "CHART_OF_ACCOUNTS_ACTIVATED", summary: `Chart ${chart.code} activated`, actorUserId, fromStatus: chart.status, toStatus: "ACTIVE", metadataJson: { templateReference: chart.templateCode } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createCustomChildAccount(
  organizationId: string,
  chartId: string,
  actorUserId: string,
  input: { parentId: string; code: string; nameFr: string; nameEn: string; currencyCode?: string },
) {
  return prisma.$transaction(async (tx) => {
    const chart = await tx.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId, status: { in: ["DRAFT", "READY", "ACTIVE"] } } });
    if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_INVALID", 409);
    const parent = await tx.enterpriseLedgerAccount.findFirst({ where: { id: input.parentId, organizationId, chartId, isActive: true, archivedAt: null } });
    if (!parent) throw new EnterpriseAccountingError("LEDGER_PARENT_INVALID", 409);
    if (!input.code.startsWith(parent.code)) throw new EnterpriseAccountingError("CUSTOM_ACCOUNT_CODE_MUST_EXTEND_PARENT", 409, { parentCode: parent.code });
    const duplicate = await tx.enterpriseLedgerAccount.findFirst({ where: { organizationId, code: input.code } });
    if (duplicate) throw new EnterpriseAccountingError("LEDGER_ACCOUNT_CODE_EXISTS", 409, { code: input.code });
    const account = await tx.enterpriseLedgerAccount.create({
      data: {
        organizationId,
        chartId,
        accountGroupId: parent.accountGroupId,
        code: input.code,
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        accountType: parent.accountType,
        accountSubtype: parent.accountSubtype,
        parentId: parent.id,
        level: parent.level + 1,
        currencyCode: input.currencyCode || parent.currencyCode,
        isControlAccount: false,
        isSystemAccount: false,
        allowDirectPosting: true,
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseLedgerAccount", entityId: account.id, eventType: "CUSTOM_LEDGER_ACCOUNT_CREATED", summary: `Custom child account ${account.code} created`, actorUserId, toStatus: "ACTIVE", metadataJson: { chartId, parentId: parent.id, templateReference: chart.templateCode } });
    return account;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deactivateCustomLedgerAccount(
  organizationId: string,
  accountId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseLedgerAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!account) throw new EnterpriseAccountingError("LEDGER_ACCOUNT_NOT_FOUND", 404);
    if (account.revision !== revision) throw new EnterpriseAccountingError("LEDGER_ACCOUNT_REVISION_CONFLICT", 409, { currentRevision: account.revision });
    if (account.isSystemAccount) throw new EnterpriseAccountingError("SYSTEM_ACCOUNT_REQUIRES_REINFORCED_PERMISSION", 403);
    const [journalUsage, mappingUsage, financialAccountUsage, childCount] = await Promise.all([
      tx.enterpriseJournalLine.count({ where: { organizationId, ledgerAccountId: account.id } }),
      tx.enterpriseAccountMapping.count({ where: { organizationId, ledgerAccountId: account.id, isActive: true } }),
      tx.enterpriseFinancialAccount.count({ where: { organizationId, ledgerAccountId: account.id, archivedAt: null } }),
      tx.enterpriseLedgerAccount.count({ where: { organizationId, parentId: account.id, archivedAt: null } }),
    ]);
    if (journalUsage > 0 || mappingUsage > 0 || financialAccountUsage > 0 || childCount > 0) {
      throw new EnterpriseAccountingError("LEDGER_ACCOUNT_IN_USE", 409, { journalUsage, mappingUsage, financialAccountUsage, childCount });
    }
    const updated = await tx.enterpriseLedgerAccount.update({ where: { id: account.id }, data: { isActive: false, archivedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseLedgerAccount", entityId: account.id, eventType: "LEDGER_ACCOUNT_DEACTIVATED", summary: `Ledger account ${account.code} deactivated`, actorUserId, fromStatus: "ACTIVE", toStatus: "INACTIVE" });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function diffOrganizationChartAgainstTemplate(organizationId: string, chartId: string) {
  const chart = await prisma.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId } });
  if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_NOT_FOUND", 404);
  const template = chart.templateCode ? getChartTemplate(chart.templateCode) : undefined;
  if (!template) throw new EnterpriseAccountingError("CHART_TEMPLATE_LINEAGE_UNKNOWN", 409, { templateReference: chart.templateCode });
  const accounts = await prisma.enterpriseLedgerAccount.findMany({ where: { organizationId, chartId }, orderBy: { code: "asc" } });
  const templateByCode = new Map(template.accounts.map((account) => [account.code, account]));
  const organizationByCode = new Map(accounts.map((account) => [account.code, account]));
  const added = accounts.filter((account) => !templateByCode.has(account.code)).map((account) => ({ code: account.code, nameFr: account.nameFr, parentId: account.parentId }));
  const missing = template.accounts.filter((account) => !organizationByCode.has(account.code)).map((account) => ({ code: account.code, nameFr: account.nameFr }));
  const modified = template.accounts.flatMap((source) => {
    const account = organizationByCode.get(source.code);
    if (!account) return [];
    const changes: string[] = [];
    if (account.nameFr !== source.nameFr) changes.push("nameFr");
    if (account.nameEn !== source.nameEn) changes.push("nameEn");
    if (account.accountType !== source.accountType) changes.push("accountType");
    if ((account.accountSubtype || undefined) !== source.accountSubtype) changes.push("accountSubtype");
    if (account.allowDirectPosting !== source.allowDirectPosting) changes.push("allowDirectPosting");
    return changes.length ? [{ code: source.code, changes }] : [];
  });
  return { chartId, templateReference: chart.templateCode, added, missing, modified, hasDifferences: added.length > 0 || missing.length > 0 || modified.length > 0 };
}
