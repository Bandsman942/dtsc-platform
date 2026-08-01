import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  businessPartyCreateSchema,
  businessPartyUpdateSchema,
  catalogItemCreateSchema,
  catalogItemUpdateSchema,
  siteCreateSchema,
  siteUpdateSchema,
  storageLocationCreateSchema,
  storageLocationUpdateSchema,
  catalogCategoryCreateSchema,
  unitOfMeasureCreateSchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
} from "@/lib/enterprise/master-data/schemas";

type BusinessPartyInput = z.infer<typeof businessPartyCreateSchema>;
type BusinessPartyUpdateInput = z.infer<typeof businessPartyUpdateSchema>;
type CatalogItemInput = z.infer<typeof catalogItemCreateSchema>;
type CatalogItemUpdateInput = z.infer<typeof catalogItemUpdateSchema>;
type SiteInput = z.infer<typeof siteCreateSchema>;
type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
type WarehouseInput = z.infer<typeof warehouseCreateSchema>;
type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>;
type StorageLocationCreateInput = z.infer<typeof storageLocationCreateSchema>;
type StorageLocationUpdateInput = z.infer<typeof storageLocationUpdateSchema>;
type CatalogCategoryInput = z.infer<typeof catalogCategoryCreateSchema>;
type UnitOfMeasureInput = z.infer<typeof unitOfMeasureCreateSchema>;

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
    if (input.currency && input.indicativeSalePrice != null) {
      await tx.enterpriseCatalogPrice.create({
        data: {
          organizationId,
          catalogItemId: item.id,
          priceType: "SALE",
          amount: input.indicativeSalePrice,
          currency: input.currency,
          effectiveFrom: new Date(),
          createdByUserId: actorUserId,
        },
      });
    }
    if (input.currency && input.indicativeCost != null) {
      await tx.enterpriseCatalogPrice.create({
        data: {
          organizationId,
          catalogItemId: item.id,
          priceType: "COST",
          amount: input.indicativeCost,
          currency: input.currency,
          effectiveFrom: new Date(),
          createdByUserId: actorUserId,
        },
      });
    }
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

export async function createEnterpriseCatalogCategory(
  organizationId: string,
  actorUserId: string,
  input: CatalogCategoryInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    if (input.parentCategoryId) {
      const parent = await tx.enterpriseCatalogCategory.findFirst({ where: { id: input.parentCategoryId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true } });
      if (!parent) throw new Error("CATALOG_PARENT_CATEGORY_NOT_FOUND");
    }
    const category = await tx.enterpriseCatalogCategory.create({
      data: {
        organizationId,
        parentCategoryId: input.parentCategoryId || null,
        code: input.code || serverCode("CAT"),
        name: input.name,
        description: input.description || null,
        sortOrder: input.sortOrder,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseCatalogCategory", entityId: category.id, eventType: "CATALOG_CATEGORY_CREATED", summary: `Catégorie ${category.name} créée`, actorUserId } });
    return category;
  });
}

export async function createEnterpriseUnitOfMeasure(
  organizationId: string,
  actorUserId: string,
  input: UnitOfMeasureInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    const unit = await tx.enterpriseUnitOfMeasure.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        symbol: input.symbol || null,
        category: input.category,
        decimalScale: input.decimalScale,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseUnitOfMeasure", entityId: unit.id, eventType: "UNIT_OF_MEASURE_CREATED", summary: `Unité ${unit.code} créée`, actorUserId } });
    return unit;
  });
}

export async function createEnterpriseStorageLocation(
  organizationId: string,
  actorUserId: string,
  input: StorageLocationCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertClientOrganization(tx, organizationId);
    const warehouse = await tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true } });
    if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
    if (input.parentLocationId) {
      const parent = await tx.enterpriseStorageLocation.findFirst({ where: { id: input.parentLocationId, organizationId, warehouseId: input.warehouseId, archivedAt: null, status: "ACTIVE" }, select: { id: true } });
      if (!parent) throw new Error("PARENT_STORAGE_LOCATION_NOT_FOUND");
    }
    const location = await tx.enterpriseStorageLocation.create({
      data: {
        organizationId,
        warehouseId: input.warehouseId,
        parentLocationId: input.parentLocationId || null,
        code: input.code || serverCode("LOC"),
        name: input.name,
        locationType: input.locationType,
        barcode: input.barcode || null,
        capacityValue: input.capacityValue ?? null,
        capacityUnit: input.capacityUnit || null,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseStorageLocation", entityId: location.id, eventType: "STORAGE_LOCATION_CREATED", summary: `Emplacement ${location.code} créé`, actorUserId } });
    return location;
  });
}

export async function findEnterpriseBusinessPartyDuplicates(organizationId: string, input: { legalName: string; primaryEmail?: string | null; primaryPhone?: string | null }) {
  const normalizedName = normalizeName(input.legalName);
  return prisma.enterpriseBusinessParty.findMany({
    where: {
      organizationId,
      archivedAt: null,
      OR: [
        { normalizedName },
        ...(input.primaryEmail ? [{ primaryEmail: input.primaryEmail.trim().toLowerCase() }] : []),
        ...(input.primaryPhone ? [{ primaryPhone: input.primaryPhone.trim() }] : []),
      ],
    },
    select: { id: true, code: true, partyType: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}


export async function updateEnterpriseBusinessParty(organizationId: string, partyId: string, actorUserId: string, input: BusinessPartyUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseBusinessParty.findFirst({ where: { id: partyId, organizationId, archivedAt: null } });
    if (!existing) throw new Error("BUSINESS_PARTY_NOT_FOUND");
    const updated = await tx.enterpriseBusinessParty.updateMany({
      where: { id: partyId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}),
        ...(input.primaryEmail !== undefined ? { primaryEmail: input.primaryEmail?.toLocaleLowerCase("fr") || null } : {}),
        ...(input.primaryPhone !== undefined ? { primaryPhone: input.primaryPhone || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseBusinessParty", entityId: partyId, eventType: "BUSINESS_PARTY_UPDATED", summary: `Tiers ${existing.code} modifié`, actorUserId, fromStatus: existing.status, toStatus: input.status || existing.status } });
    return tx.enterpriseBusinessParty.findUniqueOrThrow({ where: { id: partyId }, include: { roles: true, contacts: true, addresses: true } });
  });
}

export async function updateEnterpriseCatalogItem(organizationId: string, itemId: string, actorUserId: string, input: CatalogItemUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseCatalogItem.findFirst({ where: { id: itemId, organizationId, archivedAt: null } });
    if (!existing) throw new Error("CATALOG_ITEM_NOT_FOUND");
    if (input.unitOfMeasureId) {
      const unit = await tx.enterpriseUnitOfMeasure.findFirst({ where: { id: input.unitOfMeasureId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!unit) throw new Error("UNIT_OF_MEASURE_NOT_FOUND");
    }
    if (input.categoryId) {
      const category = await tx.enterpriseCatalogCategory.findFirst({ where: { id: input.categoryId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!category) throw new Error("CATALOG_CATEGORY_NOT_FOUND");
    }
    const updated = await tx.enterpriseCatalogItem.updateMany({
      where: { id: itemId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name, normalizedName: normalizeName(input.name) } : {}),
        ...(input.sku !== undefined ? { sku: input.sku || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
        ...(input.unitOfMeasureId !== undefined ? { unitOfMeasureId: input.unitOfMeasureId } : {}),
        ...(input.indicativeSalePrice !== undefined ? { indicativeSalePrice: input.indicativeSalePrice ?? null } : {}),
        ...(input.indicativeCost !== undefined ? { indicativeCost: input.indicativeCost ?? null } : {}),
        ...(input.currency !== undefined ? { currency: input.currency || null } : {}),
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
        ...(input.taxCode !== undefined ? { taxCode: input.taxCode || null } : {}),
        ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
    if (input.currency && input.indicativeSalePrice !== undefined && input.indicativeSalePrice !== null && Number(input.indicativeSalePrice) !== Number(existing.indicativeSalePrice || 0)) {
      await tx.enterpriseCatalogPrice.updateMany({ where: { organizationId, catalogItemId: itemId, priceType: "SALE", status: "ACTIVE", effectiveUntil: null, archivedAt: null }, data: { effectiveUntil: new Date(), status: "HISTORICAL" } });
      await tx.enterpriseCatalogPrice.create({ data: { organizationId, catalogItemId: itemId, priceType: "SALE", amount: input.indicativeSalePrice, currency: input.currency, effectiveFrom: new Date(), createdByUserId: actorUserId } });
    }
    if (input.currency && input.indicativeCost !== undefined && input.indicativeCost !== null && Number(input.indicativeCost) !== Number(existing.indicativeCost || 0)) {
      await tx.enterpriseCatalogPrice.updateMany({ where: { organizationId, catalogItemId: itemId, priceType: "COST", status: "ACTIVE", effectiveUntil: null, archivedAt: null }, data: { effectiveUntil: new Date(), status: "HISTORICAL" } });
      await tx.enterpriseCatalogPrice.create({ data: { organizationId, catalogItemId: itemId, priceType: "COST", amount: input.indicativeCost, currency: input.currency, effectiveFrom: new Date(), createdByUserId: actorUserId } });
    }
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseCatalogItem", entityId: itemId, eventType: "CATALOG_ITEM_UPDATED", summary: `Article ${existing.code} modifié`, actorUserId, fromStatus: existing.status, toStatus: input.status || existing.status } });
    return tx.enterpriseCatalogItem.findUniqueOrThrow({ where: { id: itemId }, include: { category: true, unitOfMeasure: true, prices: { where: { archivedAt: null }, orderBy: { effectiveFrom: "desc" } } } });
  });
}

export async function updateEnterpriseSite(organizationId: string, siteId: string, actorUserId: string, input: SiteUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseSite.findFirst({ where: { id: siteId, organizationId, archivedAt: null } });
    if (!existing) throw new Error("SITE_NOT_FOUND");
    if (input.managerUserId) { const manager = await tx.organizationMember.findFirst({ where: { organizationId, userId: input.managerUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }); if (!manager) throw new Error("SITE_MANAGER_NOT_MEMBER"); }
    const updated = await tx.enterpriseSite.updateMany({ where: { id: siteId, organizationId, revision: input.revision, archivedAt: null }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.siteType !== undefined ? { siteType: input.siteType } : {}), ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}), ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 || null } : {}), ...(input.city !== undefined ? { city: input.city || null } : {}), ...(input.stateProvince !== undefined ? { stateProvince: input.stateProvince || null } : {}), ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}), ...(input.countryCode !== undefined ? { countryCode: input.countryCode || null } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}), ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId || null } : {}), ...(input.status !== undefined ? { status: input.status } : {}), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseSite", entityId: siteId, eventType: "SITE_UPDATED", summary: `Site ${existing.code} modifié`, actorUserId, fromStatus: existing.status, toStatus: input.status || existing.status } });
    return tx.enterpriseSite.findUniqueOrThrow({ where: { id: siteId } });
  });
}

export async function updateEnterpriseWarehouse(organizationId: string, warehouseId: string, actorUserId: string, input: WarehouseUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseWarehouse.findFirst({ where: { id: warehouseId, organizationId, archivedAt: null } });
    if (!existing) throw new Error("WAREHOUSE_NOT_FOUND");
    if (input.managerUserId) { const manager = await tx.organizationMember.findFirst({ where: { organizationId, userId: input.managerUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }); if (!manager) throw new Error("WAREHOUSE_MANAGER_NOT_MEMBER"); }
    const updated = await tx.enterpriseWarehouse.updateMany({ where: { id: warehouseId, organizationId, revision: input.revision, archivedAt: null }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.warehouseType !== undefined ? { warehouseType: input.warehouseType } : {}), ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId || null } : {}), ...(input.status !== undefined ? { status: input.status } : {}), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseWarehouse", entityId: warehouseId, eventType: "WAREHOUSE_UPDATED", summary: `Entrepôt ${existing.code} modifié`, actorUserId, fromStatus: existing.status, toStatus: input.status || existing.status } });
    return tx.enterpriseWarehouse.findUniqueOrThrow({ where: { id: warehouseId } });
  });
}

export async function updateEnterpriseStorageLocation(organizationId: string, locationId: string, actorUserId: string, input: StorageLocationUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseStorageLocation.findFirst({ where: { id: locationId, organizationId, archivedAt: null } });
    if (!existing) throw new Error("STORAGE_LOCATION_NOT_FOUND");
    if (input.parentLocationId) { const parent = await tx.enterpriseStorageLocation.findFirst({ where: { id: input.parentLocationId, organizationId, warehouseId: existing.warehouseId, archivedAt: null, status: "ACTIVE" }, select: { id: true } }); if (!parent || parent.id === locationId) throw new Error("PARENT_STORAGE_LOCATION_NOT_FOUND"); }
    const updated = await tx.enterpriseStorageLocation.updateMany({ where: { id: locationId, organizationId, revision: input.revision, archivedAt: null }, data: { ...(input.parentLocationId !== undefined ? { parentLocationId: input.parentLocationId || null } : {}), ...(input.name !== undefined ? { name: input.name } : {}), ...(input.code !== undefined ? { code: input.code || existing.code } : {}), ...(input.locationType !== undefined ? { locationType: input.locationType } : {}), ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}), ...(input.capacityValue !== undefined ? { capacityValue: input.capacityValue ?? null } : {}), ...(input.capacityUnit !== undefined ? { capacityUnit: input.capacityUnit || null } : {}), ...(input.status !== undefined ? { status: input.status } : {}), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseStorageLocation", entityId: locationId, eventType: "STORAGE_LOCATION_UPDATED", summary: `Emplacement ${existing.code} modifié`, actorUserId, fromStatus: existing.status, toStatus: input.status || existing.status } });
    return tx.enterpriseStorageLocation.findUniqueOrThrow({ where: { id: locationId } });
  });
}
