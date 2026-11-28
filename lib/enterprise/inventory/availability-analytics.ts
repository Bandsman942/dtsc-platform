import type { Prisma } from "@prisma/client";
import { planReservationLotAllocations } from "@/lib/enterprise/inventory/lot-allocation";
import { exactInventoryQuantity as decimal } from "@/lib/enterprise/inventory/quantity-policy";
import { formatInventoryQuantity } from "@/lib/enterprise/inventory/quantity-display";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";

type Balance = { id:string; warehouseId:string; storageLocationId:string|null; stockLotId:string|null; quantityOnHand:Prisma.Decimal; quantityReserved:Prisma.Decimal; warehouse:{status:string;archivedAt:Date|null}; storageLocation:{status:string;archivedAt:Date|null}|null; stockLot:{status:string;archivedAt:Date|null;expiryDate:Date|null}|null };
type Item = { id:string;lotTracking:boolean;expiryTracking:boolean;balances:Balance[] };
type Reservation = { inventoryItemId:string;warehouseId:string;quantity:Prisma.Decimal;fulfilledQuantity:Prisma.Decimal;lotAllocations:Prisma.JsonValue|null;storageLocationId:string|null };
type Hold = { inventoryItemId:string;warehouseId:string;stockLotId:string|null;quantity:Prisma.Decimal };
export type InventoryQuantityTotal = {unitId:string;unit:string;decimalScale:number;metric:"onHand"|"reserved"|"sellable";value:string;precisionMismatch:boolean};
type Unit = { id:string;name:string;symbol:string|null;decimalScale:number };
type QuantityMetrics = ReturnType<typeof inventoryQuantityMetrics>;

/** The same FEFO/legacy/order/invoice calculation serves rows and all-page
 * analytics. Inputs have already been scoped to authorized warehouses. */
export function inventoryQuantityMetrics(item:Item,reservations:Reservation[],holds:Hold[],businessDate:string) {
  const onHand=item.balances.reduce((sum,row)=>sum.plus(row.quantityOnHand),decimal(0));
  const legacy=item.balances.reduce((sum,row)=>sum.plus(row.quantityReserved),decimal(0));
  const warehouseIds=new Set(item.balances.map(row=>row.warehouseId));
  const promised=reservations.filter(row=>row.inventoryItemId===item.id&&warehouseIds.has(row.warehouseId));
  const held=holds.filter(row=>row.inventoryItemId===item.id&&warehouseIds.has(row.warehouseId));
  const orderReserved=promised.reduce((sum,row)=>sum.plus(decimal(row.quantity).minus(row.fulfilledQuantity)),decimal(0));
  const invoiceHeld=held.reduce((sum,row)=>sum.plus(row.quantity),decimal(0));
  let sellable=decimal(0);
  for(const warehouseId of warehouseIds){
    const rows=item.balances.filter(row=>row.warehouseId===warehouseId&&row.warehouse.status==="ACTIVE"&&!row.warehouse.archivedAt&&(!row.storageLocationId||(row.storageLocation?.status==="ACTIVE"&&!row.storageLocation.archivedAt)));
    const orders=promised.filter(row=>row.warehouseId===warehouseId),invoices=held.filter(row=>row.warehouseId===warehouseId);
    if(item.lotTracking||item.expiryTracking){
      const positive=rows.filter(row=>row.quantityOnHand.gt(0)),demand=positive.reduce((sum,row)=>sum.plus(row.quantityOnHand),decimal(0));
      if(demand.gt(0)){
        const plan=planReservationLotAllocations({balances:positive,reservations:orders,holds:invoices,quantity:demand,businessDate,requireExpiry:item.expiryTracking});
        sellable=sellable.plus(plan.allocations.reduce((sum,row)=>sum.plus(row.quantity),decimal(0)));
      }
    }else{
      const available=rows.reduce((sum,row)=>sum.plus(decimal(row.quantityOnHand).minus(row.quantityReserved)),decimal(0))
        .minus(orders.reduce((sum,row)=>sum.plus(decimal(row.quantity).minus(row.fulfilledQuantity)),decimal(0)))
        .minus(invoices.reduce((sum,row)=>sum.plus(row.quantity),decimal(0)));
      if(available.gt(0))sellable=sellable.plus(available);
    }
  }
  return {onHand,reserved:legacy.plus(orderReserved).plus(invoiceHeld),sellable,legacy,orderReserved,invoiceHeld};
}

export function inventoryQuantityTotals(rows:Array<{unit:Unit;metrics:QuantityMetrics}>):InventoryQuantityTotal[]{
  const byUnit=new Map<string,{unit:Unit;onHand:Prisma.Decimal;reserved:Prisma.Decimal;sellable:Prisma.Decimal}>();
  for(const {unit,metrics} of rows){const total=byUnit.get(unit.id)||{unit,onHand:decimal(0),reserved:decimal(0),sellable:decimal(0)};for(const key of ["onHand","reserved","sellable"] as const)total[key]=total[key].plus(metrics[key]);byUnit.set(unit.id,total);}
  return [...byUnit.values()].sort((a,b)=>a.unit.id.localeCompare(b.unit.id)).flatMap(total=>(["onHand","reserved","sellable"] as const).map(metric=>({unitId:total.unit.id,unit:total.unit.symbol||total.unit.name,decimalScale:total.unit.decimalScale,metric,...formatInventoryQuantity(total[metric],total.unit.decimalScale)})));
}

/** Bounded set-based batches reuse canonical FEFO, rather than introducing a
 * second SQL availability policy. The caller owns one RepeatableRead snapshot.
 * No per-item query, partial result, implicit cap, or page-only substitution.
 */
export async function readInventoryQuantityTotalsTx(tx:Prisma.TransactionClient,input:{organizationId:string;where:Prisma.EnterpriseInventoryItemWhereInput;balancesWhere:Prisma.EnterpriseInventoryBalanceWhereInput;lowStock:boolean;businessDate:string;asOf:Date}){
  const byUnit=new Map<string,{unit:Unit;metrics:QuantityMetrics}>();
  let cursor:string|undefined;
  for(;;){
    const items=await tx.enterpriseInventoryItem.findMany({where:{AND:[{organizationId:input.organizationId},input.where]},orderBy:{id:"asc"},take:200,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,lotTracking:true,expiryTracking:true,minimumQuantity:true,catalogItem:{select:{unitOfMeasure:true}},balances:{where:{AND:[{organizationId:input.organizationId},input.balancesWhere]},select:{id:true,warehouseId:true,storageLocationId:true,stockLotId:true,quantityOnHand:true,quantityReserved:true,warehouse:{select:{status:true,archivedAt:true}},storageLocation:{select:{status:true,archivedAt:true}},stockLot:{select:{status:true,archivedAt:true,expiryDate:true}}}}}});
    if(!items.length)break;
    const itemIds=items.map(item=>item.id),warehouseIds=[...new Set(items.flatMap(item=>item.balances.map(row=>row.warehouseId)))];
    const [reservations,holds]=await Promise.all([
      tx.enterpriseInventoryReservation.findMany({where:{organizationId:input.organizationId,inventoryItemId:{in:itemIds},warehouseId:{in:warehouseIds},status:"ACTIVE",OR:[{expiresAt:null},{expiresAt:{gt:input.asOf}}]},select:{inventoryItemId:true,warehouseId:true,quantity:true,fulfilledQuantity:true,lotAllocations:true,storageLocationId:true}}),
      readActiveRetailInvoiceStockHoldsTx(tx,{organizationId:input.organizationId,inventoryItemIds:itemIds,warehouseIds}),
    ]);
    const ordersByItem=new Map<string,Reservation[]>(),holdsByItem=new Map<string,Hold[]>();
    for(const row of reservations){const group=ordersByItem.get(row.inventoryItemId)||[];group.push(row);ordersByItem.set(row.inventoryItemId,group);}
    for(const row of holds){const group=holdsByItem.get(row.inventoryItemId)||[];group.push(row);holdsByItem.set(row.inventoryItemId,group);}
    for(const item of items){const metrics=inventoryQuantityMetrics(item,ordersByItem.get(item.id)||[],holdsByItem.get(item.id)||[],input.businessDate);
      if(input.lowStock&&(item.minimumQuantity===null||metrics.onHand.gt(item.minimumQuantity)))continue;
      const unit=item.catalogItem.unitOfMeasure,current=byUnit.get(unit.id);
      if(current){for(const key of ["onHand","reserved","sellable","legacy","orderReserved","invoiceHeld"] as const)current.metrics[key]=current.metrics[key].plus(metrics[key]);}
      else byUnit.set(unit.id,{unit,metrics});
    }
    cursor=items.at(-1)!.id;
    if(items.length<200)break;
  }
  return inventoryQuantityTotals([...byUnit.values()]);
}
