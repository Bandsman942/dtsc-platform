import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const organizationArg = process.argv.find((argument) => argument.startsWith("--organization="));
const organizationId = organizationArg?.split("=")[1] || null;

class BackfillConflict extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BackfillConflict";
    this.code = code;
  }
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function normalizeSupplierName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return value?.trim().toLowerCase() || null;
}

function normalizeCountryCode(value) {
  const normalized = value?.trim().toUpperCase() || "";
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : null;
}

function reference(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function supplierRoleStatus(status) {
  return ["ACTIVE", "PROSPECT"].includes(status) ? "ACTIVE" : "INACTIVE";
}

function expectedPartyType(supplier) {
  return supplier.supplierType === "PERSON" ? "PERSON" : "ORGANIZATION";
}

function assertPartyType(party, supplier) {
  if (party.partyType !== expectedPartyType(supplier)) {
    throw new BackfillConflict("SUPPLIER_PARTY_TYPE_MISMATCH", "Le fournisseur et le tiers correspondant n’ont pas la même nature personne/organisation.");
  }
}

async function uniqueCandidate(tx, supplier, where, reason) {
  const matches = await tx.enterpriseBusinessParty.findMany({
    where: { organizationId: supplier.organizationId, archivedAt: null, ...where },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (matches.length > 1) {
    throw new BackfillConflict("SUPPLIER_PARTY_SELECTION_REQUIRED", `Plusieurs tiers correspondent au même ${reason}.`);
  }
  if (matches[0]) assertPartyType(matches[0], supplier);
  return matches[0] || null;
}

async function findCanonicalCandidate(tx, supplier) {
  const migrationKey = `supplier:${supplier.id}`;
  const migrationParty = await tx.enterpriseBusinessParty.findFirst({
    where: { organizationId: supplier.organizationId, migrationKey },
  });
  if (migrationParty?.archivedAt) {
    throw new BackfillConflict("SUPPLIER_PARTY_ARCHIVED", "Le tiers historique associé à ce fournisseur est archivé.");
  }
  if (migrationParty) {
    assertPartyType(migrationParty, supplier);
    return migrationParty;
  }

  const strongSelectors = [];
  if (supplier.taxIdentifier) strongSelectors.push({ where: { taxIdentifier: supplier.taxIdentifier }, reason: "identifiant fiscal" });
  if (supplier.registrationId) strongSelectors.push({ where: { registrationId: supplier.registrationId }, reason: "numéro d’enregistrement" });
  const email = normalizeEmail(supplier.email);
  if (email) strongSelectors.push({ where: { primaryEmail: email }, reason: "adresse e-mail" });

  const strongMatches = [];
  for (const selector of strongSelectors) {
    const candidate = await uniqueCandidate(tx, supplier, selector.where, selector.reason);
    if (candidate) strongMatches.push(candidate);
  }
  const strongIds = new Set(strongMatches.map((candidate) => candidate.id));
  if (strongIds.size > 1) {
    throw new BackfillConflict("SUPPLIER_PARTY_IDENTITY_CONFLICT", "Les identifiants forts du fournisseur correspondent à plusieurs tiers différents.");
  }
  if (strongMatches.length) return strongMatches[0];

  return uniqueCandidate(tx, supplier, { normalizedName: normalizeName(supplier.legalName) }, "nom");
}

async function createPartyFromSupplier(tx, supplier) {
  const migrationKey = `supplier:${supplier.id}`;
  const party = await tx.enterpriseBusinessParty.create({
    data: {
      organizationId: supplier.organizationId,
      partyType: expectedPartyType(supplier),
      legalName: supplier.legalName.trim(),
      displayName: supplier.displayName,
      normalizedName: normalizeName(supplier.legalName),
      code: reference("SUP"),
      migrationKey,
      taxIdentifier: supplier.taxIdentifier,
      registrationId: supplier.registrationId,
      primaryEmail: normalizeEmail(supplier.email),
      primaryPhone: supplier.phone?.trim() || null,
      // Supplier suspension is a Procurement state. It must not disable the
      // shared party when the same party is also a customer or partner.
      status: "ACTIVE",
      notes: supplier.notes,
      createdByUserId: supplier.createdByUserId,
    },
  });

  const email = normalizeEmail(supplier.email);
  if (email) {
    await tx.enterpriseBusinessPartyContact.create({
      data: {
        organizationId: supplier.organizationId,
        businessPartyId: party.id,
        contactType: "EMAIL",
        label: "Contact principal",
        value: email,
        normalizedValue: email,
        isPrimary: true,
        createdByUserId: supplier.createdByUserId,
      },
    });
  }
  if (supplier.phone?.trim()) {
    const phone = supplier.phone.trim();
    await tx.enterpriseBusinessPartyContact.create({
      data: {
        organizationId: supplier.organizationId,
        businessPartyId: party.id,
        contactType: "PHONE",
        label: "Téléphone principal",
        value: phone,
        normalizedValue: phone.toLocaleLowerCase("fr"),
        isPrimary: !email,
        createdByUserId: supplier.createdByUserId,
      },
    });
  }
  if (supplier.addressLine?.trim()) {
    await tx.enterpriseBusinessPartyAddress.create({
      data: {
        organizationId: supplier.organizationId,
        businessPartyId: party.id,
        addressType: "PRIMARY",
        label: "Adresse principale",
        line1: supplier.addressLine.trim(),
        city: supplier.city?.trim() || null,
        countryCode: normalizeCountryCode(supplier.country),
        isPrimary: true,
        createdByUserId: supplier.createdByUserId,
      },
    });
  }
  return party;
}

async function upsertSupplierRole(tx, supplier, party) {
  const roleStatus = supplierRoleStatus(supplier.status);
  await tx.enterpriseBusinessPartyRole.upsert({
    where: {
      organizationId_businessPartyId_roleCode: {
        organizationId: supplier.organizationId,
        businessPartyId: party.id,
        roleCode: "SUPPLIER",
      },
    },
    update: { status: roleStatus, archivedAt: null },
    create: {
      organizationId: supplier.organizationId,
      businessPartyId: party.id,
      roleCode: "SUPPLIER",
      status: roleStatus,
      createdByUserId: supplier.createdByUserId,
    },
  });
}

async function convergeSupplier(tx, supplier) {
  const migrationKey = `supplier:${supplier.id}`;
  const storedLink = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId: supplier.organizationId, supplierId: supplier.id },
  });
  if (storedLink) {
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: storedLink.businessPartyId, organizationId: supplier.organizationId, archivedAt: null },
    });
    if (!party) throw new BackfillConflict("SUPPLIER_PARTY_LINK_BROKEN", "Le lien historique pointe vers un tiers indisponible.");
    assertPartyType(party, supplier);
    await upsertSupplierRole(tx, supplier, party);
    if (storedLink.archivedAt) {
      await tx.enterpriseSupplierPartyLink.update({
        where: { id: storedLink.id },
        data: { archivedAt: null, revision: { increment: 1 } },
      });
      return { kind: "reactivated", party };
    }
    return { kind: "existing", party };
  }

  let party = await findCanonicalCandidate(tx, supplier);
  let createdParty = false;
  if (party) {
    const occupied = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId: supplier.organizationId, businessPartyId: party.id },
    });
    if (occupied && occupied.supplierId !== supplier.id) {
      throw new BackfillConflict("SUPPLIER_PARTY_ALREADY_LINKED", "Le tiers correspondant est déjà rattaché à un autre fournisseur.");
    }
  } else {
    party = await createPartyFromSupplier(tx, supplier);
    createdParty = true;
  }

  await upsertSupplierRole(tx, supplier, party);
  await tx.enterpriseSupplierPartyLink.create({
    data: {
      organizationId: supplier.organizationId,
      supplierId: supplier.id,
      businessPartyId: party.id,
      migrationKey,
      createdByUserId: supplier.createdByUserId,
    },
  });

  if (!createdParty) {
    await tx.enterpriseSupplier.update({
      where: { id: supplier.id },
      data: {
        legalName: party.legalName,
        displayName: party.displayName,
        normalizedName: normalizeSupplierName(party.legalName),
        email: party.primaryEmail,
        phone: party.primaryPhone,
        taxIdentifier: party.taxIdentifier,
        registrationId: party.registrationId,
        updatedByUserId: supplier.createdByUserId,
        revision: { increment: 1 },
      },
    });
  }
  return { kind: createdParty ? "created-party" : "matched-party", party };
}

async function main() {
  const activeLinkedSupplierIds = (await prisma.enterpriseSupplierPartyLink.findMany({
    where: { archivedAt: null, ...(organizationId ? { organizationId } : {}) },
    select: { supplierId: true },
  })).map((item) => item.supplierId);
  const suppliers = await prisma.enterpriseSupplier.findMany({
    where: {
      archivedAt: null,
      ...(organizationId ? { organizationId } : {}),
      NOT: { id: { in: activeLinkedSupplierIds } },
    },
    orderBy: [{ organizationId: "asc" }, { legalName: "asc" }],
  });

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", organizationId, candidates: suppliers.length }, null, 2));
  if (!apply) {
    for (const supplier of suppliers.slice(0, 100)) {
      console.log(`[dry-run] ${supplier.organizationId} ${supplier.id} ${supplier.legalName}`);
    }
    if (suppliers.length > 100) console.log(`[dry-run] ${suppliers.length - 100} additional candidate(s) omitted.`);
    return;
  }

  let linked = 0;
  let reactivated = 0;
  let skipped = 0;
  for (const supplier of suppliers) {
    try {
      const result = await prisma.$transaction((tx) => convergeSupplier(tx, supplier));
      if (result.kind === "reactivated") reactivated += 1;
      else if (result.kind !== "existing") linked += 1;
    } catch (error) {
      skipped += 1;
      const code = error instanceof BackfillConflict ? error.code : "UNEXPECTED_BACKFILL_ERROR";
      console.error(`[skip] ${supplier.organizationId} ${supplier.id} ${code}`);
    }
  }
  console.log(JSON.stringify({ linked, reactivated, skipped }, null, 2));
  if (skipped > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "UNEXPECTED_BACKFILL_ERROR");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
