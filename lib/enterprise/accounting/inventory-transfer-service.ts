import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { prepareInventoryTransferCostTx, readVerifiedTransferPoolTx } from "@/lib/enterprise/accounting/inventory-transfer-cost-preflight";
import { proveInventoryTransferDestination } from "@/lib/enterprise/accounting/inventory-transfer-cost-plan";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

const fail=(code="INVENTORY_TRANSFER_VALUATION_WORKFLOW_REQUIRED"):never=>{throw new EnterpriseDomainError(code,409);};
async function finance<T>(fn:()=>Promise<T>):Promise<T>{
  try{return await fn();}catch(e){if(e instanceof EnterpriseAccountingError)return fail(["INVENTORY_TRANSFER_COST_POOL_UNPROVEN","INVENTORY_TRANSFER_COST_NOT_EXACT","INVENTORY_TRANSFER_VALUATION_WORKFLOW_REQUIRED"].includes(e.code)?e.code:"INVENTORY_TRANSFER_FINANCE_NOT_READY");throw e;}
}
async function loadLine(tx:Prisma.TransactionClient,organizationId:string,transferId:string,lineId:string){
  const line=await tx.enterpriseStockTransferLine.findFirst({where:{organizationId,id:lineId,stockTransferId:transferId},include:{stockTransfer:true}});
  if(!line||line.stockTransfer.archivedAt)return fail();
  return line;
}
async function countPool(tx:Prisma.TransactionClient,organizationId:string,inventoryItemId:string,warehouseId:string){
  return tx.enterpriseInventoryCostLayer.count({where:{organizationId,inventoryItemId,warehouseId}});
}

/** Called only by the already authorized STOCK_TRANSFER approval transition,
 * before the physical OUT. Unvalued legacy stock may remain physical-only
 * only if neither warehouse has accounting cost layers. */
export async function prepareValuedTransferDispatchTx(tx:Prisma.TransactionClient,organizationId:string,transferId:string,lineId:string){
  const line=await loadLine(tx,organizationId,transferId,lineId),t=line.stockTransfer;
  if(t.status!=="PENDING_APPROVAL")return fail();
  const [source,destination]=await Promise.all([countPool(tx,organizationId,line.inventoryItemId,t.sourceWarehouseId),countPool(tx,organizationId,line.inventoryItemId,t.destinationWarehouseId)]);
  if(!source&&!destination)return null;
  if(!source)return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  const proof=await finance(()=>prepareInventoryTransferCostTx(tx,{organizationId,inventoryItemId:line.inventoryItemId,sourceWarehouseId:t.sourceWarehouseId,destinationWarehouseId:t.destinationWarehouseId,quantity:line.quantity}));
  return {line,proof};
}

export async function completeValuedTransferDispatchTx(tx:Prisma.TransactionClient,organizationId:string,actorUserId:string,prepared:NonNullable<Awaited<ReturnType<typeof prepareValuedTransferDispatchTx>>>,movementId:string){
  const {line,proof}=prepared,p=proof.plan,t=line.stockTransfer;
  const m=await tx.enterpriseStockMovement.findFirst({where:{organizationId,id:movementId,sourceEntityType:"EnterpriseStockTransfer",sourceEntityId:t.id,sourceLineId:line.id,movementType:"TRANSFER_OUT",direction:"OUT"}});
  if(!m||m.inventoryItemId!==line.inventoryItemId||m.warehouseId!==t.sourceWarehouseId||m.stockLotId!==line.stockLotId||m.storageLocationId!==line.sourceLocationId||!m.quantity.equals(p.quantity))return fail();
  const actual=await tx.enterpriseInventoryBalance.aggregate({where:{organizationId,inventoryItemId:line.inventoryItemId,warehouseId:t.sourceWarehouseId},_sum:{quantityOnHand:true}});
  if(!(actual._sum.quantityOnHand||new Prisma.Decimal(0)).equals(p.sourceQuantityAfter))return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  const allocations=p.allocations.filter(a=>a.transferredQuantity.gt(0));
  for(const a of allocations){
    const changed=await tx.enterpriseInventoryCostLayer.updateMany({where:{organizationId,id:a.layerId,inventoryItemId:line.inventoryItemId,warehouseId:t.sourceWarehouseId,currencyCode:p.currencyCode,remainingQuantity:a.quantityBefore,unitCost:a.unitCost},data:{remainingQuantity:a.remainingQuantity}});
    if(changed.count!==1)return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  }
  const v=await tx.enterpriseInventoryTransferValuation.create({data:{organizationId,transferLineId:line.id,dispatchMovementId:m.id,currencyCode:p.currencyCode,quantity:p.quantity,unitCost:p.unitCost,totalCost:p.totalCost,sourceQuantityBefore:p.sourceQuantityBefore,sourceQuantityAfter:p.sourceQuantityAfter,sourceValueBefore:p.sourceValueBefore,sourceValueAfter:p.sourceValueAfter,preparedByUserId:actorUserId,
  }});
  await tx.enterpriseInventoryTransferCostAllocation.createMany({data:allocations.map(a=>({organizationId,valuationId:v.id,sourceCostLayerId:a.layerId,quantityBefore:a.quantityBefore,remainingQuantity:a.remainingQuantity,transferredQuantity:a.transferredQuantity,unitCost:a.unitCost}))});
  const posted=await finance(()=>postBusinessEventTx(tx,organizationId,actorUserId,{postingEvent:"INVENTORY_TRANSFER_DISPATCHED",sourceEntityType:"EnterpriseInventoryTransferValuation",sourceEntityId:v.id},{inventoryTransferTransition:true}));
  const changed=await tx.enterpriseInventoryTransferValuation.updateMany({where:{organizationId,id:v.id,status:"PREPARED",revision:v.revision},data:{status:"IN_TRANSIT",dispatchJournalEntryId:posted.entry.id,dispatchedAt:m.occurredAt,revision:{increment:1}}});
  if(changed.count!==1)return fail();
  await publishFinanceEvent(tx,{organizationId,actorUserId,entityType:"EnterpriseInventoryTransferValuation",entityId:v.id,eventType:"INVENTORY_TRANSFER_COST_IN_TRANSIT",summary:"Transfer cost dispatched",toStatus:"IN_TRANSIT",metadataJson:{quantity:p.quantity.toFixed(),value:p.totalCost.toFixed(),currency:p.currencyCode,sourceMovementId:m.id}});
}

/** Re-read the live destination before applying the physical receipt. */
export async function prepareValuedTransferReceiptTx(tx:Prisma.TransactionClient,organizationId:string,transferId:string,lineId:string){
  const line=await loadLine(tx,organizationId,transferId,lineId),t=line.stockTransfer;
  if(!["PENDING_APPROVAL","IN_TRANSIT"].includes(t.status))return fail();
  const v=await tx.enterpriseInventoryTransferValuation.findFirst({where:{organizationId,transferLineId:line.id}});
  if(!v){
    // Legacy physical-only transfer: never blend unvalued stock into
    // an accounting pool that appeared in the meantime.
    if(await countPool(tx,organizationId,line.inventoryItemId,t.destinationWarehouseId))return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
    return null;
  }
  if(v.status!=="IN_TRANSIT"||!v.quantity.equals(line.quantity)||!v.dispatchedAt||!v.dispatchJournalEntryId)return fail();
  const config=await tx.enterpriseFinanceConfiguration.findUnique({where:{organizationId},select:{functionalCurrencyCode:true,inventoryValuationMethod:true}});
  if(!config||config.functionalCurrencyCode!==v.currencyCode||config.inventoryValuationMethod!=="WEIGHTED_AVERAGE")return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  const destination=await finance(()=>readVerifiedTransferPoolTx(tx,organizationId,line.inventoryItemId,t.destinationWarehouseId,v.currencyCode,new Date(),true));
  const proof=await finance(async()=>proveInventoryTransferDestination(destination.pool,v));
  if(!proof.destinationValueBefore.equals(destination.verifiedValue))return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  return {line,v,proof};
}

export async function completeValuedTransferReceiptTx(tx:Prisma.TransactionClient,organizationId:string,actorUserId:string,prepared:NonNullable<Awaited<ReturnType<typeof prepareValuedTransferReceiptTx>>>,movementId:string){
  const {line,v,proof}=prepared,t=line.stockTransfer;
  const m=await tx.enterpriseStockMovement.findFirst({where:{organizationId,id:movementId,sourceEntityType:"EnterpriseStockTransfer",sourceEntityId:t.id,sourceLineId:line.id,movementType:"TRANSFER_IN",direction:"IN"}});
  if(!m||m.inventoryItemId!==line.inventoryItemId||m.warehouseId!==t.destinationWarehouseId||m.storageLocationId!==line.destinationLocationId||!m.quantity.equals(v.quantity)||m.occurredAt<v.dispatchedAt!)return fail();
  const actual=await tx.enterpriseInventoryBalance.aggregate({where:{organizationId,inventoryItemId:line.inventoryItemId,warehouseId:t.destinationWarehouseId},_sum:{quantityOnHand:true}});
  if(!(actual._sum.quantityOnHand||new Prisma.Decimal(0)).equals(proof.destinationQuantityAfter))return fail("INVENTORY_TRANSFER_COST_POOL_UNPROVEN");
  const layer=await tx.enterpriseInventoryCostLayer.create({data:{organizationId,inventoryItemId:line.inventoryItemId,warehouseId:t.destinationWarehouseId,sourceMovementId:m.id,valuationMethod:"WEIGHTED_AVERAGE",quantity:v.quantity,remainingQuantity:v.quantity,unitCost:v.unitCost,totalCost:v.totalCost,currencyCode:v.currencyCode,effectiveAt:m.occurredAt}});
  const posted=await finance(()=>postBusinessEventTx(tx,organizationId,actorUserId,{postingEvent:"INVENTORY_TRANSFER_RECEIVED",sourceEntityType:"EnterpriseInventoryTransferValuation",sourceEntityId:v.id},{inventoryTransferTransition:true}));
  const changed=await tx.enterpriseInventoryTransferValuation.updateMany({where:{organizationId,id:v.id,status:"IN_TRANSIT",revision:v.revision},data:{status:"RECEIVED",receiptMovementId:m.id,destinationCostLayerId:layer.id,receiptJournalEntryId:posted.entry.id,receivedAt:m.occurredAt,receivedByUserId:actorUserId,...proof,revision:{increment:1}}});
  if(changed.count!==1)return fail();
  await publishFinanceEvent(tx,{organizationId,actorUserId,entityType:"EnterpriseInventoryTransferValuation",entityId:v.id,eventType:"INVENTORY_TRANSFER_COST_RECEIVED",summary:"Transfer cost received",fromStatus:"IN_TRANSIT",toStatus:"RECEIVED",metadataJson:{quantity:v.quantity.toFixed(),value:v.totalCost.toFixed(),currency:v.currencyCode,destinationMovementId:m.id}});
}
