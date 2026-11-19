import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingDocument } from "@/lib/enterprise/accounting/posting-types";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";

const invalid=()=>{throw new EnterpriseAccountingError("INVENTORY_TRANSFER_VALUATION_WORKFLOW_REQUIRED",409);};

/** Analytic reclassification of the inventory asset, not an acquisition or a
 * sale. The no-site debit/credit is the transit bucket, whose detailed
 * warehouse/lot evidence lives in the transfer valuation register. */
export async function buildInventoryTransferPosting(tx:Prisma.TransactionClient,input:{organizationId:string;sourceEntityType:string;sourceEntityId:string},phase:"DISPATCH"|"RECEIPT"):Promise<PostingDocument>{
  const {organizationId}=input;
  if(input.sourceEntityType!=="EnterpriseInventoryTransferValuation")return invalid();
  const v=await tx.enterpriseInventoryTransferValuation.findFirst({where:{organizationId,id:input.sourceEntityId,status:phase==="DISPATCH"?"PREPARED":"IN_TRANSIT"},include:{
    transferLine:{include:{stockTransfer:true}},dispatchMovement:{include:{warehouse:true}},allocations:true,dispatchJournalEntry:{include:{lines:true}},
  }});
  if(!v)return invalid();
  const line=v.transferLine,t=line.stockTransfer,m=v.dispatchMovement;
  const config=await tx.enterpriseFinanceConfiguration.findUnique({where:{organizationId},select:{functionalCurrencyCode:true,inventoryValuationMethod:true}});
  if(!config||config.functionalCurrencyCode!==v.currencyCode||config.inventoryValuationMethod!=="WEIGHTED_AVERAGE"||
    !line.quantity.equals(v.quantity)||m.direction!=="OUT"||m.movementType!=="TRANSFER_OUT"||m.sourceEntityType!=="EnterpriseStockTransfer"||
    m.sourceEntityId!==t.id||m.sourceLineId!==line.id||m.inventoryItemId!==line.inventoryItemId||m.warehouseId!==t.sourceWarehouseId||
    m.stockLotId!==line.stockLotId||m.storageLocationId!==line.sourceLocationId||!m.quantity.equals(v.quantity))return invalid();
  const sum=v.allocations.reduce((n,a)=>n.plus(a.transferredQuantity),v.quantity.minus(v.quantity));
  const value=v.allocations.reduce((n,a)=>n.plus(a.transferredQuantity.times(a.unitCost)),v.quantity.minus(v.quantity));
  if(!sum.equals(v.quantity)||!value.equals(v.quantity.times(v.unitCost)))return invalid();
  let date=m.occurredAt,siteId:string|null=m.warehouse.siteId,reference=t.reference,creditAccount="INVENTORY";
  if(phase==="RECEIPT"){
    const j=v.dispatchJournalEntry;
    if(!j||j.status!=="POSTED"||j.reversedAt||j.reversalOfEntryId||j.sourceEntityType!==input.sourceEntityType||j.sourceEntityId!==v.id||
      j.postingEvent!=="INVENTORY_TRANSFER_DISPATCHED"||j.postingVersion!==1||j.functionalCurrencyCode!==v.currencyCode||
      !j.totalDebit.equals(v.totalCost)||!j.totalCredit.equals(v.totalCost)||j.lines.length!==2)return invalid();
    const debit=j.lines.find(l=>l.debit.equals(v.totalCost)&&l.credit.isZero()&&l.siteId===null&&l.inventoryItemId===line.inventoryItemId);
    const credit=j.lines.find(l=>l.credit.equals(v.totalCost)&&l.debit.isZero()&&l.siteId===m.warehouse.siteId&&l.inventoryItemId===line.inventoryItemId);
    if(!debit||!credit||debit.ledgerAccountId!==credit.ledgerAccountId)return invalid();
    if(await tx.enterpriseJournalReversal.count({where:{organizationId,originalEntryId:j.id}}))return invalid();
    const receipt=await tx.enterpriseStockMovement.findFirst({where:{organizationId,sourceEntityType:"EnterpriseStockTransfer",sourceEntityId:t.id,sourceLineId:line.id,direction:"IN",movementType:"TRANSFER_IN"},include:{warehouse:true,stockLot:true}});
    if(!receipt||receipt.inventoryItemId!==line.inventoryItemId||receipt.warehouseId!==t.destinationWarehouseId||receipt.storageLocationId!==line.destinationLocationId||!receipt.quantity.equals(v.quantity))return invalid();
    const layer=await tx.enterpriseInventoryCostLayer.findFirst({where:{organizationId,sourceMovementId:receipt.id}});
    if(!layer||layer.inventoryItemId!==line.inventoryItemId||layer.warehouseId!==receipt.warehouseId||layer.currencyCode!==v.currencyCode||!layer.quantity.equals(v.quantity)||!layer.remainingQuantity.equals(v.quantity)||!layer.unitCost.equals(v.unitCost)||!layer.totalCost.equals(v.totalCost))return invalid();
    // Remove the transit amount from the original ledger account even if
    // the current inventory mapping changed while the goods were in transit.
    creditAccount="ACCOUNT_ID:"+debit.ledgerAccountId;
    date=receipt.occurredAt;siteId=receipt.warehouse.siteId;
  }
  const accountingDate=new Date((await resolveEnterpriseBusinessDate(tx,organizationId,date))+"T00:00:00.000Z");
  const description=(phase==="DISPATCH"?"Inventory transfer dispatch ":"Inventory transfer receipt ")+reference;
  return {organizationId,journalType:"INVENTORY",accountingDate,documentDate:accountingDate,reference,description,sourceModule:"FINANCE_INVENTORY",
    sourceEntityType:input.sourceEntityType,sourceEntityId:v.id,currencyCode:v.currencyCode,lines:[
      {accountMappingKey:"INVENTORY",description,debit:v.totalCost,transactionCurrencyCode:v.currencyCode,transactionAmount:v.totalCost,inventoryItemId:line.inventoryItemId,siteId:phase==="DISPATCH"?null:siteId},
      {accountMappingKey:creditAccount,description,credit:v.totalCost,transactionCurrencyCode:v.currencyCode,transactionAmount:v.totalCost,inventoryItemId:line.inventoryItemId,siteId:phase==="DISPATCH"?siteId:null},
    ]};
}
