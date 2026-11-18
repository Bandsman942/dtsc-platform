import { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { lotExpiryDateKey } from "@/lib/enterprise/inventory/lot-allocation";
import { money } from "@/lib/enterprise/accounting/helpers";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

function blocked(code:string):never { throw new EnterpriseDomainError(code,409); }

export async function assertCustodyRecoveryReadAccess(organizationId:string,userId:string) {
  const [stock,finance] = await Promise.all([
    resolveEnterpriseModuleAccess({organizationId,userId,moduleCode:"INVENTORY_LOGISTICS",action:"read"}),
    resolveEnterpriseModuleAccess({organizationId,userId,moduleCode:"FINANCE_INVENTORY",action:"read"}),
  ]);
  if(!stock.allowed||!finance.allowed)throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_PERMISSION_REQUIRED",403);
}

/** Read-only diagnostic, not a quality release, valuation or authorization.
 * Restrict to a complete identified retail return, with the exact issued lot,
 * an independently posted credit and untouched custody proof. A historical
 * cost is a ceiling for future appraisal, never the current recoverable value. */
export async function inspectCustodyRecoveryTx(tx:Prisma.TransactionClient,organizationId:string,userId:string,custodyId:string) {
  const custody=await tx.enterpriseInventoryReturnCustody.findFirst({
    where:{organizationId,id:custodyId,returnLine:{request:{status:"COMPLETED"}}},
    include:{originalMovement:{include:{stockLot:true,inventoryItem:{include:{catalogItem:true}},warehouse:true}},
      returnLine:{include:{request:true,checkoutLine:{include:{checkout:true}}}}},
  });
  if(!custody)throw new EnterpriseDomainError("INVENTORY_RETURN_CUSTODY_NOT_FOUND",404);
  const source=custody.originalMovement;
  await requireInventoryStockAuthorityTx(tx,organizationId,userId,source.warehouseId);
  if(custody.status!=="QUARANTINED"||custody.disposition!=="QUARANTINE"||custody.disposalRequestedAt||custody.disposedAt)blocked("INVENTORY_RETURN_RECOVERY_CUSTODY_INVALID");
  const {returnLine:line}=custody;
  const request=line.request,checkout=line.checkoutLine.checkout;
  const lot=source.stockLot;
  if(!lot||!source.stockLotId||source.movementType!=="SALE_FULFILLMENT"||source.direction!=="OUT"||
    source.sourceEntityType!=="EnterpriseSalesInvoice"||source.sourceEntityId!==checkout.salesInvoiceId||source.sourceLineId!==line.checkoutLine.invoiceItemId||
    source.inventoryItemId!==line.checkoutLine.inventoryItemId||source.warehouseId!==checkout.warehouseId||
    !request.salesCreditNoteId||!request.inspectedByUserId||!request.completedAt||line.stockDisposition!=="QUARANTINE"||
    !custody.quantity.gt(0)||custody.quantity.gt(line.quantity)||custody.quantity.gt(source.quantity)||
    source.inventoryItem.status!=="ACTIVE"||source.inventoryItem.archivedAt||!source.inventoryItem.lotTracking||
    !source.inventoryItem.catalogItem.trackInventory||source.inventoryItem.catalogItem.archivedAt||source.inventoryItem.catalogItem.status!=="ACTIVE"||
    source.warehouse.status!=="ACTIVE"||source.warehouse.archivedAt||lot.archivedAt||lot.inventoryItemId!==source.inventoryItemId||lot.warehouseId!==source.warehouseId||
    lot.storageLocationId!==source.storageLocationId)blocked("INVENTORY_RETURN_RECOVERY_ORIGIN_INVALID");
  const recalled=await tx.enterpriseStockLot.count({where:{organizationId,inventoryItemId:source.inventoryItemId,lotNumber:lot.lotNumber,recallReference:{not:null}}});
  const today=await resolveEnterpriseBusinessDate(tx,organizationId);
  if(recalled||lot.recallReference||lot.status!=="AVAILABLE"||
    (source.inventoryItem.expiryTracking&&!lot.expiryDate)||(lot.expiryDate&&lotExpiryDateKey(lot.expiryDate)<today))blocked("INVENTORY_RETURN_RECOVERY_LOT_UNSAFE");
  const catalogItemId=source.inventoryItem.catalogItemId;
  const [pharmacy,sector,credit,valuation,config,relatedCustody,sourceCount,returnLines]=await Promise.all([
    tx.pharmacyProductExtension.count({where:{organizationId,catalogItemId}}),
    tx.enterpriseSectorInventoryEvent.count({where:{organizationId,catalogItemId}}),
    tx.enterpriseSalesCreditNote.findFirst({where:{organizationId,id:request.salesCreditNoteId,status:"POSTED",salesInvoiceId:checkout.salesInvoiceId}}),
    tx.enterpriseInventoryAccountingEvent.findFirst({where:{organizationId,stockMovementId:source.id,eventType:"ISSUE",status:"POSTED",journalEntryId:{not:null}}}),
    tx.enterpriseFinanceConfiguration.findUnique({where:{organizationId},select:{automaticPostingEnabled:true,inventoryValuationMethod:true,functionalCurrencyCode:true}}),
    tx.enterpriseInventoryReturnCustody.aggregate({where:{organizationId,originalMovementId:source.id},_sum:{quantity:true}}),
    tx.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:source.sourceEntityType,sourceEntityId:source.sourceEntityId,sourceLineId:source.sourceLineId,stockLotId:source.stockLotId,direction:"OUT",movementType:"SALE_FULFILLMENT"}}),
    tx.enterpriseRetailInvoiceReturnLine.findMany({where:{organizationId,checkoutLineId:line.checkoutLineId,request:{status:"COMPLETED"}},select:{id:true}}),
  ]);
  if(pharmacy||sector)blocked("INVENTORY_RETURN_RECOVERY_SECTOR_REQUIRED");
  if(sourceCount!==1||new Prisma.Decimal(relatedCustody._sum.quantity||0).gt(source.quantity))blocked("INVENTORY_RETURN_RECOVERY_ORIGIN_INVALID");
  // No earlier restocking of this exact checkout line/batch is allowed in the
  // first recovery workflow: historical mixed restorations need reconciliation.
  const restored=await tx.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseRetailInvoiceReturnRequest",sourceLineId:{in:returnLines.map(row=>row.id)},stockLotId:source.stockLotId,direction:"IN",movementType:"RETURN_IN"}});
  if(restored)blocked("INVENTORY_RETURN_RECOVERY_ORIGIN_INVALID");
  if(!credit||!valuation?.journalEntryId||!valuation.quantity.equals(source.quantity)||!valuation.unitCost.gt(0)||
    !valuation.totalCost.equals(money(source.quantity.times(valuation.unitCost)))||!config?.automaticPostingEnabled||
    config.inventoryValuationMethod!=="WEIGHTED_AVERAGE"||valuation.currencyCode!==config.functionalCurrencyCode)blocked("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED");
  const journal=await tx.enterpriseJournalEntry.findFirst({where:{organizationId,id:valuation.journalEntryId,sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:valuation.id,postingEvent:"INVENTORY_ISSUE_VALUED",status:"POSTED"},include:{lines:true}});
  if(!journal||journal.functionalCurrencyCode!==valuation.currencyCode||journal.lines.length!==2)blocked("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED");
  try{
    const date=new Date(today+"T00:00:00.000Z");
    const [stock,cost]=await Promise.all([
      resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"INVENTORY",accountingDate:date}),
      resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"COST_OF_SALES",accountingDate:date}),
    ]);
    if(!journal.lines.some(row=>row.ledgerAccountId===cost.id&&row.debit.equals(valuation.totalCost)&&row.credit.isZero())||
      !journal.lines.some(row=>row.ledgerAccountId===stock.id&&row.credit.equals(valuation.totalCost)&&row.debit.isZero()))blocked("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED");
  }catch(error){if(error instanceof EnterpriseAccountingError)blocked("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED");throw error;}
  const maximum=money(custody.quantity.times(valuation.unitCost));
  if(!maximum.gt(0))blocked("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED");
  return {eligibleForAssessment:true,readOnly:true,revision:custody.revision,custodyId:custody.id,quantity:custody.quantity.toFixed(),
    historicalUnitCost:valuation.unitCost.toFixed(),historicalCostCeiling:maximum.toFixed(),currencyCode:valuation.currencyCode,
    returnReference:request.number,lotNumber:lot.lotNumber,originalIssueEventId:valuation.id,originalIssueJournalId:journal.id,
    physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false};
}
