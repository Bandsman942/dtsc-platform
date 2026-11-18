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
  // Expiry is a date-only label stored at UTC midnight, not the current
  // business date. Decode its calendar fields without shifting time zones.
  const year = String(expiryDate.getUTCFullYear()).padStart(4, "0");
  const month = String(expiryDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(expiryDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

/** Exact per-balance allocations are stored on the canonical reservation,
 * not as a second stock ledger. A null snapshot identifies a legacy promise.
 * Corrupt snapshots fail closed rather than making more stock available. */
export type ReservationLotAllocation = {
  balanceId: string;
  stockLotId: string;
  storageLocationId: string | null;
  quantity: string;
  fulfilledQuantity: string;
};
type ReservationSnapshot = { quantity: Prisma.Decimal; fulfilledQuantity: Prisma.Decimal; lotAllocations?: Prisma.JsonValue | null; storageLocationId?: string | null };

export function readReservationLotAllocations(reservation: ReservationSnapshot): ReservationLotAllocation[] | null {
  if (reservation.lotAllocations == null) return null;
  if (!Array.isArray(reservation.lotAllocations) || !reservation.lotAllocations.length) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
  const seen = new Set<string>();
  let quantity = new Prisma.Decimal(0), fulfilled = new Prisma.Decimal(0);
  const allocations: ReservationLotAllocation[] = [];
  for (const value of reservation.lotAllocations) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
    const { balanceId, stockLotId, storageLocationId, quantity: rawQuantity, fulfilledQuantity: rawFulfilled } = value;
    if (typeof balanceId !== "string" || !balanceId || seen.has(balanceId) || typeof stockLotId !== "string" || !stockLotId || !(storageLocationId === null || typeof storageLocationId === "string") || typeof rawQuantity !== "string" || typeof rawFulfilled !== "string" || !/^\d{1,15}(\.\d{1,3})?$/.test(rawQuantity) || !/^\d{1,15}(\.\d{1,3})?$/.test(rawFulfilled)) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
    const q = new Prisma.Decimal(rawQuantity), f = new Prisma.Decimal(rawFulfilled);
    if (q.lte(0) || f.lt(0) || f.gt(q)) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
    quantity = quantity.plus(q); fulfilled = fulfilled.plus(f); seen.add(balanceId);
    allocations.push({ balanceId, stockLotId, storageLocationId, quantity: rawQuantity, fulfilledQuantity: rawFulfilled });
  }
  if (!quantity.equals(reservation.quantity) || !fulfilled.equals(reservation.fulfilledQuantity)) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
  return allocations;
}

export function reservationLegacyRemaining(reservation: ReservationSnapshot) {
  return readReservationLotAllocations(reservation) === null ? reservation.quantity.minus(reservation.fulfilledQuantity) : new Prisma.Decimal(0);
}

export function reservationLotRemaining(reservation: ReservationSnapshot, stockLotId: string | null) {
  const allocations = readReservationLotAllocations(reservation);
  if (!allocations) return reservation.quantity.minus(reservation.fulfilledQuantity);
  return allocations.filter((entry) => entry.stockLotId === stockLotId).reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.quantity).minus(entry.fulfilledQuantity)), new Prisma.Decimal(0));
}

export function reservationExactBalanceRemaining(reservation: ReservationSnapshot, balanceId: string) {
  return (readReservationLotAllocations(reservation) || []).filter((entry) => entry.balanceId === balanceId).reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.quantity).minus(entry.fulfilledQuantity)), new Prisma.Decimal(0));
}

/** Create one immutable coordinate per physical balance. Existing unallocated
 * promises remain conservatively protected; invoice holds are distributed once
 * per lot, not once per shelf. The caller provides all scoped warehouse rows. */
export function planReservationLotAllocations(input: {
  balances: Array<{ id: string; stockLotId: string | null; storageLocationId: string | null; quantityOnHand: Prisma.Decimal; quantityReserved: Prisma.Decimal; stockLot: { status: string; archivedAt: Date | null; expiryDate: Date | null } | null }>;
  reservations: ReservationSnapshot[];
  holds: Array<{ stockLotId: string | null; quantity: Prisma.Decimal }>;
  quantity: Prisma.Decimal.Value;
  businessDate: string;
  requireExpiry: boolean;
  storageLocationId?: string | null;
}) {
  const zero = () => new Prisma.Decimal(0);
  const legacy = input.reservations.reduce((sum, entry) => sum.plus(reservationLegacyRemaining(entry)), zero()).plus(input.holds.filter((hold) => !hold.stockLotId).reduce((sum, hold) => sum.plus(hold.quantity), zero()));
  const holdByLot = new Map<string, Prisma.Decimal>();
  for (const hold of input.holds) if (hold.stockLotId) holdByLot.set(hold.stockLotId, (holdByLot.get(hold.stockLotId) || zero()).plus(hold.quantity));
  const byId = new Map(input.balances.map((balance) => [balance.id, balance]));
  const candidates: LotAllocationCandidate[] = [];
  const balances = [...input.balances].sort((a, b) => Number(Boolean(input.storageLocationId && b.storageLocationId === input.storageLocationId)) - Number(Boolean(input.storageLocationId && a.storageLocationId === input.storageLocationId)) || a.id.localeCompare(b.id));
  for (const balance of balances) {
    if (!balance.stockLotId || !balance.stockLot || balance.stockLot.archivedAt || balance.stockLot.status !== "AVAILABLE") continue;
    if (input.storageLocationId && balance.storageLocationId !== input.storageLocationId) continue;
    const exact = input.reservations.reduce((sum, entry) => sum.plus(reservationExactBalanceRemaining(entry, balance.id)), zero());
    const reserved = balance.quantityReserved.plus(exact).plus(legacy);
    const free = balance.quantityOnHand.minus(reserved);
    const held = holdByLot.get(balance.stockLotId) || zero();
    const take = free.gt(0) ? (held.lt(free) ? held : free) : zero();
    holdByLot.set(balance.stockLotId, held.minus(take));
    candidates.push({ id: balance.id, status: balance.stockLot.status, expiryDate: balance.stockLot.expiryDate, quantityOnHand: balance.quantityOnHand, quantityReserved: reserved, quantityHeld: take });
  }
  const plan = planFefoLots({ candidates, quantity: input.quantity, businessDate: input.businessDate, expiryMode: "BLOCK", requireExpiry: input.requireExpiry });
  return { shortfall: plan.shortfall, allocations: plan.allocations.map((entry): ReservationLotAllocation => {
    const balance = byId.get(entry.stockLotId)!;
    return { balanceId: balance.id, stockLotId: balance.stockLotId!, storageLocationId: balance.storageLocationId, quantity: entry.quantity.toFixed(), fulfilledQuantity: "0" };
  }) };
}

export function consumeReservationLotAllocations(allocations: ReservationLotAllocation[], requested: Prisma.Decimal) {
  let remaining = requested;
  const movements: Array<ReservationLotAllocation & { consumedQuantity: string }> = [];
  const next = allocations.map((entry) => {
    const fulfilled = new Prisma.Decimal(entry.fulfilledQuantity);
    const available = new Prisma.Decimal(entry.quantity).minus(fulfilled);
    const take = remaining.lt(available) ? remaining : available;
    if (take.lte(0)) return entry;
    remaining = remaining.minus(take);
    movements.push({ ...entry, consumedQuantity: take.toFixed() });
    return { ...entry, fulfilledQuantity: fulfilled.plus(take).toFixed() };
  });
  if (remaining.gt(0)) throw new Error("INVENTORY_RESERVATION_ALLOCATION_INVALID");
  return { next, movements };
}

/** The invoice retains a single financial line. Its physical batch promises
 * are a quantity-conserving snapshot; old single-lot lines are unchanged.
 * An undelivered credit releases the tail of the original FEFO allocation,
 * preserving earlier batches. No new physical allocation is invented. */
export type InvoiceLotAllocation = { stockLotId: string; quantity: string };
export function readInvoiceLotAllocations(line: { stockLotId: string | null; lotAllocations?: Prisma.JsonValue | null; invoiceItem: { quantity: Prisma.Decimal } }, cancelled: Prisma.Decimal = new Prisma.Decimal(0)) {
  const total = new Prisma.Decimal(line.invoiceItem.quantity);
  if (cancelled.lt(0) || cancelled.gt(total)) throw new Error("RETAIL_INVOICE_LOT_ALLOCATION_INVALID");
  let remaining = total.minus(cancelled);
  if (line.lotAllocations == null) return remaining.gt(0) ? [{ stockLotId: line.stockLotId, quantity: remaining }] : [];
  if (line.stockLotId || !Array.isArray(line.lotAllocations) || !line.lotAllocations.length) throw new Error("RETAIL_INVOICE_LOT_ALLOCATION_INVALID");
  const entries: Array<{ stockLotId: string; quantity: Prisma.Decimal }> = [];
  const seen = new Set<string>();
  for (const value of line.lotAllocations) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.stockLotId !== "string" || !value.stockLotId || seen.has(value.stockLotId) || typeof value.quantity !== "string" || !/^\d{1,15}(\.\d{1,3})?$/.test(value.quantity)) throw new Error("RETAIL_INVOICE_LOT_ALLOCATION_INVALID");
    const quantity = new Prisma.Decimal(value.quantity);
    if (!quantity.gt(0)) throw new Error("RETAIL_INVOICE_LOT_ALLOCATION_INVALID");
    seen.add(value.stockLotId);
    entries.push({ stockLotId: value.stockLotId, quantity });
  }
  if (!entries.reduce((sum, entry) => sum.plus(entry.quantity), new Prisma.Decimal(0)).equals(total)) throw new Error("RETAIL_INVOICE_LOT_ALLOCATION_INVALID");
  return entries.flatMap((entry) => {
    const take = entry.quantity.lt(remaining) ? entry.quantity : remaining;
    remaining = remaining.minus(take);
    return take.gt(0) ? [{ stockLotId: entry.stockLotId, quantity: take }] : [];
  });
}
