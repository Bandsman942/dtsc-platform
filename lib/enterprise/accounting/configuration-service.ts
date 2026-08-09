import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { assertFunctionalCurrencyMutable } from "@/lib/enterprise/accounting/currency";
import { getEnterpriseFinanceReadiness, resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import type { financeConfigurationSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type FinanceConfigurationInput = z.infer<typeof financeConfigurationSchema>;

export async function getFinanceReadiness(organizationId: string) {
  const readiness = await getEnterpriseFinanceReadiness(organizationId, { mode: "SETUP" });
  return {
    version: readiness.version,
    configuration: readiness.configuration,
    chart: readiness.chart,
    diagnostics: readiness.diagnostics,
    blockers: readiness.blockers.map((diagnostic) => diagnostic.code),
    warnings: readiness.warnings.map((diagnostic) => diagnostic.code),
    status: readiness.ready ? "READY" : "INCOMPLETE",
    ready: readiness.ready,
  };
}

export async function assertFinanceReady(tx: Prisma.TransactionClient, organizationId: string) {
  const readiness = await resolveEnterpriseFinanceReadiness(tx, organizationId, { mode: "POSTING" });
  if (!readiness.configuration || !readiness.ready) {
    throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_NOT_READY", 409, {
      blockers: readiness.blockers.map((diagnostic) => diagnostic.code),
    });
  }
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
