import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export async function convergeHealthBillingService(
  organizationId: string,
  healthBillingServiceCatalogId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({
      organizationId,
      sector: "HEALTH_CARE",
      domainCode: "SERVICE_CATALOG",
      flag: SECTOR_CONVERGENCE_FLAGS.HEALTH_SERVICE_CATALOG,
    });
    if (!enabled) throw new EnterpriseSectorConvergenceError("HEALTH_SERVICE_CATALOG_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.healthServiceCatalogExtension.findFirst({ where: { organizationId, healthBillingServiceCatalogId } });
  if (existing) return { extension: existing, idempotent: true };
  const source = await prisma.healthBillingServiceCatalog.findFirst({ where: { id: healthBillingServiceCatalogId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("HEALTH_BILLING_SERVICE_NOT_FOUND", 404);

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, {
    organizationId,
    sector: "HEALTH_CARE",
    sourceEntityType: "HealthBillingServiceCatalog",
    sourceEntityId: source.id,
  }, { serviceCode: source.code }));

  try {
    const extension = await prisma.$transaction(async (tx) => {
      const alreadyMapped = await tx.healthServiceCatalogExtension.findFirst({ where: { organizationId, healthBillingServiceCatalogId: source.id } });
      if (alreadyMapped) return alreadyMapped;
      const current = await tx.healthBillingServiceCatalog.findFirst({ where: { id: source.id, organizationId } });
      if (!current) throw new EnterpriseSectorConvergenceError("HEALTH_BILLING_SERVICE_NOT_FOUND", 404);
      const unit = await tx.enterpriseUnitOfMeasure.upsert({
        where: { organizationId_code: { organizationId, code: "SERVICE" } },
        update: { status: "ACTIVE", archivedAt: null },
        create: { organizationId, code: "SERVICE", name: "Service", symbol: "srv", category: "SERVICE", createdByUserId: actorUserId },
      });
      const catalog = await tx.enterpriseCatalogItem.create({
        data: {
          organizationId,
          code: `HCS-${current.code}`.slice(0, 80),
          sku: `HEALTH-${current.code}`.slice(0, 120),
          name: current.labelFr,
          normalizedName: normalize(`health service ${current.code} ${current.labelFr}`),
          description: current.labelEn || null,
          itemType: "SERVICE",
          unitOfMeasureId: unit.id,
          indicativeSalePrice: current.defaultPrice,
          currency: current.currency,
          status: current.isActive && current.billable ? "ACTIVE" : "INACTIVE",
          taxable: false,
          trackInventory: false,
          createdByUserId: actorUserId,
        },
      });
      const created = await tx.healthServiceCatalogExtension.create({
        data: { organizationId, healthBillingServiceCatalogId: current.id, catalogItemId: catalog.id, createdByUserId: actorUserId },
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
      errorCode: duplicate ? "HEALTH_SERVICE_MAPPING_AMBIGUOUS" : "HEALTH_SERVICE_MAPPING_FAILED",
      requiresManualAction: duplicate,
    });
    throw duplicate ? new EnterpriseSectorConvergenceError("HEALTH_SERVICE_MAPPING_AMBIGUOUS", 409) : error;
  }
}
