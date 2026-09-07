import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseReference, normalizeEnterpriseName, publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type { leadCanonicalOnboardingSchema, leadCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
type CanonicalLeadOnboardingInput = z.infer<typeof leadCanonicalOnboardingSchema>;
type LegacyLeadCreateInput = z.infer<typeof leadCreateSchema>;

const ACTIVE_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED"] as const;

function normalizeContact(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

async function assertActiveClientOrganization(tx: Tx, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true },
  });
  if (!organization) throw new EnterpriseDomainError("ORGANIZATION_NOT_ACTIVE", 403);
}

async function assertNoActiveLead(tx: Tx, organizationId: string, businessPartyId: string) {
  const existing = await tx.enterpriseLead.findFirst({
    where: {
      organizationId,
      businessPartyId,
      archivedAt: null,
      status: { in: [...ACTIVE_LEAD_STATUSES] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, reference: true },
  });
  if (existing) {
    throw new EnterpriseDomainError("LEAD_ACTIVE_ALREADY_EXISTS", 409);
  }
}

async function commercialParty(tx: Tx, organizationId: string, businessPartyId: string) {
  const party = await tx.enterpriseBusinessParty.findFirst({
    where: {
      id: businessPartyId,
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      roles: {
        some: {
          roleCode: { in: ["PROSPECT", "CUSTOMER"] },
          status: "ACTIVE",
          archivedAt: null,
        },
      },
    },
    include: {
      roles: { where: { status: "ACTIVE", archivedAt: null }, select: { roleCode: true } },
    },
  });
  if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_COMMERCIAL", 409);
  return party;
}

async function duplicatePartyCandidates(
  tx: Tx,
  organizationId: string,
  input: CanonicalLeadOnboardingInput & { mode: "NEW" },
) {
  const party = input.party;
  const email = party.primaryEmail?.trim().toLowerCase() || null;
  const phone = party.primaryPhone?.trim() || null;
  const taxIdentifier = party.taxIdentifier?.trim() || null;
  const registrationId = party.registrationId?.trim() || null;
  const signals: Prisma.EnterpriseBusinessPartyWhereInput[] = [
    { normalizedName: normalizeEnterpriseName(party.legalName) },
    ...(email ? [{ primaryEmail: { equals: email, mode: "insensitive" as const } }] : []),
    ...(phone ? [{ primaryPhone: phone }] : []),
    ...(taxIdentifier ? [{ taxIdentifier }] : []),
    ...(registrationId ? [{ registrationId }] : []),
  ];
  return tx.enterpriseBusinessParty.findMany({
    where: { organizationId, archivedAt: null, OR: signals },
    orderBy: { updatedAt: "desc" },
    take: 2,
    select: { id: true, code: true },
  });
}

async function createProspectPartyTx(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  input: CanonicalLeadOnboardingInput & { mode: "NEW" },
) {
  const candidates = await duplicatePartyCandidates(tx, organizationId, input);
  if (candidates.length) {
    throw new EnterpriseDomainError("LEAD_CANONICAL_PARTY_REQUIRES_SELECTION", 409);
  }

  const source = input.party;
  const legalName = source.legalName.trim().replace(/\s+/g, " ");
  const party = await tx.enterpriseBusinessParty.create({
    data: {
      organizationId,
      partyType: source.partyType,
      legalName,
      displayName: source.displayName || null,
      normalizedName: normalizeEnterpriseName(legalName),
      code: enterpriseReference(source.partyType === "PERSON" ? "PER" : "ORG"),
      taxIdentifier: source.taxIdentifier || null,
      registrationId: source.registrationId || null,
      primaryEmail: source.primaryEmail?.toLocaleLowerCase("fr") || null,
      primaryPhone: source.primaryPhone || null,
      notes: source.notes || null,
      createdByUserId: actorUserId,
      roles: {
        create: [{ roleCode: "PROSPECT", createdByUserId: actorUserId }],
      },
      contacts: {
        create: source.contacts.map((contact, index) => ({
          contactType: contact.contactType,
          label: contact.label || null,
          value: contact.value,
          normalizedValue: normalizeContact(contact.value),
          isPrimary: contact.isPrimary || index === 0,
          createdByUserId: actorUserId,
        })),
      },
      addresses: {
        create: source.addresses.map((address, index) => ({
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
    include: { roles: true },
  });

  await tx.enterpriseOperationalEvent.create({
    data: {
      organizationId,
      entityType: "EnterpriseBusinessParty",
      entityId: party.id,
      eventType: "BUSINESS_PARTY_CREATED",
      summary: `Tiers ${party.code} créé`,
      actorUserId,
      metadataJson: { roles: ["PROSPECT"], source: "CRM_PIPELINE" },
    },
  });
  return party;
}

async function createLeadForPartyTx(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  party: Awaited<ReturnType<typeof commercialParty>> | Awaited<ReturnType<typeof createProspectPartyTx>>,
  input: CanonicalLeadOnboardingInput["lead"],
) {
  await assertNoActiveLead(tx, organizationId, party.id);
  const lead = await tx.enterpriseLead.create({
    data: {
      organizationId,
      reference: enterpriseReference("LEAD"),
      partyType: party.partyType,
      legalName: party.legalName,
      displayName: party.displayName,
      normalizedName: normalizeEnterpriseName(party.legalName),
      email: party.primaryEmail?.toLocaleLowerCase("fr") || null,
      phone: party.primaryPhone || null,
      companyName: input.companyName || null,
      source: input.source || null,
      ownerUserId: input.ownerUserId || actorUserId,
      departmentId: input.departmentId || null,
      businessPartyId: party.id,
      expectedValue: input.expectedValue ?? null,
      currency: input.currency || null,
      notes: input.notes || null,
      nextAction: input.nextAction || null,
      nextActionAt: input.nextActionAt || null,
      createdByUserId: actorUserId,
    },
  });

  await publishEnterpriseEvent(tx, {
    organizationId,
    entityType: "EnterpriseLead",
    entityId: lead.id,
    eventType: "LEAD_CREATED",
    summary: `Lead ${lead.reference} créé`,
    actorUserId,
    toStatus: lead.status,
    metadataJson: { businessPartyId: party.id, canonicalParty: true },
  });
  return lead;
}

export async function createCanonicalLeadOnboarding(
  organizationId: string,
  actorUserId: string,
  input: CanonicalLeadOnboardingInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = input.mode === "EXISTING"
      ? await commercialParty(tx, organizationId, input.businessPartyId)
      : await createProspectPartyTx(tx, organizationId, actorUserId, input);
    const lead = await createLeadForPartyTx(tx, organizationId, actorUserId, party, input.lead);
    return { party, lead };
  });
}

export async function createCanonicalLeadFromLegacyInput(
  organizationId: string,
  actorUserId: string,
  input: LegacyLeadCreateInput,
) {
  const lead = {
    companyName: input.companyName || null,
    source: input.source || null,
    ownerUserId: input.ownerUserId || null,
    departmentId: input.departmentId || null,
    expectedValue: input.expectedValue ?? null,
    currency: input.currency || null,
    notes: input.notes || null,
    nextAction: input.nextAction || null,
    nextActionAt: input.nextActionAt || null,
  };

  const result = input.businessPartyId
    ? await createCanonicalLeadOnboarding(organizationId, actorUserId, {
        mode: "EXISTING",
        businessPartyId: input.businessPartyId,
        lead,
      })
    : await createCanonicalLeadOnboarding(organizationId, actorUserId, {
        mode: "NEW",
        party: {
          partyType: input.partyType,
          legalName: input.legalName,
          displayName: input.displayName || null,
          taxIdentifier: null,
          registrationId: null,
          primaryEmail: input.email || null,
          primaryPhone: input.phone || null,
          contacts: [
            ...(input.email ? [{ contactType: "EMAIL" as const, label: "Contact principal", value: input.email, isPrimary: true }] : []),
            ...(input.phone ? [{ contactType: "PHONE" as const, label: "Téléphone principal", value: input.phone, isPrimary: !input.email }] : []),
          ],
          addresses: [],
          notes: null,
        },
        lead,
      });
  return result.lead;
}
