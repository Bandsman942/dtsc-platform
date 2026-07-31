import { Prisma } from "@prisma/client";
import { financeReference } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export async function convergeHealthInsuranceProvider(
  organizationId: string,
  healthInsuranceProviderId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "HEALTH_CARE", domainCode: "INSURANCE", flag: SECTOR_CONVERGENCE_FLAGS.HEALTH_INSURANCE });
    if (!enabled) throw new EnterpriseSectorConvergenceError("HEALTH_INSURANCE_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.healthInsuranceProviderExtension.findFirst({ where: { organizationId, healthInsuranceProviderId } });
  if (existing) return { extension: existing, idempotent: true };
  const provider = await prisma.healthInsuranceProvider.findFirst({ where: { id: healthInsuranceProviderId, organizationId, archivedAt: null } });
  if (!provider) throw new EnterpriseSectorConvergenceError("HEALTH_INSURANCE_PROVIDER_NOT_FOUND", 404);
  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthInsuranceProvider", sourceEntityId: provider.id }, { providerCode: provider.providerCode }));
  try {
    const extension = await prisma.$transaction(async (tx) => {
      const mapped = await tx.healthInsuranceProviderExtension.findFirst({ where: { organizationId, healthInsuranceProviderId: provider.id } });
      if (mapped) return mapped;
      const current = await tx.healthInsuranceProvider.findFirst({ where: { id: provider.id, organizationId, archivedAt: null } });
      if (!current) throw new EnterpriseSectorConvergenceError("HEALTH_INSURANCE_PROVIDER_NOT_FOUND", 404);
      const migrationKey = `health-insurer:${current.id}`;
      const party = await tx.enterpriseBusinessParty.create({
        data: {
          organizationId,
          partyType: "ORGANIZATION",
          legalName: current.name,
          displayName: current.name,
          normalizedName: normalize(current.name),
          code: current.providerCode ? `INS-${current.providerCode}`.slice(0, 80) : financeReference("INS"),
          migrationKey,
          primaryEmail: current.email,
          primaryPhone: current.phone,
          status: current.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
          notes: current.financialNotes,
          createdByUserId: actorUserId,
          roles: { create: { organizationId, roleCode: "INSURER", createdByUserId: actorUserId } },
          contacts: current.phone || current.email ? { create: [
            ...(current.phone ? [{ organizationId, contactType: "PHONE", label: "Principal", value: current.phone, normalizedValue: current.phone.trim().toLowerCase(), isPrimary: true, createdByUserId: actorUserId }] : []),
            ...(current.email ? [{ organizationId, contactType: "EMAIL", label: "Facturation", value: current.email, normalizedValue: current.email.trim().toLowerCase(), isPrimary: !current.phone, createdByUserId: actorUserId }] : []),
          ] } : undefined,
          addresses: current.address ? { create: { organizationId, addressType: "BILLING", line1: current.address, isPrimary: true, createdByUserId: actorUserId } } : undefined,
        },
      });
      const created = await tx.healthInsuranceProviderExtension.create({ data: { organizationId, healthInsuranceProviderId: current.id, businessPartyId: party.id, migrationKey, createdByUserId: actorUserId } });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseBusinessParty", targetEntityId: party.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { extension, idempotent: false };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({ organizationId, syncStateId: sync.id, status: duplicate ? "AMBIGUOUS" : "FAILED", errorCode: duplicate ? "HEALTH_INSURER_MAPPING_AMBIGUOUS" : "HEALTH_INSURER_MAPPING_FAILED", requiresManualAction: duplicate });
    throw error;
  }
}

export async function convergeHealthCoverageReceivable(
  organizationId: string,
  coverageRequestId: string,
  payerComponentId: string,
  actorUserId: string,
) {
  const coverage = await prisma.healthCoverageRequest.findFirst({ where: { id: coverageRequestId, organizationId } });
  if (!coverage) throw new EnterpriseSectorConvergenceError("HEALTH_COVERAGE_REQUEST_NOT_FOUND", 404);
  const insurer = await prisma.healthInsuranceProviderExtension.findFirst({ where: { organizationId, healthInsuranceProviderId: coverage.insuranceProviderId } });
  if (!insurer) throw new EnterpriseSectorConvergenceError("HEALTH_INSURER_MAPPING_REQUIRED", 409);
  const component = await prisma.healthInvoicePayerComponent.findFirst({ where: { id: payerComponentId, organizationId, payerType: "INSURER", businessPartyId: insurer.businessPartyId } });
  if (!component) throw new EnterpriseSectorConvergenceError("HEALTH_INSURER_COMPONENT_INVALID", 409);
  const existing = await prisma.healthInsuranceReceivableExtension.findFirst({ where: { organizationId, coverageRequestId } });
  if (existing) return { extension: existing, idempotent: true };
  const extension = await prisma.healthInsuranceReceivableExtension.create({
    data: {
      organizationId,
      coverageRequestId,
      payerComponentId,
      insurerBusinessPartyId: insurer.businessPartyId,
      claimStatus: coverage.status,
      requestedAmount: coverage.requestedAmount,
      approvedAmount: coverage.approvedAmount,
      rejectedAmount: coverage.rejectedAmount,
      settledAmount: 0,
      disputedAmount: 0,
      currencyCode: coverage.currency,
    },
  });
  await prisma.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "HealthInsuranceReceivableExtension", entityId: extension.id, eventType: "HEALTH_INSURANCE_RECEIVABLE_CREATED", summary: "Insurance receivable component linked", actorUserId, metadataJson: { coverageRequestId, payerComponentId } } });
  return { extension, idempotent: false };
}
