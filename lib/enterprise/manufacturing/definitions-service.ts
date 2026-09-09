import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ManufacturingConflictError, ManufacturingDomainError } from "@/lib/enterprise/manufacturing/errors";
import {
  assertActiveManufacturingMember,
  assertManufacturingOrganization,
  manufacturingDecimal,
  manufacturingNullable,
  requireManufacturingAsset,
  requireManufacturingCatalogItem,
  requireManufacturingInventoryItem,
  requireManufacturingSite,
  requireManufacturingWarehouse,
  withManufacturingSerializable,
} from "@/lib/enterprise/manufacturing/shared";
import type {
  manufacturingBomCreateSchema,
  manufacturingConfigurationSchema,
  manufacturingDefinitionActionSchema,
  manufacturingRoutingCreateSchema,
  manufacturingWorkCenterCreateSchema,
  manufacturingWorkCenterUpdateSchema,
} from "@/lib/enterprise/manufacturing/validators";
import { prisma } from "@/lib/prisma";

type ConfigurationInput = z.infer<typeof manufacturingConfigurationSchema>;
type WorkCenterCreateInput = z.infer<typeof manufacturingWorkCenterCreateSchema>;
type WorkCenterUpdateInput = z.infer<typeof manufacturingWorkCenterUpdateSchema>;
type BomCreateInput = z.infer<typeof manufacturingBomCreateSchema>;
type RoutingCreateInput = z.infer<typeof manufacturingRoutingCreateSchema>;
type DefinitionActionInput = z.infer<typeof manufacturingDefinitionActionSchema>;

export async function getManufacturingConfiguration(organizationId: string) {
  return prisma.enterpriseManufacturingConfiguration.findUnique({ where: { organizationId } });
}

export async function saveManufacturingConfiguration(organizationId: string, actorUserId: string, input: ConfigurationInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const materialWarehouseId = manufacturingNullable(input.defaultMaterialWarehouseId);
    const outputWarehouseId = manufacturingNullable(input.defaultOutputWarehouseId);
    if (materialWarehouseId) await requireManufacturingWarehouse(tx, organizationId, materialWarehouseId);
    if (outputWarehouseId) await requireManufacturingWarehouse(tx, organizationId, outputWarehouseId);
    return tx.enterpriseManufacturingConfiguration.upsert({
      where: { organizationId },
      update: {
        defaultMaterialWarehouseId: materialWarehouseId,
        defaultOutputWarehouseId: outputWarehouseId,
        qualityRequiredByDefault: input.qualityRequiredByDefault,
        allowOverproduction: input.allowOverproduction,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
      create: {
        organizationId,
        defaultMaterialWarehouseId: materialWarehouseId,
        defaultOutputWarehouseId: outputWarehouseId,
        qualityRequiredByDefault: input.qualityRequiredByDefault,
        allowOverproduction: input.allowOverproduction,
        createdByUserId: actorUserId,
      },
    });
  });
}

export async function listManufacturingWorkCenters(organizationId: string) {
  return prisma.enterpriseManufacturingWorkCenter.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function createManufacturingWorkCenter(organizationId: string, actorUserId: string, input: WorkCenterCreateInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const site = await requireManufacturingSite(tx, organizationId, input.siteId);
    const asset = await requireManufacturingAsset(tx, organizationId, input.assetId);
    if (site && asset?.siteId && asset.siteId !== site.id) {
      throw new ManufacturingDomainError("L’équipement sélectionné est rattaché à un autre site.", 409, "MANUFACTURING_WORK_CENTER_ASSET_SITE_MISMATCH");
    }
    return tx.enterpriseManufacturingWorkCenter.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        description: manufacturingNullable(input.description),
        siteId: site?.id || asset?.siteId || null,
        assetId: asset?.id || null,
        status: input.status,
        capacityPerDay: input.capacityPerDay == null ? null : manufacturingDecimal(input.capacityPerDay),
        capacityUnit: manufacturingNullable(input.capacityUnit),
        costRate: input.costRate == null ? null : manufacturingDecimal(input.costRate, 2),
        currency: manufacturingNullable(input.currency)?.toUpperCase() || null,
        createdByUserId: actorUserId,
      },
    });
  });
}

export async function updateManufacturingWorkCenter(organizationId: string, workCenterId: string, actorUserId: string, input: WorkCenterUpdateInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseManufacturingWorkCenter.findFirst({ where: { id: workCenterId, organizationId, archivedAt: null } });
    if (!existing) throw new ManufacturingDomainError("Centre de travail introuvable.", 404, "MANUFACTURING_WORK_CENTER_NOT_FOUND");
    const site = input.siteId !== undefined ? await requireManufacturingSite(tx, organizationId, input.siteId) : null;
    const asset = input.assetId !== undefined ? await requireManufacturingAsset(tx, organizationId, input.assetId) : null;
    const resolvedSiteId = input.siteId !== undefined ? site?.id || asset?.siteId || null : existing.siteId;
    const resolvedAssetId = input.assetId !== undefined ? asset?.id || null : existing.assetId;
    if (resolvedSiteId && asset?.siteId && asset.siteId !== resolvedSiteId) {
      throw new ManufacturingDomainError("L’équipement sélectionné est rattaché à un autre site.", 409, "MANUFACTURING_WORK_CENTER_ASSET_SITE_MISMATCH");
    }
    const updated = await tx.enterpriseManufacturingWorkCenter.updateMany({
      where: { id: existing.id, organizationId, revision: input.revision, archivedAt: null },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: manufacturingNullable(input.description) } : {}),
        ...(input.siteId !== undefined ? { siteId: resolvedSiteId } : {}),
        ...(input.assetId !== undefined ? { assetId: resolvedAssetId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.capacityPerDay !== undefined ? { capacityPerDay: input.capacityPerDay == null ? null : manufacturingDecimal(input.capacityPerDay) } : {}),
        ...(input.capacityUnit !== undefined ? { capacityUnit: manufacturingNullable(input.capacityUnit) } : {}),
        ...(input.costRate !== undefined ? { costRate: input.costRate == null ? null : manufacturingDecimal(input.costRate, 2) } : {}),
        ...(input.currency !== undefined ? { currency: manufacturingNullable(input.currency)?.toUpperCase() || null } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ManufacturingConflictError();
    return tx.enterpriseManufacturingWorkCenter.findFirstOrThrow({ where: { id: existing.id, organizationId } });
  });
}

async function assertBomCatalog(tx: Prisma.TransactionClient, organizationId: string, input: BomCreateInput) {
  const output = await requireManufacturingCatalogItem(tx, organizationId, input.catalogItemId, { inventoryTracked: true });
  await requireManufacturingInventoryItem(tx, organizationId, output.id);
  const uniqueComponentIds = [...new Set(input.lines.map((line) => line.catalogItemId))];
  if (uniqueComponentIds.length !== input.lines.length) {
    throw new ManufacturingDomainError("Chaque composant ne peut apparaître qu’une fois dans cette version de nomenclature.", 409, "MANUFACTURING_BOM_DUPLICATE_COMPONENT");
  }
  for (const catalogItemId of uniqueComponentIds) {
    await requireManufacturingCatalogItem(tx, organizationId, catalogItemId, { inventoryTracked: true });
    await requireManufacturingInventoryItem(tx, organizationId, catalogItemId);
  }
  return output;
}

export async function listManufacturingBoms(organizationId: string) {
  return prisma.enterpriseBillOfMaterial.findMany({
    where: { organizationId, archivedAt: null },
    include: { lines: { orderBy: { sequence: "asc" } } },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function createManufacturingBom(organizationId: string, actorUserId: string, input: BomCreateInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    await assertBomCatalog(tx, organizationId, input);
    return tx.enterpriseBillOfMaterial.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        catalogItemId: input.catalogItemId,
        version: input.version,
        outputQuantity: manufacturingDecimal(input.outputQuantity),
        status: "DRAFT",
        effectiveFrom: input.effectiveFrom || null,
        effectiveUntil: input.effectiveUntil || null,
        notes: manufacturingNullable(input.notes),
        createdByUserId: actorUserId,
        lines: {
          create: input.lines.map((line, index) => ({
            organizationId,
            catalogItemId: line.catalogItemId,
            quantity: manufacturingDecimal(line.quantity),
            scrapRate: manufacturingDecimal(line.scrapRate, 4),
            issueMethod: line.issueMethod,
            sequence: index + 1,
            notes: manufacturingNullable(line.notes),
          })),
        },
      },
      include: { lines: { orderBy: { sequence: "asc" } } },
    });
  });
}

export async function changeManufacturingBomStatus(organizationId: string, bomId: string, actorUserId: string, input: DefinitionActionInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const bom = await tx.enterpriseBillOfMaterial.findFirst({ where: { id: bomId, organizationId, archivedAt: null }, include: { lines: true } });
    if (!bom) throw new ManufacturingDomainError("Nomenclature introuvable.", 404, "MANUFACTURING_BOM_NOT_FOUND");
    const target = input.action === "ACTIVATE" ? "ACTIVE" : "RETIRED";
    if (input.action === "ACTIVATE" && !bom.lines.length) throw new ManufacturingDomainError("Une nomenclature vide ne peut pas être activée.", 409, "MANUFACTURING_BOM_EMPTY");
    if (input.action === "ACTIVATE") {
      await tx.enterpriseBillOfMaterial.updateMany({
        where: { organizationId, catalogItemId: bom.catalogItemId, status: "ACTIVE", id: { not: bom.id }, archivedAt: null },
        data: { status: "RETIRED", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
    }
    const updated = await tx.enterpriseBillOfMaterial.updateMany({
      where: { id: bom.id, organizationId, revision: input.revision, archivedAt: null },
      data: { status: target, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ManufacturingConflictError();
    return tx.enterpriseBillOfMaterial.findFirstOrThrow({ where: { id: bom.id, organizationId }, include: { lines: { orderBy: { sequence: "asc" } } } });
  });
}

export async function listManufacturingRoutings(organizationId: string) {
  return prisma.enterpriseManufacturingRouting.findMany({
    where: { organizationId, archivedAt: null },
    include: { operations: { orderBy: { sequence: "asc" }, include: { workCenter: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createManufacturingRouting(organizationId: string, actorUserId: string, input: RoutingCreateInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const catalogItemId = manufacturingNullable(input.catalogItemId);
    if (catalogItemId) await requireManufacturingCatalogItem(tx, organizationId, catalogItemId, { inventoryTracked: true });
    const workCenterIds = [...new Set(input.operations.map((operation) => manufacturingNullable(operation.workCenterId)).filter((value): value is string => Boolean(value)))];
    if (workCenterIds.length) {
      const resolved = await tx.enterpriseManufacturingWorkCenter.findMany({
        where: { organizationId, id: { in: workCenterIds }, archivedAt: null, status: "ACTIVE" },
        select: { id: true },
      });
      if (resolved.length !== workCenterIds.length) throw new ManufacturingDomainError("Une opération référence un centre de travail invalide ou inactif.", 400, "MANUFACTURING_ROUTING_WORK_CENTER_INVALID");
    }
    const codes = input.operations.map((operation) => operation.code);
    if (new Set(codes).size !== codes.length) throw new ManufacturingDomainError("Les codes d’opération doivent être uniques dans une gamme.", 409, "MANUFACTURING_ROUTING_OPERATION_DUPLICATE");
    return tx.enterpriseManufacturingRouting.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        description: manufacturingNullable(input.description),
        catalogItemId,
        version: input.version,
        status: "DRAFT",
        createdByUserId: actorUserId,
        operations: {
          create: input.operations.map((operation, index) => ({
            organizationId,
            sequence: index + 1,
            code: operation.code,
            name: operation.name,
            workCenterId: manufacturingNullable(operation.workCenterId),
            setupMinutes: operation.setupMinutes,
            standardMinutes: operation.standardMinutes || null,
            requiresQualityCheck: operation.requiresQualityCheck,
            instructions: manufacturingNullable(operation.instructions),
          })),
        },
      },
      include: { operations: { orderBy: { sequence: "asc" }, include: { workCenter: true } } },
    });
  });
}

export async function changeManufacturingRoutingStatus(organizationId: string, routingId: string, actorUserId: string, input: DefinitionActionInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const routing = await tx.enterpriseManufacturingRouting.findFirst({ where: { id: routingId, organizationId, archivedAt: null }, include: { operations: true } });
    if (!routing) throw new ManufacturingDomainError("Gamme de production introuvable.", 404, "MANUFACTURING_ROUTING_NOT_FOUND");
    const target = input.action === "ACTIVATE" ? "ACTIVE" : "RETIRED";
    if (input.action === "ACTIVATE" && !routing.operations.length) throw new ManufacturingDomainError("Une gamme vide ne peut pas être activée.", 409, "MANUFACTURING_ROUTING_EMPTY");
    if (input.action === "ACTIVATE") {
      await tx.enterpriseManufacturingRouting.updateMany({
        where: { organizationId, code: routing.code, status: "ACTIVE", id: { not: routing.id }, archivedAt: null },
        data: { status: "RETIRED", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
    }
    const updated = await tx.enterpriseManufacturingRouting.updateMany({
      where: { id: routing.id, organizationId, revision: input.revision, archivedAt: null },
      data: { status: target, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ManufacturingConflictError();
    return tx.enterpriseManufacturingRouting.findFirstOrThrow({ where: { id: routing.id, organizationId }, include: { operations: { orderBy: { sequence: "asc" }, include: { workCenter: true } } } });
  });
}
