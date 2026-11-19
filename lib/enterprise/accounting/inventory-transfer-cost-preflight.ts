import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { ordinaryInventoryHistorySql } from "@/lib/enterprise/accounting/inventory-ordinary-history";
import { planInventoryTransferCost, proveInventoryTransferDestination } from "@/lib/enterprise/accounting/inventory-transfer-cost-plan";

function unproven(): never {
  throw new EnterpriseAccountingError("INVENTORY_TRANSFER_COST_POOL_UNPROVEN",409);
}

/**
 * Read-only preparation of the first supported valued-transfer domain:
 * ordinary, verified CUMP history in the functional currency, or a completely
 * pristine destination. A caller must be inside its existing Serializable
 * stock transition and must enforce organization/module/site authorization.
 *
 * This is deliberately not an alternative mutation endpoint. The posting
 * workflow must persist the returned proof and consume it exactly once.
 */
export async function prepareInventoryTransferCostTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId:string;
    inventoryItemId:string;
    sourceWarehouseId:string;
    destinationWarehouseId:string;
    quantity:Prisma.Decimal;
  },
) {
  const {organizationId,inventoryItemId,sourceWarehouseId,destinationWarehouseId}=input;
  if(sourceWarehouseId===destinationWarehouseId) return unproven();
  const [configuration,item,warehouses]=await Promise.all([
    tx.enterpriseFinanceConfiguration.findUnique({where:{organizationId},select:{functionalCurrencyCode:true,inventoryValuationMethod:true}}),
    tx.enterpriseInventoryItem.findFirst({where:{organizationId,id:inventoryItemId,status:"ACTIVE",archivedAt:null,catalogItem:{organizationId,trackInventory:true,archivedAt:null,status:"ACTIVE"}},select:{id:true}}),
    tx.enterpriseWarehouse.findMany({where:{organizationId,id:{in:[sourceWarehouseId,destinationWarehouseId]},status:"ACTIVE",archivedAt:null},select:{id:true}}),
  ]);
  if(!item || warehouses.length!==2 || !warehouses.some(w=>w.id===sourceWarehouseId) || !warehouses.some(w=>w.id===destinationWarehouseId)) return unproven();
  if(!configuration || configuration.inventoryValuationMethod!=="WEIGHTED_AVERAGE") return unproven();
  const currencyCode=configuration.functionalCurrencyCode;
  const cutoff=new Date();


  const source=await readVerifiedTransferPoolTx(tx,organizationId,inventoryItemId,sourceWarehouseId,currencyCode,cutoff,false);
  const plan=planInventoryTransferCost(source.pool,input.quantity);
  if(!plan.sourceValueBefore.equals(source.verifiedValue)) return unproven();
  const destination=await readVerifiedTransferPoolTx(tx,organizationId,inventoryItemId,destinationWarehouseId,currencyCode,cutoff,true);
  const reception=proveInventoryTransferDestination(destination.pool,plan);
  if(!reception.destinationValueBefore.equals(destination.verifiedValue)) return unproven();
  return {organizationId,inventoryItemId,sourceWarehouseId,destinationWarehouseId,plan,reception,recognizedAt:cutoff};
}

export async function readVerifiedTransferPoolTx(tx:Prisma.TransactionClient, organizationId:string, inventoryItemId:string, warehouseId:string, currencyCode:string, cutoff:Date,allowPristine:boolean) {
  const where={organizationId,inventoryItemId,warehouseId};
  const [layers,balance,negative]=await Promise.all([
    tx.enterpriseInventoryCostLayer.findMany({where,select:{id:true,remainingQuantity:true,unitCost:true,currencyCode:true},orderBy:{id:"asc"}}),
    tx.enterpriseInventoryBalance.aggregate({where,_sum:{quantityOnHand:true}}),
    tx.enterpriseInventoryBalance.count({where:{...where,quantityOnHand:{lt:0}}}),
  ]);
  const physicalQuantity=balance._sum.quantityOnHand||new Prisma.Decimal(0);
  if(negative || layers.some(layer=>layer.currencyCode!==currencyCode)) return unproven();
  const pool={currencyCode,physicalQuantity,layers};
  if(!layers.length) {
    // Missing costs on existing or historical stock are not a pristine
    // destination and cannot be silently blended into a valued pool.
    if(!allowPristine || !physicalQuantity.isZero() || await tx.enterpriseStockMovement.count({where})) return unproven();
    return {pool,verifiedValue:new Prisma.Decimal(0)};
  }
  const proof=ordinaryInventoryHistorySql(organizationId,cutoff,{inventoryItemId,warehouseId});
  const rows=await tx.$queryRaw<Array<{quantity:Prisma.Decimal;value:Prisma.Decimal;currencyCode:string}>>(Prisma.sql`
    SELECT quantity,value,"currencyCode" FROM (${proof}) verified
    WHERE verified."inventoryItemId"=${inventoryItemId} AND verified."warehouseId"=${warehouseId}
  `);
  if(rows.length!==1 || rows[0].currencyCode!==currencyCode || !rows[0].quantity.equals(physicalQuantity)) return unproven();
  return {pool,verifiedValue:rows[0].value};
}
