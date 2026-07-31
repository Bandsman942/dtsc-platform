import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { assertFunctionalCurrencyMutable } from "@/lib/enterprise/accounting/currency";
import type { financeConfigurationSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type FinanceConfigurationInput = z.infer<typeof financeConfigurationSchema>;

export async function getFinanceReadiness(organizationId: string) {
  const [configuration, accountCount, journalCount, openPeriodCount, taxCount, treasuryCount, mappingCount] = await Promise.all([
    prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseLedgerAccount.count({ where: { organizationId, isActive: true, archivedAt: null } }),
    prisma.enterpriseJournal.count({ where: { organizationId, isActive: true } }),
    prisma.enterpriseFiscalPeriod.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterpriseTaxCode.count({ where: { organizationId, isActive: true } }),
    prisma.enterpriseFinancialAccount.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseAccountMapping.count({ where: { organizationId, isActive: true } }),
  ]);
  const checklist = {
    functionalCurrencyConfigured: Boolean(configuration?.functionalCurrencyCode),
    chartOfAccountsConfigured: accountCount > 0,
    journalsConfigured: journalCount > 0,
    defaultAccountsConfigured: mappingCount > 0 && Boolean(configuration?.defaultAccountsJson),
    openPeriodAvailable: openPeriodCount > 0,
    taxesConfigured: taxCount > 0,
    treasuryAccountConfigured: treasuryCount > 0,
    postingRulesValid: mappingCount >= 4,
  };
  return {
    configuration,
    checklist,
    ready: Object.values(checklist).every(Boolean),
  };
}

export async function assertFinanceReady(tx: Prisma.TransactionClient, organizationId: string) {
  const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!configuration || configuration.readinessStatus !== "READY") {
    throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_NOT_READY", 409);
  }
  return configuration;
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
  const readiness = await getFinanceReadiness(organizationId);
  if (!readiness.configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  return prisma.enterpriseFinanceConfiguration.update({
    where: { organizationId },
    data: {
      readinessStatus: readiness.ready ? "READY" : "INCOMPLETE",
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
      ...(readiness.ready && !readiness.configuration.lockedFunctionalCurrencyAt ? { lockedFunctionalCurrencyAt: new Date() } : {}),
    },
  });
}
