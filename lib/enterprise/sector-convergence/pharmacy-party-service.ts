import { Prisma } from "@prisma/client";
import { normalizeEnterpriseSupplierName } from "@/lib/enterprise/procurement/supplier-service";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

function normalizePartyName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export async function convergePharmacySupplier(
  organizationId: string,
  pharmacySupplierId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({
      organizationId,
      sector: "PHARMACY",
      domainCode: "PARTIES",
      flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_PARTIES,
    });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_PARTY_CONVERGENCE_DISABLED", 409);
  }

  const existing = await prisma.pharmacySupplierExtension.findFirst({ where: { organizationId, pharmacySupplierId } });
  if (existing) return { extension: existing, idempotent: true };
  const source = await prisma.pharmacySupplier.findFirst({ where: { id: pharmacySupplierId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_SUPPLIER_NOT_FOUND", 404);

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, {
    organizationId,
    sector: "PHARMACY",
    sourceEntityType: "PharmacySupplier",
    sourceEntityId: source.id,
  }, { supplierCode: source.supplierCode }));

  try {
    const extension = await prisma.$transaction(async (tx) => {
      const alreadyMapped = await tx.pharmacySupplierExtension.findFirst({ where: { organizationId, pharmacySupplierId: source.id } });
      if (alreadyMapped) return alreadyMapped;
      const current = await tx.pharmacySupplier.findFirst({ where: { id: source.id, organizationId } });
      if (!current) throw new EnterpriseSectorConvergenceError("PHARMACY_SUPPLIER_NOT_FOUND", 404);

      const migrationKey = `pharmacy-supplier:${current.id}`;
      const coreSupplier = await tx.enterpriseSupplier.create({
        data: {
          organizationId,
          legalName: current.name,
          displayName: current.name,
          normalizedName: normalizeEnterpriseSupplierName(`pharmacy ${current.supplierCode} ${current.name}`),
          supplierType: current.supplierType,
          category: current.category,
          status: current.status === "ACTIVE" ? "ACTIVE" : current.status === "SUSPENDED" ? "SUSPENDED" : "INACTIVE",
          email: current.email,
          phone: current.phone,
          addressLine: current.address,
          city: current.city,
          country: current.country,
          taxIdentifier: current.taxNumber,
          registrationId: current.legalIdentifier,
          notes: null,
          createdByUserId: actorUserId,
        },
      });
      const party = await tx.enterpriseBusinessParty.create({
        data: {
          organizationId,
          partyType: "ORGANIZATION",
          legalName: current.name,
          displayName: current.name,
          normalizedName: normalizePartyName(current.name),
          code: `PHS-${current.supplierCode}`.slice(0, 80),
          migrationKey,
          taxIdentifier: current.taxNumber,
          registrationId: current.legalIdentifier,
          primaryEmail: current.email,
          primaryPhone: current.phone,
          status: current.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
          createdByUserId: actorUserId,
          roles: { create: { roleCode: "SUPPLIER", createdByUserId: actorUserId } },
          contacts: current.phone || current.email ? {
            create: [
              ...(current.phone ? [{ contactType: "PHONE", label: "Principal", value: current.phone, normalizedValue: current.phone.trim().toLowerCase(), isPrimary: true, createdByUserId: actorUserId }] : []),
              ...(current.email ? [{ contactType: "EMAIL", label: "Principal", value: current.email, normalizedValue: current.email.trim().toLowerCase(), isPrimary: !current.phone, createdByUserId: actorUserId }] : []),
            ],
          } : undefined,
          addresses: current.address ? {
            create: { addressType: "PRIMARY", line1: current.address, city: current.city, countryCode: current.country, isPrimary: true, createdByUserId: actorUserId },
          } : undefined,
        },
      });
      await tx.enterpriseSupplierPartyLink.create({
        data: {
          organizationId,
          supplierId: coreSupplier.id,
          businessPartyId: party.id,
          paymentTerms: current.paymentTerms,
          complianceStatus: current.complianceStatus === "APPROVED" ? "APPROVED" : current.complianceStatus === "BLOCKED" ? "BLOCKED" : "NOT_REVIEWED",
          averageLeadTimeDays: current.averageDeliveryDays,
          migrationKey,
          createdByUserId: actorUserId,
        },
      });
      const created = await tx.pharmacySupplierExtension.create({
        data: {
          organizationId,
          pharmacySupplierId: current.id,
          businessPartyId: party.id,
          enterpriseSupplierId: coreSupplier.id,
          historicalKey: migrationKey,
          createdByUserId: actorUserId,
        },
      });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseSupplier", targetEntityId: coreSupplier.id, metadataJson: { businessPartyId: party.id } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { extension, idempotent: false };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({
      organizationId,
      syncStateId: sync.id,
      status: duplicate ? "AMBIGUOUS" : "FAILED",
      errorCode: duplicate ? "PHARMACY_SUPPLIER_MAPPING_AMBIGUOUS" : "PHARMACY_SUPPLIER_MAPPING_FAILED",
      requiresManualAction: duplicate,
    });
    throw duplicate ? new EnterpriseSectorConvergenceError("PHARMACY_SUPPLIER_MAPPING_AMBIGUOUS", 409) : error;
  }
}
