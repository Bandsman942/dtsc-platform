import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  businessPartyCreateSchema,
  catalogItemCreateSchema,
  siteCreateSchema,
  warehouseCreateSchema,
} from "@/lib/enterprise/master-data/schemas";

type BusinessPartyInput = z.infer<typeof businessPartyCreateSchema>;
type CatalogItemInput = z.infer<typeof catalogItemCreateSchema>;
type SiteInput = z.infer<typeof siteCreateSchema>;
type WarehouseInput = z.infer<typeof warehouseCreateSchema>;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function normalizeContact(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function serverCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function assertClientOrganization(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_ACTIVE");
}

export async function createEnterpriseBusinessParty(organizationId: string, actorUserId: string, input: BusinessPartyInput) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    const legalName = input.legalName.trim().replace(/\s+/g, " ");
    const code = serverCode(input.partyType === "PERSON" ? "PER" : "ORG");
    const party = await tx.enterpriseBusinessParty.create({
      data: {
        organizationId,
        partyType: input.partyType,
        legalName,
        displayName: input.displayName || null,
        normalizedName: normalizeName(legalName),
        code,
        taxIdentifier: input.taxIdentifier || null,
        registrationId: input.registrationId || null,
        primaryEmail: input.primaryEmail?.toLocaleLowerCase("fr") || null,
        primaryPhone: input.primaryPhone || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
        roles: {
          create: [...new Set(input.roles)].map((roleCode) => ({
            organizationId,
            roleCode,
            createdByUserId: actorUserId,
          })),
        },
        contacts: {
          create: input.contacts.map((contact, index) => ({
            organizationId,
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
            organizationId,
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
    await tx.enterpriseOperationalEvent.create({
      data: {
        organizationId,
        entityType: "EnterpriseBusinessParty",
        entityId: party.id,
        eventType: "BUSINESS_PARTY_CREATED",
        summary: `Tiers ${party.code} créé`,
        actorUserId,
        metadataJson: { roles: input.roles },
      },
    });
    return party;
  });
}

export async function createEnterpriseCatalogItem(organizationId: string, actorUserId: string, input: CatalogItemInput) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    const [unit, category] = await Promise.all([
      tx.enterpriseUnitOfMeasure.findFirst({ where: { id: input.unitOfMeasureId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      input.categoryId
        ? tx.enterpriseCatalogCategory.findFirst({ where: { id: input.categoryId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!unit) throw new Error("UNIT_OF_MEASURE_NOT_FOUND");
    if (input.categoryId && !category) throw new Error("CATALOG_CATEGORY_NOT_FOUND");
    const item = await tx.enterpriseCatalogItem.create({
      data: {
        organizationId,
        code: serverCode("ITM"),
        sku: input.sku || null,
        name: input.name.trim().replace(/\s+/g, " "),
        normalizedName: normalizeName(input.name),
        description: input.description || null,
        itemType: input.itemType,
        categoryId: input.categoryId || null,
        unitOfMeasureId: input.unitOfMeasureId,
        indicativeSalePrice: input.indicativeSalePrice ?? null,
        indicativeCost: input.indicativeCost ?? null,
        currency: input.currency || null,
        taxable: input.taxable,
        taxCode: input.taxCode || null,
        trackInventory: input.trackInventory,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
    if (input.trackInventory) {
      await tx.enterpriseInventoryItem.create({
        data: {
          organizationId,
          catalogItemId: item.id,
          createdByUserId: actorUserId,
        },
      });
    }
    await tx.enterpriseOperationalEvent.create({
      data: {
        organizationId,
        entityType: "EnterpriseCatalogItem",
        entityId: item.id,
        eventType: "CATALOG_ITEM_CREATED",
        summary: `Article ${item.code} créé`,
        actorUserId,
        metadataJson: { itemType: item.itemType, trackInventory: item.trackInventory },
      },
    });
    return item;
  });
}

export async function createEnterpriseSite(organizationId: string, actorUserId: string, input: SiteInput) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    if (input.managerUserId) {
      const manager = await tx.organizationMember.findFirst({
        where: { organizationId, userId: input.managerUserId, status: "ACTIVE", removedAt: null },
        select: { id: true },
      });
      if (!manager) throw new Error("SITE_MANAGER_NOT_MEMBER");
    }
    const site = await tx.enterpriseSite.create({
      data: {
        organizationId,
        code: serverCode("SITE"),
        name: input.name,
        siteType: input.siteType,
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        city: input.city || null,
        stateProvince: input.stateProvince || null,
        postalCode: input.postalCode || null,
        countryCode: input.countryCode || null,
        timezone: input.timezone || null,
        managerUserId: input.managerUserId || null,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({
      data: { organizationId, entityType: "EnterpriseSite", entityId: site.id, eventType: "SITE_CREATED", summary: `Site ${site.code} créé`, actorUserId },
    });
    return site;
  });
}

export async function createEnterpriseWarehouse(organizationId: string, actorUserId: string, input: WarehouseInput) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    const site = await tx.enterpriseSite.findFirst({ where: { organizationId, id: input.siteId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!site) throw new Error("SITE_NOT_FOUND");
    if (input.managerUserId) {
      const manager = await tx.organizationMember.findFirst({ where: { organizationId, userId: input.managerUserId, status: "ACTIVE", removedAt: null }, select: { id: true } });
      if (!manager) throw new Error("WAREHOUSE_MANAGER_NOT_MEMBER");
    }
    const warehouse = await tx.enterpriseWarehouse.create({
      data: {
        organizationId,
        siteId: input.siteId,
        code: serverCode("WH"),
        name: input.name,
        warehouseType: input.warehouseType,
        managerUserId: input.managerUserId || null,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({
      data: { organizationId, entityType: "EnterpriseWarehouse", entityId: warehouse.id, eventType: "WAREHOUSE_CREATED", summary: `Entrepôt ${warehouse.code} créé`, actorUserId },
    });
    return warehouse;
  });
}
