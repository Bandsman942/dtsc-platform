import type { Prisma } from "@prisma/client";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { operationsReference } from "@/lib/enterprise/projects-assets/helpers";

type Tx = Prisma.TransactionClient;

type SupplierIdentity = {
  id: string;
  organizationId: string;
  legalName: string;
  displayName: string | null;
  supplierType: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  taxIdentifier: string | null;
  registrationId: string | null;
  notes: string | null;
};

export function normalizeCanonicalBusinessPartyName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function expectedPartyType(supplierType: string | null | undefined) {
  return supplierType === "PERSON" ? "PERSON" : "ORGANIZATION";
}

export function supplierRoleStatus(supplierStatus: string) {
  return ["ACTIVE", "PROSPECT"].includes(supplierStatus) ? "ACTIVE" : "INACTIVE";
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function countryCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() || "";
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : null;
}

async function uniqueCandidate(
  tx: Tx,
  organizationId: string,
  where: Prisma.EnterpriseBusinessPartyWhereInput,
  reason: string,
) {
  const matches = await tx.enterpriseBusinessParty.findMany({
    where: { organizationId, archivedAt: null, ...where },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (matches.length > 1) {
    throw new EnterpriseCoreV2Error(
      `Plusieurs tiers correspondent à ce fournisseur (${reason}). Ouvrez Tiers et clients pour fusionner ou clarifier les doublons avant de réessayer.`,
      409,
      "SUPPLIER_PARTY_SELECTION_REQUIRED",
    );
  }
  return matches[0] || null;
}

function assertCandidateType(candidate: { partyType: string }, expectedType: string) {
  if (candidate.partyType !== expectedType) {
    throw new EnterpriseCoreV2Error(
      "Un tiers correspondant existe déjà avec une nature différente (personne/organisation). Corrigez la fiche canonique avant de rattacher ce fournisseur.",
      409,
      "SUPPLIER_PARTY_TYPE_MISMATCH",
    );
  }
}

async function findCanonicalCandidate(tx: Tx, organizationId: string, supplier: SupplierIdentity) {
  const expectedType = expectedPartyType(supplier.supplierType);
  const strongSelectors: Array<{ where: Prisma.EnterpriseBusinessPartyWhereInput; reason: string }> = [];
  if (supplier.taxIdentifier) strongSelectors.push({ where: { taxIdentifier: supplier.taxIdentifier }, reason: "identifiant fiscal" });
  if (supplier.registrationId) strongSelectors.push({ where: { registrationId: supplier.registrationId }, reason: "numéro d’enregistrement" });
  const email = normalizedEmail(supplier.email);
  if (email) strongSelectors.push({ where: { primaryEmail: email }, reason: "adresse e-mail" });

  const strongMatches: Array<{ candidate: Awaited<ReturnType<typeof uniqueCandidate>>; reason: string }> = [];
  for (const selector of strongSelectors) {
    const candidate = await uniqueCandidate(tx, organizationId, selector.where, selector.reason);
    if (!candidate) continue;
    assertCandidateType(candidate, expectedType);
    strongMatches.push({ candidate, reason: selector.reason });
  }

  const strongIds = new Set(strongMatches.map(({ candidate }) => candidate!.id));
  if (strongIds.size > 1) {
    throw new EnterpriseCoreV2Error(
      "Les identifiants du fournisseur correspondent à plusieurs tiers différents. Corrigez les doublons ou les informations d’identité avant de réessayer.",
      409,
      "SUPPLIER_PARTY_IDENTITY_CONFLICT",
    );
  }
  if (strongMatches.length) return strongMatches[0].candidate;

  const nameCandidate = await uniqueCandidate(
    tx,
    organizationId,
    { normalizedName: normalizeCanonicalBusinessPartyName(supplier.legalName) },
    "nom",
  );
  if (nameCandidate) assertCandidateType(nameCandidate, expectedType);
  return nameCandidate;
}

async function createCanonicalContactsAndAddress(tx: Tx, organizationId: string, actorUserId: string, supplier: SupplierIdentity, businessPartyId: string) {
  const email = normalizedEmail(supplier.email);
  if (email) {
    await tx.enterpriseBusinessPartyContact.create({
      data: {
        organizationId,
        businessPartyId,
        contactType: "EMAIL",
        label: "Contact principal",
        value: email,
        normalizedValue: email,
        isPrimary: true,
        createdByUserId: actorUserId,
      },
    });
  }
  if (supplier.phone) {
    const phone = supplier.phone.trim();
    await tx.enterpriseBusinessPartyContact.create({
      data: {
        organizationId,
        businessPartyId,
        contactType: "PHONE",
        label: "Téléphone principal",
        value: phone,
        normalizedValue: phone.toLocaleLowerCase("fr"),
        isPrimary: !email,
        createdByUserId: actorUserId,
      },
    });
  }
  if (supplier.addressLine?.trim()) {
    await tx.enterpriseBusinessPartyAddress.create({
      data: {
        organizationId,
        businessPartyId,
        addressType: "PRIMARY",
        label: "Adresse principale",
        line1: supplier.addressLine.trim(),
        city: supplier.city?.trim() || null,
        countryCode: countryCode(supplier.country),
        isPrimary: true,
        createdByUserId: actorUserId,
      },
    });
  }
}

export async function ensureSupplierCanonicalPartyTx(tx: Tx, organizationId: string, actorUserId: string, supplier: SupplierIdentity) {
  const existingLink = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId, supplierId: supplier.id, archivedAt: null },
  });
  if (existingLink) {
    const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: existingLink.businessPartyId, organizationId, archivedAt: null } });
    if (!party) throw new EnterpriseCoreV2Error("Le lien fournisseur pointe vers un tiers indisponible. Contactez le support DTSC.", 409, "SUPPLIER_PARTY_LINK_BROKEN");
    const roleStatus = supplierRoleStatus(supplier.status);
    await tx.enterpriseBusinessPartyRole.upsert({
      where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER" } },
      update: { status: roleStatus, archivedAt: null },
      create: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER", status: roleStatus, createdByUserId: actorUserId },
    });
    return { party, link: existingLink, createdParty: false, createdLink: false };
  }

  const migrationKey = `supplier:${supplier.id}`;
  let party = await tx.enterpriseBusinessParty.findFirst({ where: { organizationId, migrationKey, archivedAt: null } });
  let createdParty = false;
  if (party) assertCandidateType(party, expectedPartyType(supplier.supplierType));
  if (!party) party = await findCanonicalCandidate(tx, organizationId, supplier);

  if (party) {
    const occupied = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId, businessPartyId: party.id, archivedAt: null },
    });
    if (occupied && occupied.supplierId !== supplier.id) {
      throw new EnterpriseCoreV2Error(
        "Ce tiers est déjà rattaché à un autre fournisseur. Ouvrez Tiers et clients pour résoudre le doublon avant de réessayer.",
        409,
        "SUPPLIER_PARTY_ALREADY_LINKED",
      );
    }
  } else {
    party = await tx.enterpriseBusinessParty.create({
      data: {
        organizationId,
        partyType: expectedPartyType(supplier.supplierType),
        legalName: supplier.legalName.trim(),
        displayName: supplier.displayName,
        normalizedName: normalizeCanonicalBusinessPartyName(supplier.legalName),
        code: operationsReference("SUP"),
        migrationKey,
        taxIdentifier: supplier.taxIdentifier,
        registrationId: supplier.registrationId,
        primaryEmail: normalizedEmail(supplier.email),
        primaryPhone: supplier.phone?.trim() || null,
        status: "ACTIVE",
        notes: supplier.notes,
        createdByUserId: actorUserId,
      },
    });
    createdParty = true;
    await createCanonicalContactsAndAddress(tx, organizationId, actorUserId, supplier, party.id);
  }

  const roleStatus = supplierRoleStatus(supplier.status);
  await tx.enterpriseBusinessPartyRole.upsert({
    where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER" } },
    update: { status: roleStatus, archivedAt: null },
    create: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER", status: roleStatus, createdByUserId: actorUserId },
  });

  const link = await tx.enterpriseSupplierPartyLink.create({
    data: {
      organizationId,
      supplierId: supplier.id,
      businessPartyId: party.id,
      migrationKey,
      createdByUserId: actorUserId,
    },
  });

  // If Procurement matched an existing canonical party, the canonical identity wins.
  if (!createdParty) {
    await tx.enterpriseSupplier.update({
      where: { id: supplier.id },
      data: {
        legalName: party.legalName,
        displayName: party.displayName,
        normalizedName: normalizeCanonicalBusinessPartyName(party.legalName),
        email: party.primaryEmail,
        phone: party.primaryPhone,
        taxIdentifier: party.taxIdentifier,
        registrationId: party.registrationId,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
  }

  return { party, link, createdParty, createdLink: true };
}

export async function syncCanonicalPartyFromSupplierTx(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  supplier: SupplierIdentity,
  changes: {
    legalName?: string;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
    taxIdentifier?: string | null;
    registrationId?: string | null;
    notes?: string | null;
    addressLine?: string | null;
    city?: string | null;
    country?: string | null;
  },
) {
  const { party } = await ensureSupplierCanonicalPartyTx(tx, organizationId, actorUserId, supplier);
  const legalName = changes.legalName?.trim();
  await tx.enterpriseBusinessParty.update({
    where: { id: party.id },
    data: {
      ...(legalName !== undefined ? { legalName, normalizedName: normalizeCanonicalBusinessPartyName(legalName) } : {}),
      ...(changes.displayName !== undefined ? { displayName: changes.displayName } : {}),
      ...(changes.email !== undefined ? { primaryEmail: normalizedEmail(changes.email) } : {}),
      ...(changes.phone !== undefined ? { primaryPhone: changes.phone?.trim() || null } : {}),
      ...(changes.taxIdentifier !== undefined ? { taxIdentifier: changes.taxIdentifier } : {}),
      ...(changes.registrationId !== undefined ? { registrationId: changes.registrationId } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
    },
  });

  const addressTouched = changes.addressLine !== undefined || changes.city !== undefined || changes.country !== undefined;
  if (addressTouched) {
    const primaryAddress = await tx.enterpriseBusinessPartyAddress.findFirst({
      where: { organizationId, businessPartyId: party.id, archivedAt: null, isPrimary: true },
      orderBy: { createdAt: "asc" },
    });
    const nextLine = changes.addressLine !== undefined ? changes.addressLine?.trim() || null : primaryAddress?.line1 || null;
    if (nextLine) {
      if (primaryAddress) {
        await tx.enterpriseBusinessPartyAddress.update({
          where: { id: primaryAddress.id },
          data: {
            line1: nextLine,
            ...(changes.city !== undefined ? { city: changes.city?.trim() || null } : {}),
            ...(changes.country !== undefined ? { countryCode: countryCode(changes.country) } : {}),
            status: "ACTIVE",
            archivedAt: null,
            revision: { increment: 1 },
          },
        });
      } else {
        await tx.enterpriseBusinessPartyAddress.create({
          data: {
            organizationId,
            businessPartyId: party.id,
            addressType: "PRIMARY",
            label: "Adresse principale",
            line1: nextLine,
            city: changes.city?.trim() || supplier.city,
            countryCode: countryCode(changes.country ?? supplier.country),
            isPrimary: true,
            createdByUserId: actorUserId,
          },
        });
      }
    } else if (primaryAddress && changes.addressLine !== undefined) {
      await tx.enterpriseBusinessPartyAddress.update({
        where: { id: primaryAddress.id },
        data: { status: "INACTIVE", archivedAt: new Date(), revision: { increment: 1 } },
      });
    }
  }

  return party.id;
}

export async function syncSupplierRoleStatusTx(tx: Tx, organizationId: string, actorUserId: string, supplier: SupplierIdentity, status: string) {
  const { party } = await ensureSupplierCanonicalPartyTx(tx, organizationId, actorUserId, supplier);
  const roleStatus = supplierRoleStatus(status);
  await tx.enterpriseBusinessPartyRole.upsert({
    where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER" } },
    update: { status: roleStatus, archivedAt: null },
    create: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER", status: roleStatus, createdByUserId: actorUserId },
  });
  return party.id;
}
