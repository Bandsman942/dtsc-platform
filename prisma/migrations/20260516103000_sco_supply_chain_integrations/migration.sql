-- Renforce la section SCO existante avec des champs de liaison
-- Supply Chain sans supprimer les données ni les blocs actuels.

ALTER TABLE "MaterialItem"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "condition" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "currentOwnerName" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "departmentName" TEXT,
  ADD COLUMN "relatedProjectId" TEXT,
  ADD COLUMN "relatedTechnicalProjectId" TEXT,
  ADD COLUMN "vendorName" TEXT,
  ADD COLUMN "acquiredAt" TIMESTAMP(3),
  ADD COLUMN "estimatedValue" DECIMAL(12,2),
  ADD COLUMN "comments" TEXT;

CREATE INDEX "MaterialItem_departmentId_idx" ON "MaterialItem"("departmentId");
CREATE INDEX "MaterialItem_relatedProjectId_idx" ON "MaterialItem"("relatedProjectId");
CREATE INDEX "MaterialItem_relatedTechnicalProjectId_idx" ON "MaterialItem"("relatedTechnicalProjectId");

ALTER TABLE "ScoVendor"
  ADD COLUMN "vendorType" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "productsServices" TEXT,
  ADD COLUMN "serviceQuality" TEXT,
  ADD COLUMN "documentUrl" TEXT,
  ADD COLUMN "criticality" TEXT;

ALTER TABLE "ScoPurchaseRequest"
  ADD COLUMN "requesterDepartmentId" TEXT,
  ADD COLUMN "requesterDepartmentName" TEXT,
  ADD COLUMN "sourceSection" TEXT,
  ADD COLUMN "sourceItemId" TEXT,
  ADD COLUMN "destinationSection" TEXT,
  ADD COLUMN "destinationItemId" TEXT,
  ADD COLUMN "relatedProjectId" TEXT,
  ADD COLUMN "relatedBudgetId" TEXT,
  ADD COLUMN "relatedAssetId" TEXT,
  ADD COLUMN "relatedTaskId" TEXT,
  ADD COLUMN "relatedMissionId" TEXT,
  ADD COLUMN "requestedItemName" TEXT,
  ADD COLUMN "requestedQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "proposedVendorName" TEXT,
  ADD COLUMN "requestedAt" TIMESTAMP(3),
  ADD COLUMN "attachmentUrl" TEXT;

CREATE INDEX "ScoPurchaseRequest_sourceSection_sourceItemId_idx" ON "ScoPurchaseRequest"("sourceSection", "sourceItemId");
CREATE INDEX "ScoPurchaseRequest_relatedProjectId_idx" ON "ScoPurchaseRequest"("relatedProjectId");
CREATE INDEX "ScoPurchaseRequest_relatedBudgetId_idx" ON "ScoPurchaseRequest"("relatedBudgetId");
CREATE INDEX "ScoPurchaseRequest_relatedTaskId_idx" ON "ScoPurchaseRequest"("relatedTaskId");

ALTER TABLE "ScoInventoryItem"
  ADD COLUMN "usualVendorName" TEXT,
  ADD COLUMN "lastEntryAt" TIMESTAMP(3),
  ADD COLUMN "lastExitAt" TIMESTAMP(3),
  ADD COLUMN "movementType" TEXT,
  ADD COLUMN "relatedProjectId" TEXT,
  ADD COLUMN "relatedTaskId" TEXT,
  ADD COLUMN "relatedMissionId" TEXT;

CREATE INDEX "ScoInventoryItem_relatedProjectId_idx" ON "ScoInventoryItem"("relatedProjectId");
CREATE INDEX "ScoInventoryItem_relatedTaskId_idx" ON "ScoInventoryItem"("relatedTaskId");

ALTER TABLE "ScoAsset"
  ADD COLUMN "brandModel" TEXT,
  ADD COLUMN "serialNumber" TEXT,
  ADD COLUMN "estimatedValue" DECIMAL(12,2),
  ADD COLUMN "vendorName" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "departmentName" TEXT,
  ADD COLUMN "relatedProjectId" TEXT,
  ADD COLUMN "relatedTechnicalProjectId" TEXT,
  ADD COLUMN "purchaseRequestId" TEXT,
  ADD COLUMN "assignmentHistory" TEXT,
  ADD COLUMN "maintenanceHistory" TEXT;

CREATE INDEX "ScoAsset_departmentId_idx" ON "ScoAsset"("departmentId");
CREATE INDEX "ScoAsset_relatedProjectId_idx" ON "ScoAsset"("relatedProjectId");
CREATE INDEX "ScoAsset_relatedTechnicalProjectId_idx" ON "ScoAsset"("relatedTechnicalProjectId");
CREATE INDEX "ScoAsset_purchaseRequestId_idx" ON "ScoAsset"("purchaseRequestId");

ALTER TABLE "ScoLogisticsEvent"
  ADD COLUMN "missionType" TEXT,
  ADD COLUMN "requesterName" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "departmentName" TEXT,
  ADD COLUMN "relatedProjectId" TEXT,
  ADD COLUMN "relatedTechnicalProjectId" TEXT,
  ADD COLUMN "relatedTaskId" TEXT,
  ADD COLUMN "participants" TEXT,
  ADD COLUMN "logisticsNeeds" TEXT,
  ADD COLUMN "requiredMaterial" TEXT,
  ADD COLUMN "estimatedBudget" DECIMAL(12,2);

CREATE INDEX "ScoLogisticsEvent_departmentId_idx" ON "ScoLogisticsEvent"("departmentId");
CREATE INDEX "ScoLogisticsEvent_relatedProjectId_idx" ON "ScoLogisticsEvent"("relatedProjectId");
CREATE INDEX "ScoLogisticsEvent_relatedTechnicalProjectId_idx" ON "ScoLogisticsEvent"("relatedTechnicalProjectId");
CREATE INDEX "ScoLogisticsEvent_relatedTaskId_idx" ON "ScoLogisticsEvent"("relatedTaskId");
