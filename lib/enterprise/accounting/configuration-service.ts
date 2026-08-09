import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { assertFunctionalCurrencyMutable } from "@/lib/enterprise/accounting/currency";
import { getEnterpriseFinanceReadiness, resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import type { financeConfigurationSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type FinanceConfigurationInput = z.infer<typeof financeConfigurationSchema>;

const POSTING_GLOBAL_BLOCKERS = new Set([
  "FUNCTIONAL_CURRENCY_REQUIRED",
  "CHART_REQUIRED",
  "ACTIVE_CHART_REQUIRED",
  "CHART_ACCOUNTS_REQUIRED",
]);

function diagnosticReady(readiness: Awaited<ReturnType<typeof getEnterpriseFinanceReadiness>>, code: string) {
  return readiness.diagnostics.find((diagnostic) => diagnostic.code === code)?.ready || false;
}

export async function getFinanceReadiness(organizationId: string) {
  const readiness = await getEnterpriseFinanceReadiness(organizationId, { mode: "SETUP" });
  const checklist = {
    functionalCurrencyConfigured: diagnosticReady(readiness, "FUNCTIONAL_CURRENCY_REQUIRED"),
    fiscalYearConfigured: diagnosticReady(readiness, "FISCAL_YEAR_REQUIRED"),
    openPeriodAvailable: diagnosticReady(readiness, "OPEN_FISCAL_PERIOD_REQUIRED"),
    chartOfAccountsConfigured: diagnosticReady(readiness, "CHART_ACCOUNTS_REQUIRED"),
    journalsConfigured: diagnosticReady(readiness, "JOURNALS_REQUIRED"),
    postingRulesValid: diagnosticReady(readiness, "ORGANIZATION_MAPPINGS_REQUIRED") && diagnosticReady(readiness, "TEMPLATE_SEMANTIC_COVERAGE_REQUIRED"),
    treasuryAccountConfigured: diagnosticReady(readiness, "TREASURY_ACCOUNT_RECOMMENDED"),
    taxesConfigured: diagnosticReady(readiness, "TAX_CONFIGURATION_CONTEXTUAL"),
    // Transitional aliases retained only until the Finance overview is migrated to diagnostics in #169.
    hasFunctionalCurrency: diagnosticReady(readiness, "FUNCTIONAL_CURRENCY_REQUIRED"),
    hasFiscalYear: diagnosticReady(readiness, "FISCAL_YEAR_REQUIRED"),
    hasOpenPeriod: diagnosticReady(readiness, "OPEN_FISCAL_PERIOD_REQUIRED"),
    hasChartOfAccounts: diagnosticReady(readiness, "CHART_ACCOUNTS_REQUIRED"),
    hasSalesJournal: !readiness.missingJournalTypes.includes("SALES"),
    hasPurchaseJournal: !readiness.missingJournalTypes.includes("PURCHASES"),
    hasFinancialAccount: diagnosticReady(readiness, "TREASURY_ACCOUNT_RECOMMENDED"),
    hasTaxConfiguration: diagnosticReady(readiness, "TAX_CONFIGURATION_CONTEXTUAL"),
    ledgerReady: readiness.ready,
  };
  return {
    version: readiness.version,
    configuration: readiness.configuration,
    chart: readiness.chart,
    checklist,
    diagnostics: readiness.diagnostics,
    blockers: readiness.blockers.map((diagnostic) => diagnostic.code),
    warnings: readiness.warnings.map((diagnostic) => diagnostic.code),
    status: readiness.ready ? "READY" : "INCOMPLETE",
    ready: readiness.ready,
  };
}

export async function assertFinanceReady(tx: Prisma.TransactionClient, organizationId: string) {
  const readiness = await resolveEnterpriseFinanceReadiness(tx, organizationId, { mode: "POSTING" });
  const globalBlockers = readiness.blockers.filter((diagnostic) => POSTING_GLOBAL_BLOCKERS.has(diagnostic.code));
  if (!readiness.configuration || globalBlockers.length > 0) {
    throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_NOT_READY", 409, {
      blockers: globalBlockers.map((diagnostic) => diagnostic.code),
    });
  }
  // Period, journal and semantic-account requirements are intentionally validated later by
  // the event-specific posting path, which knows the accounting date, journal type and
  // exact mapping keys required by the business event. This preserves precise errors such
  // as FINANCE_PERIOD_CLOSED and avoids blocking one ERP domain on unrelated mappings.
  return readiness.configuration;
}

export async function upsertFinanceConfiguration(
  organizationId: string,
  actorUserId: string,
  input: FinanceConfigurationInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const existing = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
    if (existing && existing.functionalCurrencyCode !== input.functionalCurrencyCode) {
      await assertFunctionalCurrencyMutable(tx, organizationId);
    }
    if (existing && input.revision && existing.revision !== input.revision) {
      throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REVISION_CONFLICT", 409, { currentRevision: existing.revision });
    }
    const configuration = await tx.enterpriseFinanceConfiguration.upsert({
      where: { organizationId },
      update: {
        functionalCurrencyCode: input.functionalCurrencyCode,
        presentationCurrencyCode: input.presentationCurrencyCode || null,
        inventoryValuationMethod: input.inventoryValuationMethod,
        reconciliationTolerance: new Prisma.Decimal(input.reconciliationTolerance),
        numberingPolicyJson: input.numberingPolicyJson as Prisma.InputJsonValue | undefined,
        taxPolicyJson: input.taxPolicyJson as Prisma.InputJsonValue | undefined,
        defaultAccountsJson: input.defaultAccountsJson as Prisma.InputJsonValue | undefined,
        closePolicyJson: input.closePolicyJson as Prisma.InputJsonValue | undefined,
        approvalThresholdsJson: input.approvalThresholdsJson as Prisma.InputJsonValue | undefined,
        automaticPostingEnabled: input.automaticPostingEnabled,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
      create: {
        organizationId,
        functionalCurrencyCode: input.functionalCurrencyCode,
        presentationCurrencyCode: input.presentationCurrencyCode || null,
        inventoryValuationMethod: input.inventoryValuationMethod,
        reconciliationTolerance: new Prisma.Decimal(input.reconciliationTolerance),
        numberingPolicyJson: input.numberingPolicyJson as Prisma.InputJsonValue | undefined,
        taxPolicyJson: input.taxPolicyJson as Prisma.InputJsonValue | undefined,
        defaultAccountsJson: input.defaultAccountsJson as Prisma.InputJsonValue | undefined,
        closePolicyJson: input.closePolicyJson as Prisma.InputJsonValue | undefined,
        approvalThresholdsJson: input.approvalThresholdsJson as Prisma.InputJsonValue | undefined,
        automaticPostingEnabled: input.automaticPostingEnabled,
        createdByUserId: actorUserId,
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinanceConfiguration",
      entityId: configuration.id,
      eventType: existing ? "FINANCE_CONFIGURATION_UPDATED" : "FINANCE_CONFIGURATION_CREATED",
      summary: "Financial configuration saved",
      actorUserId,
      metadataJson: { functionalCurrencyCode: configuration.functionalCurrencyCode },
    });
    return configuration;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function refreshFinanceReadiness(organizationId: string, actorUserId: string) {
  const readiness = await getEnterpriseFinanceReadiness(organizationId, { mode: "POSTING" });
  if (!readiness.configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  const nextStatus = readiness.ready ? "READY" : "INCOMPLETE";
  const shouldLockCurrency = readiness.ready && !readiness.configuration.lockedFunctionalCurrencyAt;
  if (readiness.configuration.readinessStatus === nextStatus && !shouldLockCurrency) return readiness.configuration;
  return prisma.enterpriseFinanceConfiguration.update({
    where: { organizationId },
    data: {
      readinessStatus: nextStatus,
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
      ...(shouldLockCurrency ? { lockedFunctionalCurrencyAt: new Date() } : {}),
    },
  });
}
