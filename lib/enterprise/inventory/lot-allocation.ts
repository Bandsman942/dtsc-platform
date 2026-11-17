import { Prisma } from "@prisma/client";

export type LotAllocationCandidate = {
  id: string;
  status: string;
  expiryDate: Date | null;
  quantityOnHand: Prisma.Decimal;
  quantityReserved: Prisma.Decimal;
  quantityHeld?: Prisma.Decimal;
};

export function lotExpiryDateKey(expiryDate: Date): string {
  return expiryDate.toISOString().slice(0, 10);
}

/** Physical allocation, not accounting valuation. No mutation or invented lot.
 * Caller must load tenant/warehouse scoped balances and current promises within
 * the same serializable transaction as the operation applying this plan. */
export function planFefoLots(input: {
  candidates: LotAllocationCandidate[];
  quantity: Prisma.Decimal.Value;
  businessDate: string;
  expiryMode: "ALLOW" | "WARN" | "BLOCK";
  requireExpiry?: boolean;
  unallocatedReserved?: Prisma.Decimal;
}) {
  const zero = new Prisma.Decimal(0);
  const requested = new Prisma.Decimal(input.quantity);
  if (!requested.isFinite() || requested.lte(0) || requested.decimalPlaces() > 3) {
    throw new RangeError("Invalid physical allocation quantity");
  }
  const isExpired = (lot: LotAllocationCandidate) => Boolean(lot.expiryDate && lotExpiryDateKey(lot.expiryDate) < input.businessDate);
  const unique = new Set<string>();
  const candidates = input.candidates.filter((lot) => {
    if (unique.has(lot.id)) throw new RangeError("Duplicate lot candidate");
    unique.add(lot.id);
    return lot.status === "AVAILABLE" && (!input.requireExpiry || lot.expiryDate !== null) && (input.expiryMode !== "BLOCK" || !isExpired(lot));
  }).sort((a, b) => Number(isExpired(a)) - Number(isExpired(b))
    || (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id));
  let remaining = requested;
  // Existing unallocated sales-order reservations have no batch identity.
  // Keep the entire amount unavailable in each candidate, consistently with
  // existing retail checkout availability checks, until explicit assignments
  // exist. Conservative, but cannot sell the same physical units twice.
  const unallocated = input.unallocatedReserved || zero;
  const allocations: Array<{ stockLotId: string; quantity: Prisma.Decimal; expired: boolean }> = [];
  for (const lot of candidates) {
    if (remaining.lte(0)) break;
    const free = lot.quantityOnHand.minus(lot.quantityReserved).minus(lot.quantityHeld || zero).minus(unallocated);
    if (free.lte(0)) continue;
    const quantity = free.lt(remaining) ? free : remaining;
    allocations.push({ stockLotId: lot.id, quantity, expired: isExpired(lot) });
    remaining = remaining.minus(quantity);
  }
  return { allocations, shortfall: remaining };
}
