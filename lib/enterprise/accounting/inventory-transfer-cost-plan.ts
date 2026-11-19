import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { planWeightedAverageResidualQuantities } from "@/lib/enterprise/accounting/inventory-accounting-service";

/**
 * Pure, fail-closed proof for a transfer of an existing valued asset.
 * Quantities and unit costs are represented at the actual database scale (6).
 * Their products use exact integer arithmetic at scale 12. No exchange rate,
 * new purchase price, sale price or invented compensating cost is introduced.
 *
 * The caller must independently prove the source layers and journals, pass
 * physical warehouse quantities before the relevant movement, and persist
 * this plan atomically with the dispatch/receipt. This module is not itself
 * a posting operation or an authorization decision.
 */
type CostLayer = {
  id: string;
  remainingQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  currencyCode: string;
};
type Pool = {
  currencyCode: string;
  physicalQuantity: Prisma.Decimal;
  layers: ReadonlyArray<CostLayer>;
};
const scale = BigInt(1000000);
const zero = BigInt(0);
const maxStored = BigInt("99999999999999999999");

function unproven(): never {
  throw new EnterpriseAccountingError("INVENTORY_TRANSFER_COST_POOL_UNPROVEN",409);
}
function unrepresentable(): never {
  throw new EnterpriseAccountingError("INVENTORY_TRANSFER_COST_NOT_EXACT",409);
}

function micros(value: Prisma.Decimal, stored = true): bigint {
  if (!value.isFinite() || value.isNegative() || value.decimalPlaces()>6) return unrepresentable();
  const units = BigInt(value.toFixed(6).replace(".",""));
  if (stored && units > maxStored) return unrepresentable();
  return units;
}
function decimalFromMicros(units: bigint): Prisma.Decimal {
  // Construct from text rather than multiplying/dividing large Decimals in
  // the default 20-significant-digit arithmetic context.
  const digits=units.toString().padStart(7,"0");
  return new Prisma.Decimal(digits.slice(0,-6)+"."+digits.slice(-6));
}
function roundRatio(numerator: bigint, denominator: bigint): bigint {
  const remainder=numerator%denominator;
  return numerator/denominator+(remainder*BigInt(2)>=denominator?BigInt(1):zero);
}
function moneyFromRaw(value: bigint): bigint {
  return roundRatio(value,scale);
}
function readPool(pool: Pool) {
  if (!/^[A-Z]{3}$/.test(pool.currencyCode)) return unproven();
  const physical=micros(pool.physicalQuantity,false);
  const ids=new Set<string>();
  let quantity=zero,value=zero;
  const rows=pool.layers.map(layer=>{
    if(!layer.id || ids.has(layer.id) || layer.currencyCode!==pool.currencyCode) return unproven();
    ids.add(layer.id);
    const remaining=micros(layer.remainingQuantity);
    const cost=micros(layer.unitCost);
    if(remaining>zero && cost<=zero) return unproven();
    quantity+=remaining;
    value+=remaining*cost;
    return {layer,remaining,cost};
  });
  if(quantity!==physical) return unproven();
  return {rows,quantity,value};
}

export type InventoryTransferCostPlan = {
  currencyCode: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  sourceQuantityBefore: Prisma.Decimal;
  sourceQuantityAfter: Prisma.Decimal;
  sourceValueBefore: Prisma.Decimal;
  sourceValueAfter: Prisma.Decimal;
  allocations: Array<{
    layerId: string;
    quantityBefore: Prisma.Decimal;
    remainingQuantity: Prisma.Decimal;
    transferredQuantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
  }>;
};

/**
 * Produce an exact CUMP plan only when one destination layer can represent
 * the amount removed from the source at the existing schema precision.
 * Non-representable mixed-cost pools need a richer coordinated allocation
 * model; they must not be silently approximated by this primitive.
 */
export function planInventoryTransferCost(pool: Pool, quantity: Prisma.Decimal): InventoryTransferCostPlan {
  const source=readPool(pool);
  const moved=micros(quantity);
  // Physical movement columns persist three fractional digits.
  if(quantity.decimalPlaces()>3 || moved<=zero || moved>source.quantity) return unproven();
  const residual=planWeightedAverageResidualQuantities(pool.layers, quantity);
  const byId=new Map(residual.map(row=>[row.id,micros(row.remainingQuantity)]));
  let remainingValue=zero,remainingQuantity=zero;
  const allocations=source.rows.map(({layer,remaining,cost})=>{
    const next=byId.get(layer.id);
    if(next===undefined || next<zero || next>remaining) return unrepresentable();
    remainingQuantity+=next;
    remainingValue+=next*cost;
    return {
      layerId:layer.id,
      quantityBefore:decimalFromMicros(remaining),
      remainingQuantity:decimalFromMicros(next),
      transferredQuantity:decimalFromMicros(remaining-next),
      unitCost:layer.unitCost,
    };
  });
  const unitCost=roundRatio(source.value,source.quantity);
  const removed=source.value-remainingValue;
  const total=moneyFromRaw(removed);
  const before=moneyFromRaw(source.value),after=moneyFromRaw(remainingValue);
  // Require exact raw value conservation AND reconciled rounded reports.
  if(remainingQuantity!==source.quantity-moved || unitCost<=zero || unitCost>maxStored
      || total<=zero || total>maxStored || removed!==moved*unitCost || before-after!==total) return unrepresentable();
  return {
    currencyCode:pool.currencyCode,quantity,unitCost:decimalFromMicros(unitCost),totalCost:decimalFromMicros(total),
    sourceQuantityBefore:decimalFromMicros(source.quantity),sourceQuantityAfter:decimalFromMicros(remainingQuantity),
    sourceValueBefore:decimalFromMicros(before),sourceValueAfter:decimalFromMicros(after),allocations,
  };
}

/** Validate reception against the live destination pool. A concurrent or
 * intervening change must never convert transit cost into a rounding gain. */
export function proveInventoryTransferDestination(
  destination: Pool,
  transfer: Pick<InventoryTransferCostPlan,"currencyCode"|"quantity"|"unitCost"|"totalCost">,
) {
  if(destination.currencyCode!==transfer.currencyCode) return unproven();
  const pool=readPool(destination);
  const quantity=micros(transfer.quantity),unitCost=micros(transfer.unitCost),totalCost=micros(transfer.totalCost);
  if(transfer.quantity.decimalPlaces()>3 || quantity<=zero || unitCost<=zero || totalCost<=zero) return unproven();
  const increment=quantity*unitCost;
  const before=moneyFromRaw(pool.value),after=moneyFromRaw(pool.value+increment);
  if(moneyFromRaw(increment)!==totalCost || after-before!==totalCost) return unrepresentable();
  return {
    destinationQuantityBefore:decimalFromMicros(pool.quantity),destinationQuantityAfter:decimalFromMicros(pool.quantity+quantity),
    destinationValueBefore:decimalFromMicros(before),destinationValueAfter:decimalFromMicros(after),
  };
}
