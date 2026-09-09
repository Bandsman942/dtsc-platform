import { prisma } from "@/lib/prisma";

export async function getManufacturingReferences(organizationId: string) {
  const [configuration, catalogItems, warehouses, salesOrders, employees, assets, approvedTimesheetEntries, suppliers, boms, routings, workCenters] = await Promise.all([
    prisma.enterpriseManufacturingConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseCatalogItem.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      include: {
        unitOfMeasure: { select: { id: true, code: true, name: true, symbol: true } },
        inventoryItems: { where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, allowNegativeStock: true, lotTracking: true } },
      },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, code: true, name: true, siteId: true, site: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.enterpriseSalesOrder.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] } },
      select: { id: true, reference: true, title: true, status: true, currency: true, items: { select: { id: true, catalogItemId: true, description: true, quantity: true, fulfilledQuantity: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.enterpriseEmployee.findMany({
      where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE" },
      select: { id: true, employeeNumber: true, displayName: true, siteId: true },
      orderBy: { displayName: "asc" },
      take: 500,
    }),
    prisma.enterpriseAsset.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["RETIRED", "DISPOSED"] } },
      select: { id: true, code: true, name: true, status: true, siteId: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.enterpriseTimesheetEntry.findMany({
      where: { organizationId, timesheet: { organizationId, status: "APPROVED", archivedAt: null } },
      select: { id: true, workDate: true, approvedMinutes: true, declaredMinutes: true, notes: true, timesheet: { select: { employeeId: true, reference: true } } },
      orderBy: { workDate: "desc" },
      take: 250,
    }),
    prisma.enterpriseSupplier.findMany({
      where: { organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, legalName: true, displayName: true, status: true },
      orderBy: { legalName: "asc" },
      take: 500,
    }),
    prisma.enterpriseBillOfMaterial.findMany({
      where: { organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, code: true, name: true, catalogItemId: true, version: true, outputQuantity: true },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
    prisma.enterpriseManufacturingRouting.findMany({
      where: { organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, code: true, name: true, catalogItemId: true, version: true },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
    prisma.enterpriseManufacturingWorkCenter.findMany({
      where: { organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, code: true, name: true, siteId: true, assetId: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  return { configuration, catalogItems, warehouses, salesOrders, employees, assets, approvedTimesheetEntries, suppliers, boms, routings, workCenters };
}

export async function getManufacturingOverview(organizationId: string, periodDays = 30) {
  const since = new Date(Date.now() - Math.min(366, Math.max(1, periodDays)) * 86_400_000);
  const [ordersByStatus, requirementsByStatus, recentOrders, qualityByResult, scrapAggregate, executions, workCenters] = await Promise.all([
    prisma.enterpriseProductionOrder.groupBy({ where: { organizationId, archivedAt: null }, by: ["status"], _count: { _all: true }, _sum: { plannedQuantity: true, producedQuantity: true, scrappedQuantity: true } }),
    prisma.enterpriseProductionMaterialRequirement.groupBy({ where: { organizationId }, by: ["status"], _count: { _all: true }, _sum: { requiredQuantity: true, consumedQuantity: true, shortageQuantity: true } }),
    prisma.enterpriseProductionOrder.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, reference: true, title: true, status: true, priority: true, outputCatalogItemId: true, plannedQuantity: true, producedQuantity: true, scrappedQuantity: true, plannedStartAt: true, plannedEndAt: true, actualStartAt: true, actualEndAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.enterpriseProductionQualityCheck.groupBy({ where: { organizationId, createdAt: { gte: since } }, by: ["result"], _count: { _all: true }, _sum: { quantityChecked: true, quantityAccepted: true, quantityRejected: true } }),
    prisma.enterpriseProductionScrap.aggregate({ where: { organizationId, occurredAt: { gte: since } }, _count: { _all: true }, _sum: { quantity: true } }),
    prisma.enterpriseProductionExecution.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.enterpriseManufacturingWorkCenter.groupBy({ where: { organizationId, archivedAt: null }, by: ["status"], _count: { _all: true } }),
  ]);

  const planned = ordersByStatus.reduce((sum, row) => sum + Number(row._sum.plannedQuantity || 0), 0);
  const produced = ordersByStatus.reduce((sum, row) => sum + Number(row._sum.producedQuantity || 0), 0);
  const scrapped = ordersByStatus.reduce((sum, row) => sum + Number(row._sum.scrappedQuantity || 0), 0);
  const shortage = requirementsByStatus.reduce((sum, row) => sum + Number(row._sum.shortageQuantity || 0), 0);

  return {
    periodDays: Math.min(366, Math.max(1, periodDays)),
    asOf: new Date().toISOString(),
    metrics: {
      plannedQuantity: planned,
      producedQuantity: produced,
      completionRate: planned > 0 ? Math.min(100, (produced / planned) * 100) : 0,
      scrappedQuantity: scrapped,
      shortageQuantity: shortage,
      executions,
      scrapEvents: scrapAggregate._count._all,
      scrapEventQuantity: Number(scrapAggregate._sum.quantity || 0),
    },
    ordersByStatus,
    requirementsByStatus,
    qualityByResult,
    workCenters,
    recentOrders,
  };
}

export async function getManufacturingReportData(organizationId: string, periodDays = 30) {
  const overview = await getManufacturingOverview(organizationId, periodDays);
  const since = new Date(Date.now() - overview.periodDays * 86_400_000);
  const [consumptionMovements, outputMovements, scrapMovements, executionMinutes] = await Promise.all([
    prisma.enterpriseStockMovement.aggregate({ where: { organizationId, movementType: "PRODUCTION_CONSUMPTION", occurredAt: { gte: since } }, _count: { _all: true }, _sum: { quantity: true } }),
    prisma.enterpriseStockMovement.aggregate({ where: { organizationId, movementType: "PRODUCTION_OUTPUT", occurredAt: { gte: since } }, _count: { _all: true }, _sum: { quantity: true } }),
    prisma.enterpriseStockMovement.aggregate({ where: { organizationId, movementType: "PRODUCTION_SCRAP", occurredAt: { gte: since } }, _count: { _all: true }, _sum: { quantity: true } }),
    prisma.enterpriseProductionExecution.aggregate({ where: { organizationId, createdAt: { gte: since } }, _sum: { minutesWorked: true }, _count: { _all: true } }),
  ]);
  return { ...overview, inventory: { consumptionMovements, outputMovements, scrapMovements }, labor: { minutesWorked: executionMinutes._sum.minutesWorked || 0, entries: executionMinutes._count._all } };
}
