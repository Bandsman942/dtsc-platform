-- #1228: widen physical quantities without losing integer capacity.
-- No row update, historical journal rewrite, destructive cast or backfill.
-- Keep this widening on application rollback; never narrow live quantities.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "EnterpriseSalesInvoiceItem" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSalesCreditNoteItem" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSupplierInvoiceItem" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseThreeWayMatch" ALTER COLUMN "quantityVariance" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryCostLayer" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryCostLayer" ALTER COLUMN "remainingQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryAccountingEvent" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryAcquisitionCostSupplement" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferValuation" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferValuation" ALTER COLUMN "sourceQuantityBefore" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferValuation" ALTER COLUMN "sourceQuantityAfter" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferValuation" ALTER COLUMN "destinationQuantityBefore" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferValuation" ALTER COLUMN "destinationQuantityAfter" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferCostAllocation" ALTER COLUMN "quantityBefore" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferCostAllocation" ALTER COLUMN "remainingQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryTransferCostAllocation" ALTER COLUMN "transferredQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseQuoteItem" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSalesOrderItem" ALTER COLUMN "quantityOrdered" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSalesOrderItem" ALTER COLUMN "quantityFulfilled" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseFulfillmentItem" ALTER COLUMN "quantityFulfilled" TYPE DECIMAL(21,6);
ALTER TABLE "EnterprisePurchaseItem" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterprisePurchaseReceiptItem" ALTER COLUMN "quantityReceived" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryReservation" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryReservation" ALTER COLUMN "fulfilledQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryItem" ALTER COLUMN "minimumQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryItem" ALTER COLUMN "reorderQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryBalance" ALTER COLUMN "quantityOnHand" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryBalance" ALTER COLUMN "quantityReserved" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStockMovement" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStockMovement" ALTER COLUMN "balanceAfter" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryCountLine" ALTER COLUMN "expectedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryCountLine" ALTER COLUMN "countedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryCountLine" ALTER COLUMN "varianceQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStockTransferLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStockAdjustment" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSupplierReturnRequest" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStockLotReclassification" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryReturnCustody" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseManufacturingWorkCenter" ALTER COLUMN "capacityPerDay" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseBillOfMaterial" ALTER COLUMN "outputQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseBillOfMaterialLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionOrder" ALTER COLUMN "plannedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionOrder" ALTER COLUMN "producedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionOrder" ALTER COLUMN "scrappedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionMaterialRequirement" ALTER COLUMN "requiredQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionMaterialRequirement" ALTER COLUMN "consumedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionMaterialRequirement" ALTER COLUMN "shortageQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionExecution" ALTER COLUMN "quantityCompleted" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionQualityCheck" ALTER COLUMN "quantityChecked" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionQualityCheck" ALTER COLUMN "quantityAccepted" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionQualityCheck" ALTER COLUMN "quantityRejected" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseProductionScrap" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseStorageLocation" ALTER COLUMN "capacityValue" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailInvoiceReturnLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailOmnichannelReturnLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailSaleLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailPriceCondition" ALTER COLUMN "minQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailPriceCondition" ALTER COLUMN "maxQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailPricingDecision" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseRetailReturnLine" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseSectorInventoryEvent" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseTailoringCuttingPlan" ALTER COLUMN "plannedQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseTailoringCuttingPlan" ALTER COLUMN "cutQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseTailoringCuttingPlan" ALTER COLUMN "wasteQuantity" TYPE DECIMAL(21,6);
ALTER TABLE "EnterpriseTailoringGarmentBundle" ALTER COLUMN "quantity" TYPE DECIMAL(21,6);
ALTER TABLE "HealthPharmacyProduct" ALTER COLUMN "currentStock" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyProduct" ALTER COLUMN "minimumStock" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyProduct" ALTER COLUMN "criticalStock" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyProduct" ALTER COLUMN "maximumStock" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyBatch" ALTER COLUMN "initialQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyBatch" ALTER COLUMN "availableQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyStockMovement" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyStockMovement" ALTER COLUMN "stockBefore" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyStockMovement" ALTER COLUMN "stockAfter" TYPE DECIMAL(17,6);
ALTER TABLE "HealthPharmacyDispensation" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "HealthMedicalInvoiceItem" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyProduct" ALTER COLUMN "minStock" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyProduct" ALTER COLUMN "maxStock" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyProduct" ALTER COLUMN "safetyStock" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyProduct" ALTER COLUMN "unitsPerPackage" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyBatch" ALTER COLUMN "receivedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyBatch" ALTER COLUMN "availableQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyBatch" ALTER COLUMN "reservedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyBatch" ALTER COLUMN "damagedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyBatch" ALTER COLUMN "minQuantityAlert" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyStockMovement" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyStockMovement" ALTER COLUMN "quantityBefore" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyStockMovement" ALTER COLUMN "quantityAfter" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyInventoryLine" ALTER COLUMN "systemQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyInventoryLine" ALTER COLUMN "countedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyInventoryLine" ALTER COLUMN "variance" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyStockAdjustment" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacySupplierProduct" ALTER COLUMN "minimumQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReplenishmentRequest" ALTER COLUMN "requestedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyPurchaseOrderLine" ALTER COLUMN "orderedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyPurchaseOrderLine" ALTER COLUMN "receivedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyPurchaseOrderLine" ALTER COLUMN "remainingQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceipt" ALTER COLUMN "totalItems" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceiptLine" ALTER COLUMN "orderedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceiptLine" ALTER COLUMN "previouslyReceivedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceiptLine" ALTER COLUMN "receivedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceiptBatch" ALTER COLUMN "receivedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReceiptDiscrepancy" ALTER COLUMN "affectedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyPrescriptionLine" ALTER COLUMN "prescribedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyPrescriptionLine" ALTER COLUMN "dispensedQuantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacySaleLine" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacySaleRefundLine" ALTER COLUMN "quantityReturned" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyReturnLossEvent" ALTER COLUMN "quantity" TYPE DECIMAL(17,6);
ALTER TABLE "PharmacyQualityIncident" ALTER COLUMN "quantityAffected" TYPE DECIMAL(17,6);

-- Preserve all transfer value/conservation rules; align only quantity scale.
ALTER TABLE "EnterpriseInventoryTransferValuation" DROP CONSTRAINT "inv_transfer_value_amount_ck";
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_amount_ck" CHECK (
  "quantity">0 AND "quantity"=ROUND("quantity",6) AND "unitCost">0 AND "totalCost">0
  AND "totalCost"=ROUND("quantity"*"unitCost",6)
  AND "sourceQuantityAfter">=0 AND "sourceValueAfter">=0
  AND "sourceQuantityBefore"="sourceQuantityAfter"+"quantity"
  AND "sourceValueBefore"="sourceValueAfter"+"totalCost"
  AND "revision">0 AND "currencyCode" ~ '^[A-Z]{3}$'
);
COMMIT;
