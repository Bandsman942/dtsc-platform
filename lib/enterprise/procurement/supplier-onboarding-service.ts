import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { businessPartyCreateSchema } from "@/lib/enterprise/master-data/schemas";
import { ENTERPRISE_SUPPLIER_STATUSES } from "@/lib/enterprise/procurement/constants";
import { normalizeEnterpriseSupplierName } from "@/lib/enterprise/procurement/supplier-normalization";
import { supplierRoleStatus } from "@/lib/enterprise/procurement/supplier-party-sync";
import { addEnterpriseOperationalEvent, nullable, requireActiveEnterpriseMember } from "@/lib/enterprise/procurement/shared";
import { prisma } from "@/lib/prisma";

const optionalText = (max = 5000) => z.string().trim().max(max).optional().or(z.literal(""));
const supplierExtensionSchema = z.object({
  category: optionalText(120),
  status: z.enum(ENTERPRISE_SUPPLIER_STATUSES).default("PROSPECT"),
  website: z.string().trim().url().max(500).optional().or(z.literal("")),
});

const canonicalPartyInputSchema = businessPartyCreateSchema.omit({ roles: true });

export const enterpriseSupplierOnboardingSchema = z.discriminatedUnion("mode", [
  supplierExtensionSchema.extend({
    mode: z.literal("EXISTING"),
    businessPartyId: z.string().trim().min(1).max(180),
  }),
  supplierExtensionSchema.extend({
    mode: z.literal("NEW"),
    party: canonicalPartyInputSchema,
  }),
]);

export type EnterpriseSupplierOnboardingInput = z.infer<typeof enterpriseSupplierOnboardingSchema>;
type Tx = Prisma.TransactionClient;
type CanonicalPartyInput = z.infer<typeof canonicalPartyInputSchema>;

function canonicalCode(partyType: CanonicalPartyInput["partyType"]) {
  const prefix = partyType === "PERSON" ? "PER" : "ORG";
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function normalizePartyName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function normalizeContact(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("fr") || null;
}

async function assertNoCanonicalDuplicate(tx: Tx, organizationId: string, input: CanonicalPartyInput) {
  const selectors: Prisma.EnterpriseBusinessPartyWhereInput[] = [
    { normalizedName: normalizePartyName(input.legalName) },
  ];
  if (input.taxIdentifier) selectors.push({ taxIdentifier: input.taxIdentifier });
  if (input.registrationId) selectors.push({ registrationId: input.registrationId });
  if (input.primaryEmail) selectors.push({ primaryEmail: normalizedEmail(input.primaryEmail) });

  const candidate = await tx.enterpriseBusinessParty.findFirst({
    where: { organizationId, archivedAt: null, OR: selectors },
    select: { id: true, partyType: true, legalName: true, displayName: true },
  });
  if (!candidate) return;
  throw new EnterpriseCoreV2Error(
    "Un tiers correspondant existe déjà. Choisissez « Utiliser un tiers existant » pour éviter de créer un doublon fournisseur.",
    409,
    "SUPPLIER_PARTY_ALREADY_EXISTS",
  );
}

async function assertSupplierSnapshotAvailable(tx: Tx, organizationId: string, normalizedName: string) {
  const existing = await tx.enterpriseSupplier.findFirst({
    where: { organizationId, normalizedName },
    select: { id: true, archivedAt: true },
  });
  if (!existing) return;
  throw new EnterpriseCoreV2Error(
    existing.archivedAt
      ? "Un fournisseur historique porte déjà cette identité. Restaurez ou corrigez cette fiche au lieu d’en créer une seconde."
      : "Ce fournisseur existe déjà. Ouvrez sa fiche existante au lieu de la recréer.",
    409,
    "SUPPLIER_ALREADY_EXISTS",
  );
}

async function createCanonicalPartyTx(tx: Tx, organizationId: string, actorUserId: string, input: CanonicalPartyInput, supplierStatus: string) {
  await assertNoCanonicalDuplicate(tx, organizationId, input);
  const legalName = input.legalName.trim().replace(/\s+/g, " ");
  const party = await tx.enterpriseBusinessParty.create({
    data: {
      organizationId,
      partyType: input.partyType,
      legalName,
      displayName: input.displayName || null,
      normalizedName: normalizePartyName(legalName),
      code: canonicalCode(input.partyType),
      taxIdentifier: input.taxIdentifier || null,
      registrationId: input.registrationId || null,
      primaryEmail: normalizedEmail(input.primaryEmail),
      primaryPhone: input.primaryPhone || null,
      status: "ACTIVE",
      notes: input.notes || null,
      createdByUserId: actorUserId,
      roles: {
        create: [{ roleCode: "SUPPLIER", status: supplierRoleStatus(supplierStatus), createdByUserId: actorUserId }],
      },
      contacts: {
        create: input.contacts.map((contact, index) => ({
          contactType: contact.contactType,
          label: contact.label || null,
          value: contact.value,
          normalizedValue: normalizeContact(contact.value),
          isPrimary: contact.isPrimary || index === 0,
          createdByUserId: actorUserId,
        })),
      },
      addresses: {
        create: input.addresses.map((address, index) => ({
          addressType: address.addressType,
          label: address.label || null,
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city || null,
          stateProvince: address.stateProvince || null,
          postalCode: address.postalCode || null,
          countryCode: address.countryCode || null,
          isPrimary: address.isPrimary || index === 0,
          createdByUserId: actorUserId,
        })),
      },
    },
    include: { roles: true, contacts: true, addresses: true },
  });
  await addEnterpriseOperationalEvent(tx, {
    organizationId,
    entityType: "EnterpriseBusinessParty",
    entityId: party.id,
    eventType: "BUSINESS_PARTY_CREATED",
    summary: `Tiers ${party.code} créé depuis Fournisseurs et achats.`,
    actorUserId,
    metadata: { roles: ["SUPPLIER"], sourceModule: "SUPPLIERS_PURCHASES" },
  });
  return party;
}

async function loadExistingParty(tx: Tx, organizationId: string, businessPartyId: string) {
  const party = await tx.enterpriseBusinessParty.findFirst({
    where: { id: businessPartyId, organizationId, archivedAt: null, status: "ACTIVE" },
    include: {
      roles: { where: { archivedAt: null } },
      contacts: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      addresses: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });
  if (!party) {
    throw new EnterpriseCoreV2Error(
      "Le tiers sélectionné n’est plus disponible dans cette entreprise. Actualisez la liste puis choisissez une fiche active.",
      404,
      "SUPPLIER_PARTY_NOT_FOUND",
    );
  }
  const occupied = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId, businessPartyId: party.id },
    select: { supplierId: true, archivedAt: true },
  });
  if (occupied) {
    throw new EnterpriseCoreV2Error(
      occupied.archivedAt
        ? "Ce tiers possède déjà une relation fournisseur historique. Restaurez la fiche existante au lieu d’en créer une seconde."
        : "Ce tiers est déjà un fournisseur. Ouvrez sa fiche existante.",
      409,
      "SUPPLIER_PARTY_ALREADY_LINKED",
    );
  }
  return party;
}

async function createSupplierSnapshotTx(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  party: {
    id: string;
    partyType: string;
    legalName: string;
    displayName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    taxIdentifier: string | null;
    registrationId: string | null;
    notes: string | null;
    addresses: Array<{ line1: string; city: string | null; countryCode: string | null }>;
  },
  extension: { category?: string; status: string; website?: string },
) {
  const normalizedName = normalizeEnterpriseSupplierName(party.legalName);
  await assertSupplierSnapshotAvailable(tx, organizationId, normalizedName);
  const address = party.addresses[0] || null;
  const supplier = await tx.enterpriseSupplier.create({
    data: {
      organizationId,
      legalName: party.legalName,
      displayName: party.displayName,
      normalizedName,
      supplierType: party.partyType,
      category: nullable(extension.category),
      status: extension.status,
      email: party.primaryEmail,
      phone: party.primaryPhone,
      website: nullable(extension.website),
      addressLine: address?.line1 || null,
      city: address?.city || null,
      country: address?.countryCode || null,
      taxIdentifier: party.taxIdentifier,
      registrationId: party.registrationId,
      notes: party.notes,
      createdByUserId: actorUserId,
    },
  });

  await tx.enterpriseBusinessPartyRole.upsert({
    where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER" } },
    update: { status: supplierRoleStatus(extension.status), archivedAt: null },
    create: { organizationId, businessPartyId: party.id, roleCode: "SUPPLIER", status: supplierRoleStatus(extension.status), createdByUserId: actorUserId },
  });

  const link = await tx.enterpriseSupplierPartyLink.create({
    data: {
      organizationId,
      supplierId: supplier.id,
      businessPartyId: party.id,
      migrationKey: `supplier:${supplier.id}`,
      createdByUserId: actorUserId,
    },
  });

  await addEnterpriseOperationalEvent(tx, {
    organizationId,
    entityType: "EnterpriseSupplier",
    entityId: supplier.id,
    eventType: "ENTERPRISE_SUPPLIER_CREATED",
    summary: "Fournisseur créé à partir du tiers canonique.",
    actorUserId,
    toStatus: supplier.status,
    metadata: { businessPartyId: party.id, supplierPartyLinkId: link.id, sourceModule: "SUPPLIERS_PURCHASES" },
  });

  return { supplier, link };
}

export async function onboardEnterpriseSupplier(organizationId: string, actorUserId: string, input: EnterpriseSupplierOnboardingInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const party = input.mode === "EXISTING"
      ? await loadExistingParty(tx, organizationId, input.businessPartyId)
      : await createCanonicalPartyTx(tx, organizationId, actorUserId, input.party, input.status);

    const { supplier, link } = await createSupplierSnapshotTx(tx, organizationId, actorUserId, party, input);
    return { supplier, party, link };
  });
}
