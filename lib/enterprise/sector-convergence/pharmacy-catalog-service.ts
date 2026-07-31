import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function unitCode(value: string) {
  const code = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `PH_${code || "UNIT"}`.slice(0, 40);
}

export async function convergePharmacyProduct(
  organizationId: string,
  pharmacyProductId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({
      organizationId,
      sector: "PHARMACY",
      domainCode: "CATALOG",
      flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_CATALOG,
    });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_CATALOG_CONVERGENCE_DISABLED", 409);
  }

  const existing = await prisma.pharmacyProductExtension.findFirst({ where: { organizationId, pharmacyProductId } });
  if (existing) return { extension: existing, idempotent: true };
  const source = await prisma.pharmacyProduct.findFirst({ where: { id: pharmacyProductId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_NOT_FOUND", 404);

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, {
    organizationId,
    sector: "PHARMACY",
    sourceEntityType: "PharmacyProduct",
    sourceEntityId: source.id,
  }, { internalCode: source.internalCode }));

  try {
    const extension = await prisma.$transaction(async (tx) => {
      const alreadyMapped = await tx.pharmacyProductExtension.findFirst({ where: { organizationId, pharmacyProductId: source.id } });
      if (alreadyMapped) return alreadyMapped;
      const current = await tx.pharmacyProduct.findFirst({ where: { id: source.id, organizationId } });
      if (!current) throw new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_NOT_FOUND", 404);

      const code = unitCode(current.stockUnit || current.saleUnit);
      const unit = await tx.enterpriseUnitOfMeasure.upsert({
        where: { organizationId_code: { organizationId, code } },
        update: { status: "ACTIVE", archivedAt: null },
        create: {
          organizationId,
          code,
          name: current.stockUnit || current.saleUnit,
          symbol: (current.stockUnit || current.saleUnit).slice(0, 20),
          category: "QUANTITY",
          createdByUserId: actorUserId,
        },
      });
      const catalog = await tx.enterpriseCatalogItem.create({
        data: {
          organizationId,
          code: `PHP-${current.internalCode}`.slice(0, 80),
          sku: current.barcode || current.internalCode,
          name: current.name,
          normalizedName: normalize(`pharmacy ${current.internalCode} ${current.name}`),
          description: current.shortDescription,
          itemType: "GOODS",
          unitOfMeasureId: unit.id,
          indicativeSalePrice: current.referenceSalePrice,
          indicativeCost: current.referencePurchasePrice,
          currency: current.currency,
          status: current.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
          taxable: Boolean(current.taxRate && current.taxRate.greaterThan(0)),
          trackInventory: current.stockTrackingEnabled,
          createdByUserId: actorUserId,
        },
      });
      if (catalog.trackInventory) {
        await tx.enterpriseInventoryItem.create({ data: { organizationId, catalogItemId: catalog.id, createdByUserId: actorUserId } });
      }
      const created = await tx.pharmacyProductExtension.create({
        data: {
          organizationId,
          pharmacyProductId: current.id,
          catalogItemId: catalog.id,
          historicalKey: `pharmacy-product:${current.id}`,
          createdByUserId: actorUserId,
        },
      });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseCatalogItem", targetEntityId: catalog.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { extension, idempotent: false };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({
      organizationId,
      syncStateId: sync.id,
      status: duplicate ? "AMBIGUOUS" : "FAILED",
      errorCode: duplicate ? "PHARMACY_PRODUCT_MAPPING_AMBIGUOUS" : "PHARMACY_PRODUCT_MAPPING_FAILED",
      requiresManualAction: duplicate,
    });
    throw duplicate ? new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_MAPPING_AMBIGUOUS", 409) : error;
  }
}
