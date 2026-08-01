import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

export async function convergeHealthPatientFinancialProfile(
  organizationId: string,
  healthPatientId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({
      organizationId,
      sector: "HEALTH_CARE",
      domainCode: "PATIENT_FINANCE",
      flag: SECTOR_CONVERGENCE_FLAGS.HEALTH_PATIENT_FINANCE,
    });
    if (!enabled) throw new EnterpriseSectorConvergenceError("HEALTH_PATIENT_FINANCE_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.healthPatientFinancialProfile.findFirst({ where: { organizationId, healthPatientId } });
  if (existing) return { profile: existing, idempotent: true };
  const patient = await prisma.healthPatient.findFirst({ where: { id: healthPatientId, organizationId, archivedAt: null } });
  if (!patient) throw new EnterpriseSectorConvergenceError("HEALTH_PATIENT_NOT_FOUND", 404);

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, {
    organizationId,
    sector: "HEALTH_CARE",
    sourceEntityType: "HealthPatient",
    sourceEntityId: patient.id,
  }, { patientNumber: patient.patientNumber }));

  try {
    const profile = await prisma.$transaction(async (tx) => {
      const alreadyMapped = await tx.healthPatientFinancialProfile.findFirst({ where: { organizationId, healthPatientId: patient.id } });
      if (alreadyMapped) return alreadyMapped;
      const current = await tx.healthPatient.findFirst({ where: { id: patient.id, organizationId, archivedAt: null } });
      if (!current) throw new EnterpriseSectorConvergenceError("HEALTH_PATIENT_NOT_FOUND", 404);
      const migrationKey = `health-patient:${current.id}`;
      const billingLabel = `Patient #${current.patientNumber}`;
      const party = await tx.enterpriseBusinessParty.create({
        data: {
          organizationId,
          partyType: "PERSON",
          legalName: billingLabel,
          displayName: billingLabel,
          normalizedName: billingLabel.toLowerCase(),
          code: `PAT-${current.patientNumber}`.slice(0, 80),
          migrationKey,
          primaryEmail: current.email,
          primaryPhone: current.phonePrimary,
          status: current.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
          createdByUserId: actorUserId,
          roles: { create: { roleCode: "CUSTOMER", createdByUserId: actorUserId } },
          contacts: {
            create: [
              { contactType: "PHONE", label: "Paiement", value: current.phonePrimary, normalizedValue: current.phonePrimary.trim().toLowerCase(), isPrimary: true, createdByUserId: actorUserId },
              ...(current.email ? [{ contactType: "EMAIL", label: "Facturation", value: current.email, normalizedValue: current.email.trim().toLowerCase(), isPrimary: false, createdByUserId: actorUserId }] : []),
            ],
          },
          addresses: current.address ? {
            create: { addressType: "BILLING", line1: current.address, city: current.city, countryCode: current.country, isPrimary: true, createdByUserId: actorUserId },
          } : undefined,
        },
      });
      const created = await tx.healthPatientFinancialProfile.create({
        data: {
          organizationId,
          healthPatientId: current.id,
          businessPartyId: party.id,
          billingDisplayLabel: billingLabel,
          migrationKey,
          createdByUserId: actorUserId,
        },
      });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseBusinessParty", targetEntityId: party.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { profile, idempotent: false };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({
      organizationId,
      syncStateId: sync.id,
      status: duplicate ? "AMBIGUOUS" : "FAILED",
      errorCode: duplicate ? "HEALTH_PATIENT_FINANCIAL_MAPPING_AMBIGUOUS" : "HEALTH_PATIENT_FINANCIAL_MAPPING_FAILED",
      requiresManualAction: duplicate,
    });
    throw duplicate ? new EnterpriseSectorConvergenceError("HEALTH_PATIENT_FINANCIAL_MAPPING_AMBIGUOUS", 409) : error;
  }
}
