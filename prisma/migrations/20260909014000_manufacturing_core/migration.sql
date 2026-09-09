-- Manufacturing Core #606: additive sector domain, canonical template and tenant backfill.
-- Historical Manufacturing placeholder migrations remain immutable. RAW_MATERIALS and
-- FINISHED_PRODUCTS are intentionally disabled because Catalog/Inventory own those truths.

CREATE TABLE "EnterpriseManufacturingConfiguration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "defaultMaterialWarehouseId" TEXT,
  "defaultOutputWarehouseId" TEXT,
  "qualityRequiredByDefault" BOOLEAN NOT NULL DEFAULT true,
  "allowOverproduction" BOOLEAN NOT NULL DEFAULT false,
  "settingsJson" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseManufacturingConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseManufacturingWorkCenter" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "siteId" TEXT,
  "assetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "capacityPerDay" DECIMAL(18,3),
  "capacityUnit" TEXT,
  "costRate" DECIMAL(18,2),
  "currency" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseManufacturingWorkCenter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseManufacturingRouting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "catalogItemId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseManufacturingRouting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseManufacturingRoutingOperation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "routingId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "workCenterId" TEXT,
  "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  "standardMinutes" INTEGER,
  "requiresQualityCheck" BOOLEAN NOT NULL DEFAULT false,
  "instructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseManufacturingRoutingOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBillOfMaterial" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "outputQuantity" DECIMAL(18,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseBillOfMaterial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBillOfMaterialLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bomId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "scrapRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "issueMethod" TEXT NOT NULL DEFAULT 'MANUAL',
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseBillOfMaterialLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseProductionOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "bomId" TEXT NOT NULL,
  "routingId" TEXT,
  "outputCatalogItemId" TEXT NOT NULL,
  "salesOrderId" TEXT,
  "salesOrderItemId" TEXT,
  "materialWarehouseId" TEXT NOT NULL,
  "outputWarehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "plannedQuantity" DECIMAL(18,3) NOT NULL,
  "producedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "scrappedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "plannedStartAt" TIMESTAMP(3),
  "plannedEndAt" TIMESTAMP(3),
  "actualStartAt" TIMESTAMP(3),
  "actualEndAt" TIMESTAMP(3),
  "requestedByUserId" TEXT NOT NULL,
  "approverUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "notes" TEXT,
  "idempotencyKey" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseProductionOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseProductionMaterialRequirement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "bomLineId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "requiredQuantity" DECIMAL(18,3) NOT NULL,
  "consumedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "shortageQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "purchaseId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseProductionMaterialRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseProductionExecution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "routingOperationId" TEXT,
  "workCenterId" TEXT,
  "employeeId" TEXT,
  "assetId" TEXT,
  "timesheetEntryId" TEXT,
  "executionType" TEXT NOT NULL,
  "quantityCompleted" DECIMAL(18,3),
  "minutesWorked" INTEGER,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseProductionExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseProductionQualityCheck" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "routingOperationId" TEXT,
  "checkType" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "quantityChecked" DECIMAL(18,3) NOT NULL,
  "quantityAccepted" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "quantityRejected" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "inspectedByUserId" TEXT NOT NULL,
  "inspectedEmployeeId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseProductionQualityCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseProductionScrap" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "materialRequirementId" TEXT,
  "catalogItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "warehouseId" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "notes" TEXT,
  "affectsInventory" BOOLEAN NOT NULL DEFAULT false,
  "stockMovementId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseProductionScrap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseManufacturingConfiguration_organizationId_key" ON "EnterpriseManufacturingConfiguration"("organizationId");
CREATE INDEX "EnterpriseManufacturingConfiguration_organizationId_idx" ON "EnterpriseManufacturingConfiguration"("organizationId");
CREATE UNIQUE INDEX "EnterpriseManufacturingWorkCenter_organizationId_id_key" ON "EnterpriseManufacturingWorkCenter"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseManufacturingWorkCenter_organizationId_code_key" ON "EnterpriseManufacturingWorkCenter"("organizationId", "code");
CREATE INDEX "EnterpriseManufacturingWorkCenter_organizationId_status_name_idx" ON "EnterpriseManufacturingWorkCenter"("organizationId", "status", "name");
CREATE INDEX "EnterpriseManufacturingWorkCenter_organizationId_siteId_status_idx" ON "EnterpriseManufacturingWorkCenter"("organizationId", "siteId", "status");
CREATE INDEX "EnterpriseManufacturingWorkCenter_organizationId_assetId_status_idx" ON "EnterpriseManufacturingWorkCenter"("organizationId", "assetId", "status");
CREATE INDEX "EnterpriseManufacturingWorkCenter_archivedAt_idx" ON "EnterpriseManufacturingWorkCenter"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseManufacturingRouting_organizationId_id_key" ON "EnterpriseManufacturingRouting"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseManufacturingRouting_organizationId_code_version_key" ON "EnterpriseManufacturingRouting"("organizationId", "code", "version");
CREATE INDEX "EnterpriseManufacturingRouting_organizationId_catalogItemId_status_idx" ON "EnterpriseManufacturingRouting"("organizationId", "catalogItemId", "status");
CREATE INDEX "EnterpriseManufacturingRouting_organizationId_status_updatedAt_idx" ON "EnterpriseManufacturingRouting"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseManufacturingRouting_archivedAt_idx" ON "EnterpriseManufacturingRouting"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseManufacturingRoutingOperation_organizationId_id_key" ON "EnterpriseManufacturingRoutingOperation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseMfgRoutingOp_org_routing_sequence_key" ON "EnterpriseManufacturingRoutingOperation"("organizationId", "routingId", "sequence");
CREATE UNIQUE INDEX "EnterpriseMfgRoutingOp_org_routing_code_key" ON "EnterpriseManufacturingRoutingOperation"("organizationId", "routingId", "code");
CREATE INDEX "EnterpriseManufacturingRoutingOperation_organizationId_workCenterId_idx" ON "EnterpriseManufacturingRoutingOperation"("organizationId", "workCenterId");
CREATE UNIQUE INDEX "EnterpriseBillOfMaterial_organizationId_id_key" ON "EnterpriseBillOfMaterial"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBillOfMaterial_organizationId_code_version_key" ON "EnterpriseBillOfMaterial"("organizationId", "code", "version");
CREATE INDEX "EnterpriseBillOfMaterial_organizationId_catalogItemId_status_idx" ON "EnterpriseBillOfMaterial"("organizationId", "catalogItemId", "status");
CREATE INDEX "EnterpriseBillOfMaterial_organizationId_status_effectiveFrom_idx" ON "EnterpriseBillOfMaterial"("organizationId", "status", "effectiveFrom");
CREATE INDEX "EnterpriseBillOfMaterial_archivedAt_idx" ON "EnterpriseBillOfMaterial"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseBillOfMaterialLine_organizationId_id_key" ON "EnterpriseBillOfMaterialLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBillOfMaterialLine_organizationId_bomId_sequence_key" ON "EnterpriseBillOfMaterialLine"("organizationId", "bomId", "sequence");
CREATE INDEX "EnterpriseBillOfMaterialLine_organizationId_bomId_catalogItemId_idx" ON "EnterpriseBillOfMaterialLine"("organizationId", "bomId", "catalogItemId");
CREATE INDEX "EnterpriseBillOfMaterialLine_organizationId_catalogItemId_idx" ON "EnterpriseBillOfMaterialLine"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "EnterpriseProductionOrder_organizationId_id_key" ON "EnterpriseProductionOrder"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseProductionOrder_organizationId_reference_key" ON "EnterpriseProductionOrder"("organizationId", "reference");
CREATE UNIQUE INDEX "EnterpriseProductionOrder_organizationId_idempotencyKey_key" ON "EnterpriseProductionOrder"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseProductionOrder_organizationId_status_plannedStartAt_idx" ON "EnterpriseProductionOrder"("organizationId", "status", "plannedStartAt");
CREATE INDEX "EnterpriseProductionOrder_organizationId_outputCatalogItemId_status_idx" ON "EnterpriseProductionOrder"("organizationId", "outputCatalogItemId", "status");
CREATE INDEX "EnterpriseProductionOrder_organizationId_salesOrderId_status_idx" ON "EnterpriseProductionOrder"("organizationId", "salesOrderId", "status");
CREATE INDEX "EnterpriseProductionOrder_organizationId_materialWarehouseId_status_idx" ON "EnterpriseProductionOrder"("organizationId", "materialWarehouseId", "status");
CREATE INDEX "EnterpriseProductionOrder_organizationId_outputWarehouseId_status_idx" ON "EnterpriseProductionOrder"("organizationId", "outputWarehouseId", "status");
CREATE INDEX "EnterpriseProductionOrder_archivedAt_idx" ON "EnterpriseProductionOrder"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseProductionMaterialRequirement_organizationId_id_key" ON "EnterpriseProductionMaterialRequirement"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseProductionMaterialRequirement_order_bomLine_key" ON "EnterpriseProductionMaterialRequirement"("organizationId", "productionOrderId", "bomLineId");
CREATE INDEX "EnterpriseProductionMaterialRequirement_order_status_idx" ON "EnterpriseProductionMaterialRequirement"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseProductionMaterialRequirement_inventory_warehouse_idx" ON "EnterpriseProductionMaterialRequirement"("organizationId", "inventoryItemId", "warehouseId");
CREATE INDEX "EnterpriseProductionMaterialRequirement_purchase_status_idx" ON "EnterpriseProductionMaterialRequirement"("organizationId", "purchaseId", "status");
CREATE UNIQUE INDEX "EnterpriseProductionExecution_organizationId_id_key" ON "EnterpriseProductionExecution"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseProductionExecution_organizationId_idempotencyKey_key" ON "EnterpriseProductionExecution"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseProductionExecution_order_createdAt_idx" ON "EnterpriseProductionExecution"("organizationId", "productionOrderId", "createdAt");
CREATE INDEX "EnterpriseProductionExecution_employee_createdAt_idx" ON "EnterpriseProductionExecution"("organizationId", "employeeId", "createdAt");
CREATE INDEX "EnterpriseProductionExecution_asset_createdAt_idx" ON "EnterpriseProductionExecution"("organizationId", "assetId", "createdAt");
CREATE INDEX "EnterpriseProductionExecution_timesheetEntryId_idx" ON "EnterpriseProductionExecution"("organizationId", "timesheetEntryId");
CREATE UNIQUE INDEX "EnterpriseProductionQualityCheck_organizationId_id_key" ON "EnterpriseProductionQualityCheck"("organizationId", "id");
CREATE INDEX "EnterpriseProductionQualityCheck_order_result_createdAt_idx" ON "EnterpriseProductionQualityCheck"("organizationId", "productionOrderId", "result", "createdAt");
CREATE INDEX "EnterpriseProductionQualityCheck_employee_createdAt_idx" ON "EnterpriseProductionQualityCheck"("organizationId", "inspectedEmployeeId", "createdAt");
CREATE UNIQUE INDEX "EnterpriseProductionScrap_organizationId_id_key" ON "EnterpriseProductionScrap"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseProductionScrap_organizationId_idempotencyKey_key" ON "EnterpriseProductionScrap"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseProductionScrap_order_occurredAt_idx" ON "EnterpriseProductionScrap"("organizationId", "productionOrderId", "occurredAt");
CREATE INDEX "EnterpriseProductionScrap_catalog_occurredAt_idx" ON "EnterpriseProductionScrap"("organizationId", "catalogItemId", "occurredAt");
CREATE INDEX "EnterpriseProductionScrap_reason_occurredAt_idx" ON "EnterpriseProductionScrap"("organizationId", "reasonCode", "occurredAt");

ALTER TABLE "EnterpriseManufacturingRoutingOperation" ADD CONSTRAINT "EnterpriseManufacturingRoutingOperation_routing_fkey" FOREIGN KEY ("organizationId", "routingId") REFERENCES "EnterpriseManufacturingRouting"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseManufacturingRoutingOperation" ADD CONSTRAINT "EnterpriseManufacturingRoutingOperation_workCenter_fkey" FOREIGN KEY ("organizationId", "workCenterId") REFERENCES "EnterpriseManufacturingWorkCenter"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseBillOfMaterialLine" ADD CONSTRAINT "EnterpriseBillOfMaterialLine_bom_fkey" FOREIGN KEY ("organizationId", "bomId") REFERENCES "EnterpriseBillOfMaterial"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionOrder" ADD CONSTRAINT "EnterpriseProductionOrder_bom_fkey" FOREIGN KEY ("organizationId", "bomId") REFERENCES "EnterpriseBillOfMaterial"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionOrder" ADD CONSTRAINT "EnterpriseProductionOrder_routing_fkey" FOREIGN KEY ("organizationId", "routingId") REFERENCES "EnterpriseManufacturingRouting"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionMaterialRequirement" ADD CONSTRAINT "EnterpriseProductionMaterialRequirement_order_fkey" FOREIGN KEY ("organizationId", "productionOrderId") REFERENCES "EnterpriseProductionOrder"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionMaterialRequirement" ADD CONSTRAINT "EnterpriseProductionMaterialRequirement_bomLine_fkey" FOREIGN KEY ("organizationId", "bomLineId") REFERENCES "EnterpriseBillOfMaterialLine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionExecution" ADD CONSTRAINT "EnterpriseProductionExecution_order_fkey" FOREIGN KEY ("organizationId", "productionOrderId") REFERENCES "EnterpriseProductionOrder"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionExecution" ADD CONSTRAINT "EnterpriseProductionExecution_operation_fkey" FOREIGN KEY ("organizationId", "routingOperationId") REFERENCES "EnterpriseManufacturingRoutingOperation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionExecution" ADD CONSTRAINT "EnterpriseProductionExecution_workCenter_fkey" FOREIGN KEY ("organizationId", "workCenterId") REFERENCES "EnterpriseManufacturingWorkCenter"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionQualityCheck" ADD CONSTRAINT "EnterpriseProductionQualityCheck_order_fkey" FOREIGN KEY ("organizationId", "productionOrderId") REFERENCES "EnterpriseProductionOrder"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionQualityCheck" ADD CONSTRAINT "EnterpriseProductionQualityCheck_operation_fkey" FOREIGN KEY ("organizationId", "routingOperationId") REFERENCES "EnterpriseManufacturingRoutingOperation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionScrap" ADD CONSTRAINT "EnterpriseProductionScrap_order_fkey" FOREIGN KEY ("organizationId", "productionOrderId") REFERENCES "EnterpriseProductionOrder"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseProductionScrap" ADD CONSTRAINT "EnterpriseProductionScrap_requirement_fkey" FOREIGN KEY ("organizationId", "materialRequirementId") REFERENCES "EnterpriseProductionMaterialRequirement"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Upgrade the active Manufacturing template with canonical production modules.
WITH latest AS (
  SELECT st."id"
  FROM "SectorTemplate" st
  JOIN "BusinessSector" bs ON bs."id" = st."sectorId"
  WHERE bs."code" = 'MANUFACTURING' AND bs."isActive" = true AND st."isActive" = true
  ORDER BY st."version" DESC
  LIMIT 1
), modules AS (
  SELECT * FROM (VALUES
    ('MANUFACTURING_OVERVIEW','Vue d’ensemble production','Manufacturing overview','Pilotage consolidé des ordres, besoins matières, exécution et qualité.','Consolidated steering of orders, material requirements, execution and quality.','factory',210,'BUSINESS'),
    ('BILL_OF_MATERIALS','Nomenclatures','Bills of materials','Produits fabriqués et composants du catalogue commun.','Manufactured products and components from the shared catalog.','list-tree',220,'BUSINESS'),
    ('PRODUCTION_ORDERS','Ordres de production','Production orders','Planification et cycle de vie des ordres de fabrication.','Planning and lifecycle of production orders.','clipboard-list',230,'BUSINESS'),
    ('PRODUCTION_ROUTINGS','Gammes de production','Production routings','Séquences d’opérations et temps standards.','Operation sequences and standard times.','route',240,'BUSINESS'),
    ('WORK_CENTERS','Postes & centres de travail','Work centers','Capacités de production liées aux sites et actifs communs.','Production capacities linked to shared sites and assets.','settings-2',250,'BUSINESS'),
    ('MATERIAL_REQUIREMENTS','Besoins matières','Material requirements','Besoins, disponibilités, pénuries et réapprovisionnement.','Requirements, availability, shortages and replenishment.','package-search',260,'BUSINESS'),
    ('PRODUCTION_EXECUTION','Exécution production','Production execution','Consommations, sorties produits finis, opérateurs et équipements.','Consumption, finished output, operators and equipment.','play-circle',270,'BUSINESS'),
    ('QUALITY_CONTROL','Contrôle qualité','Quality control','Contrôles qualité et quantités acceptées ou rejetées.','Quality checks and accepted or rejected quantities.','badge-check',280,'BUSINESS'),
    ('SCRAP_WASTE','Rebuts & pertes','Scrap & waste','Traçabilité des rebuts et pertes de production.','Traceability of manufacturing scrap and waste.','trash-2',290,'BUSINESS'),
    ('PRODUCTION_REPORTS','Rapports de production','Production reports','Rendement, consommation, qualité et respect du plan.','Yield, consumption, quality and plan adherence.','chart-no-axes-combined',300,'ENTERPRISE')
  ) AS v("moduleCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","sortOrder","requiresPlanLevel")
)
INSERT INTO "SectorTemplateModule" ("id","templateId","moduleCode","labelFr","labelEn","descriptionFr","descriptionEn","moduleCategory","icon","sortOrder","defaultEnabled","requiresPlanLevel","createdAt","updatedAt")
SELECT 'mfg-stm-' || md5(latest."id" || ':' || modules."moduleCode"), latest."id", modules."moduleCode", modules."labelFr", modules."labelEn", modules."descriptionFr", modules."descriptionEn", 'SECTOR', modules."icon", modules."sortOrder", true, modules."requiresPlanLevel", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM latest CROSS JOIN modules
ON CONFLICT ("templateId","moduleCode") DO UPDATE SET
  "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "descriptionFr"=EXCLUDED."descriptionFr", "descriptionEn"=EXCLUDED."descriptionEn",
  "moduleCategory"='SECTOR', "icon"=EXCLUDED."icon", "sortOrder"=EXCLUDED."sortOrder", "defaultEnabled"=true, "requiresPlanLevel"=EXCLUDED."requiresPlanLevel", "updatedAt"=CURRENT_TIMESTAMP;

WITH latest AS (
  SELECT st."id" FROM "SectorTemplate" st JOIN "BusinessSector" bs ON bs."id"=st."sectorId"
  WHERE bs."code"='MANUFACTURING' AND st."isActive"=true ORDER BY st."version" DESC LIMIT 1
)
UPDATE "SectorTemplateModule" SET "defaultEnabled"=false, "updatedAt"=CURRENT_TIMESTAMP
WHERE "templateId" IN (SELECT "id" FROM latest) AND "moduleCode" IN ('RAW_MATERIALS','FINISHED_PRODUCTS');

WITH latest AS (
  SELECT st."id" FROM "SectorTemplate" st JOIN "BusinessSector" bs ON bs."id"=st."sectorId"
  WHERE bs."code"='MANUFACTURING' AND st."isActive"=true ORDER BY st."version" DESC LIMIT 1
), departments AS (
  SELECT * FROM (VALUES
    ('PRODUCTION','Production','Production','Planification, exécution et pilotage de la fabrication.','Manufacturing planning, execution and steering.',210),
    ('QUALITY','Qualité','Quality','Contrôle qualité, rebuts et amélioration de la production.','Quality control, scrap and manufacturing improvement.',220)
  ) AS v("code","labelFr","labelEn","descriptionFr","descriptionEn","sortOrder")
)
INSERT INTO "SectorTemplateDepartment" ("id","templateId","departmentCode","labelFr","labelEn","descriptionFr","descriptionEn","sortOrder","createdAt","updatedAt")
SELECT 'mfg-std-' || md5(latest."id" || ':' || departments."code"), latest."id", departments."code", departments."labelFr", departments."labelEn", departments."descriptionFr", departments."descriptionEn", departments."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM latest CROSS JOIN departments
ON CONFLICT ("templateId","departmentCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "descriptionFr"=EXCLUDED."descriptionFr", "descriptionEn"=EXCLUDED."descriptionEn", "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=CURRENT_TIMESTAMP;

WITH latest AS (
  SELECT st."id" FROM "SectorTemplate" st JOIN "BusinessSector" bs ON bs."id"=st."sectorId"
  WHERE bs."code"='MANUFACTURING' AND st."isActive"=true ORDER BY st."version" DESC LIMIT 1
), positions AS (
  SELECT * FROM (VALUES
    ('PRODUCTION_MANAGER','Responsable production','Production manager','PRODUCTION',20,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.bom.manage","enterprise.manufacturing.orders.manage","enterprise.manufacturing.routings.manage","enterprise.manufacturing.workcenters.manage","enterprise.manufacturing.requirements.manage","enterprise.manufacturing.execution.manage","enterprise.manufacturing.quality.approve","enterprise.manufacturing.scrap.manage","enterprise.manufacturing.reports.view"]'::jsonb),
    ('PRODUCTION_PLANNER','Planificateur production','Production planner','PRODUCTION',35,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.bom.create","enterprise.manufacturing.bom.update","enterprise.manufacturing.orders.create","enterprise.manufacturing.orders.update","enterprise.manufacturing.orders.submit","enterprise.manufacturing.routings.create","enterprise.manufacturing.routings.update","enterprise.manufacturing.workcenters.view","enterprise.manufacturing.requirements.view"]'::jsonb),
    ('PRODUCTION_OPERATOR','Opérateur production','Production operator','PRODUCTION',60,false,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.orders.view","enterprise.manufacturing.requirements.view","enterprise.manufacturing.execution.submit","enterprise.manufacturing.quality.create","enterprise.manufacturing.scrap.create"]'::jsonb),
    ('QUALITY_CONTROLLER','Contrôleur qualité','Quality controller','QUALITY',50,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.orders.view","enterprise.manufacturing.execution.view","enterprise.manufacturing.quality.create","enterprise.manufacturing.quality.approve","enterprise.manufacturing.scrap.view","enterprise.manufacturing.reports.view"]'::jsonb)
  ) AS v("code","labelFr","labelEn","departmentCode","hierarchyLevel","isKeyPosition","permissions")
)
INSERT INTO "SectorTemplatePosition" ("id","templateId","positionCode","labelFr","labelEn","departmentCode","hierarchyLevel","descriptionFr","descriptionEn","defaultPermissionsJson","isKeyPosition","sortOrder","createdAt","updatedAt")
SELECT 'mfg-stp-' || md5(latest."id" || ':' || positions."code"), latest."id", positions."code", positions."labelFr", positions."labelEn", positions."departmentCode", positions."hierarchyLevel", positions."labelFr", positions."labelEn", positions."permissions", positions."isKeyPosition", positions."hierarchyLevel", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM latest CROSS JOIN positions
ON CONFLICT ("templateId","positionCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "departmentCode"=EXCLUDED."departmentCode", "hierarchyLevel"=EXCLUDED."hierarchyLevel", "defaultPermissionsJson"=EXCLUDED."defaultPermissionsJson", "isKeyPosition"=EXCLUDED."isKeyPosition", "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=CURRENT_TIMESTAMP;

WITH latest AS (
  SELECT st."id" FROM "SectorTemplate" st JOIN "BusinessSector" bs ON bs."id"=st."sectorId"
  WHERE bs."code"='MANUFACTURING' AND st."isActive"=true ORDER BY st."version" DESC LIMIT 1
), blocks AS (
  SELECT * FROM (VALUES
    ('PRODUCTION_FLOOR','Atelier de production','Production floor','Suivre et exécuter les ordres en cours.','Track and execute active production orders.','factory',210,'PRODUCTION_EXECUTION'),
    ('PRODUCTION_QUALITY','Qualité production','Manufacturing quality','Contrôler la qualité et les rebuts de production.','Control manufacturing quality and scrap.','badge-check',220,'QUALITY_CONTROL')
  ) AS v("code","labelFr","labelEn","descriptionFr","descriptionEn","icon","sortOrder","targetModuleCode")
)
INSERT INTO "SectorTemplateActivityBlock" ("id","templateId","blockCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","sortOrder","defaultEnabled","targetModuleCode","createdAt","updatedAt")
SELECT 'mfg-stab-' || md5(latest."id" || ':' || blocks."code"), latest."id", blocks."code", blocks."labelFr", blocks."labelEn", blocks."descriptionFr", blocks."descriptionEn", blocks."icon", blocks."sortOrder", true, blocks."targetModuleCode", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM latest CROSS JOIN blocks
ON CONFLICT ("templateId","blockCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "descriptionFr"=EXCLUDED."descriptionFr", "descriptionEn"=EXCLUDED."descriptionEn", "icon"=EXCLUDED."icon", "sortOrder"=EXCLUDED."sortOrder", "defaultEnabled"=true, "targetModuleCode"=EXCLUDED."targetModuleCode", "updatedAt"=CURRENT_TIMESTAMP;

-- Bring already-onboarded Manufacturing organizations onto the canonical module set.
WITH manufacturing_sector AS (SELECT "id" FROM "BusinessSector" WHERE "code"='MANUFACTURING' LIMIT 1),
latest AS (
  SELECT st."id" FROM "SectorTemplate" st JOIN manufacturing_sector ms ON ms."id"=st."sectorId"
  WHERE st."isActive"=true ORDER BY st."version" DESC LIMIT 1
), orgs AS (
  SELECT o."id", COALESCE(o."sectorId", (SELECT "id" FROM manufacturing_sector)) AS "sectorId"
  FROM "Organization" o WHERE o."sectorCode"='MANUFACTURING' AND o."deletedAt" IS NULL
), template_modules AS (
  SELECT stm.* FROM "SectorTemplateModule" stm JOIN latest ON latest."id"=stm."templateId"
  WHERE stm."moduleCode" IN ('MANUFACTURING_OVERVIEW','BILL_OF_MATERIALS','PRODUCTION_ORDERS','PRODUCTION_ROUTINGS','WORK_CENTERS','MATERIAL_REQUIREMENTS','PRODUCTION_EXECUTION','QUALITY_CONTROL','SCRAP_WASTE','PRODUCTION_REPORTS')
)
INSERT INTO "EnterpriseModule" ("id","organizationId","sectorId","moduleCode","labelFr","labelEn","descriptionFr","descriptionEn","moduleCategory","icon","isEnabled","isCore","sourceTemplateId","requiresPlanLevel","sortOrder","createdAt","updatedAt")
SELECT 'mfg-em-' || md5(orgs."id" || ':' || tm."moduleCode"), orgs."id", orgs."sectorId", tm."moduleCode", tm."labelFr", tm."labelEn", tm."descriptionFr", tm."descriptionEn", 'SECTOR', tm."icon", tm."defaultEnabled", false, tm."id", tm."requiresPlanLevel", tm."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM orgs CROSS JOIN template_modules tm
ON CONFLICT ("organizationId","moduleCode") DO UPDATE SET "sectorId"=EXCLUDED."sectorId", "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "descriptionFr"=EXCLUDED."descriptionFr", "descriptionEn"=EXCLUDED."descriptionEn", "moduleCategory"='SECTOR', "icon"=EXCLUDED."icon", "isEnabled"=EXCLUDED."isEnabled", "isCore"=false, "sourceTemplateId"=EXCLUDED."sourceTemplateId", "requiresPlanLevel"=EXCLUDED."requiresPlanLevel", "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=CURRENT_TIMESTAMP;

UPDATE "EnterpriseModule" em SET "isEnabled"=false, "updatedAt"=CURRENT_TIMESTAMP
FROM "Organization" o
WHERE em."organizationId"=o."id" AND o."sectorCode"='MANUFACTURING' AND em."moduleCode" IN ('RAW_MATERIALS','FINISHED_PRODUCTS') AND em."isEnabled"=true;

WITH org_modules AS (
  SELECT em.*, stm."descriptionFr" AS "templateDescriptionFr", stm."descriptionEn" AS "templateDescriptionEn"
  FROM "EnterpriseModule" em
  JOIN "Organization" o ON o."id"=em."organizationId" AND o."sectorCode"='MANUFACTURING' AND o."deletedAt" IS NULL
  LEFT JOIN "SectorTemplateModule" stm ON stm."id"=em."sourceTemplateId"
  WHERE em."moduleCode" IN ('MANUFACTURING_OVERVIEW','BILL_OF_MATERIALS','PRODUCTION_ORDERS','PRODUCTION_ROUTINGS','WORK_CENTERS','MATERIAL_REQUIREMENTS','PRODUCTION_EXECUTION','QUALITY_CONTROL','SCRAP_WASTE','PRODUCTION_REPORTS')
)
INSERT INTO "EnterpriseAdminSection" ("id","organizationId","moduleId","sectionCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","isEnabled","requiredPermission","sortOrder","sourceTemplateId","createdAt","updatedAt")
SELECT 'mfg-eas-' || md5(om."organizationId" || ':' || om."moduleCode"), om."organizationId", om."id", om."moduleCode", om."labelFr", om."labelEn", om."descriptionFr", om."descriptionEn", om."icon", om."isEnabled", 'module:' || om."moduleCode" || ':manage', om."sortOrder", om."sourceTemplateId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM org_modules om
ON CONFLICT ("organizationId","sectionCode") DO UPDATE SET "moduleId"=EXCLUDED."moduleId", "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "descriptionFr"=EXCLUDED."descriptionFr", "descriptionEn"=EXCLUDED."descriptionEn", "icon"=EXCLUDED."icon", "isEnabled"=EXCLUDED."isEnabled", "requiredPermission"=EXCLUDED."requiredPermission", "sortOrder"=EXCLUDED."sortOrder", "sourceTemplateId"=EXCLUDED."sourceTemplateId", "updatedAt"=CURRENT_TIMESTAMP;

WITH manufacturing_sector AS (SELECT "id" FROM "BusinessSector" WHERE "code"='MANUFACTURING' LIMIT 1), orgs AS (
  SELECT o."id" FROM "Organization" o WHERE o."sectorCode"='MANUFACTURING' AND o."deletedAt" IS NULL
), departments AS (
  SELECT * FROM (VALUES ('PRODUCTION','Production','Production',210),('QUALITY','Qualité','Quality',220)) AS v("code","labelFr","labelEn","sortOrder")
)
INSERT INTO "EnterpriseDepartment" ("id","organizationId","departmentCode","labelFr","labelEn","isActive","sortOrder","createdAt","updatedAt")
SELECT 'mfg-ed-' || md5(orgs."id" || ':' || d."code"), orgs."id", d."code", d."labelFr", d."labelEn", true, d."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM orgs CROSS JOIN departments d
ON CONFLICT ("organizationId","departmentCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "isActive"=true, "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=CURRENT_TIMESTAMP;

WITH manufacturing_sector AS (SELECT "id" FROM "BusinessSector" WHERE "code"='MANUFACTURING' LIMIT 1), orgs AS (
  SELECT o."id", COALESCE(o."sectorId", (SELECT "id" FROM manufacturing_sector)) AS "sectorId" FROM "Organization" o WHERE o."sectorCode"='MANUFACTURING' AND o."deletedAt" IS NULL
), positions AS (
  SELECT * FROM (VALUES
    ('PRODUCTION_MANAGER','Responsable production','Production manager','PRODUCTION',20,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.bom.manage","enterprise.manufacturing.orders.manage","enterprise.manufacturing.routings.manage","enterprise.manufacturing.workcenters.manage","enterprise.manufacturing.requirements.manage","enterprise.manufacturing.execution.manage","enterprise.manufacturing.quality.approve","enterprise.manufacturing.scrap.manage","enterprise.manufacturing.reports.view"]'::jsonb),
    ('PRODUCTION_PLANNER','Planificateur production','Production planner','PRODUCTION',35,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.bom.create","enterprise.manufacturing.bom.update","enterprise.manufacturing.orders.create","enterprise.manufacturing.orders.update","enterprise.manufacturing.orders.submit","enterprise.manufacturing.routings.create","enterprise.manufacturing.routings.update","enterprise.manufacturing.workcenters.view","enterprise.manufacturing.requirements.view"]'::jsonb),
    ('PRODUCTION_OPERATOR','Opérateur production','Production operator','PRODUCTION',60,false,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.orders.view","enterprise.manufacturing.requirements.view","enterprise.manufacturing.execution.submit","enterprise.manufacturing.quality.create","enterprise.manufacturing.scrap.create"]'::jsonb),
    ('QUALITY_CONTROLLER','Contrôleur qualité','Quality controller','QUALITY',50,true,'["enterprise.manufacturing.overview.view","enterprise.manufacturing.orders.view","enterprise.manufacturing.execution.view","enterprise.manufacturing.quality.create","enterprise.manufacturing.quality.approve","enterprise.manufacturing.scrap.view","enterprise.manufacturing.reports.view"]'::jsonb)
  ) AS v("code","labelFr","labelEn","departmentCode","hierarchyLevel","isKeyPosition","permissions")
)
INSERT INTO "EnterprisePosition" ("id","organizationId","sectorId","positionCode","labelFr","labelEn","departmentId","hierarchyLevel","descriptionFr","descriptionEn","permissionsJson","isActive","isKeyPosition","createdAt","updatedAt")
SELECT 'mfg-ep-' || md5(orgs."id" || ':' || p."code"), orgs."id", orgs."sectorId", p."code", p."labelFr", p."labelEn", ed."id", p."hierarchyLevel", p."labelFr", p."labelEn", p."permissions", true, p."isKeyPosition", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM orgs CROSS JOIN positions p LEFT JOIN "EnterpriseDepartment" ed ON ed."organizationId"=orgs."id" AND ed."departmentCode"=p."departmentCode"
ON CONFLICT ("organizationId","positionCode") DO UPDATE SET "sectorId"=EXCLUDED."sectorId", "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "departmentId"=EXCLUDED."departmentId", "hierarchyLevel"=EXCLUDED."hierarchyLevel", "permissionsJson"=EXCLUDED."permissionsJson", "isActive"=true, "isKeyPosition"=EXCLUDED."isKeyPosition", "updatedAt"=CURRENT_TIMESTAMP;

WITH manufacturing_sector AS (SELECT "id" FROM "BusinessSector" WHERE "code"='MANUFACTURING' LIMIT 1), orgs AS (
  SELECT o."id", COALESCE(o."sectorId", (SELECT "id" FROM manufacturing_sector)) AS "sectorId" FROM "Organization" o WHERE o."sectorCode"='MANUFACTURING' AND o."deletedAt" IS NULL
), blocks AS (
  SELECT * FROM (VALUES ('PRODUCTION_FLOOR','Atelier de production','Production floor','factory',210,'PRODUCTION_EXECUTION'),('PRODUCTION_QUALITY','Qualité production','Manufacturing quality','badge-check',220,'QUALITY_CONTROL')) AS v("code","labelFr","labelEn","icon","sortOrder","targetModuleCode")
)
INSERT INTO "EnterpriseActivityBlock" ("id","organizationId","sectorId","blockCode","labelFr","labelEn","icon","targetModuleCode","isEnabled","sortOrder","createdAt","updatedAt")
SELECT 'mfg-eab-' || md5(orgs."id" || ':' || b."code"), orgs."id", orgs."sectorId", b."code", b."labelFr", b."labelEn", b."icon", b."targetModuleCode", true, b."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM orgs CROSS JOIN blocks b
ON CONFLICT ("organizationId","blockCode") DO UPDATE SET "sectorId"=EXCLUDED."sectorId", "labelFr"=EXCLUDED."labelFr", "labelEn"=EXCLUDED."labelEn", "icon"=EXCLUDED."icon", "targetModuleCode"=EXCLUDED."targetModuleCode", "isEnabled"=true, "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=CURRENT_TIMESTAMP;
