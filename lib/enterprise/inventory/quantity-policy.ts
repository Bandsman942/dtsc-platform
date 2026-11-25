import { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

// Local arithmetic context: a 21,6 quantity must retain its last micro-unit
// when added near the previous ledger's 15-digit integer capacity.
const ExactQuantity = Prisma.Decimal.clone({ precision: 48 });
const physicalLimit = "1000000000000000";

/** The catalog's effective unit is authoritative; this never rounds a value.
 * Zero is useful for counts/thresholds. Movement callers require positive=true.
 * Archived units still describe existing stock; malformed/missing units fail closed.
 */
export function requireInventoryQuantity(
  value: Prisma.Decimal.Value,
  decimalScale: number,
  options: { positive?: boolean; signed?: boolean } = {},
): Prisma.Decimal {
  const quantity = new Prisma.Decimal(value);
  if (!quantity.isFinite() || quantity.abs().gte(physicalLimit) || quantity.decimalPlaces() > 6
      || (!options.signed && quantity.lt(0)) || (options.positive && quantity.lte(0))) {
    throw new EnterpriseDomainError("INVENTORY_PHYSICAL_QUANTITY_PRECISION", 400);
  }
  if (!Number.isInteger(decimalScale) || decimalScale < 0 || decimalScale > 6
      || quantity.decimalPlaces() > decimalScale) {
    throw new EnterpriseDomainError("INVENTORY_UNIT_QUANTITY_PRECISION", 400);
  }
  return quantity;
}

export function addInventoryQuantities(left: Prisma.Decimal.Value, right: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(new ExactQuantity(left).plus(right).toFixed());
}

/** Used only with a trusted, tenant-scoped conversion factor. The caller must
 * resolve that reference and preserve it in its existing operation snapshot.
 * No conversion is inferred from a unit name or symbol.
 */
export function convertInventoryQuantity(
  value: Prisma.Decimal.Value, factor: Prisma.Decimal.Value, targetDecimalScale: number,
): Prisma.Decimal {
  const multiplier = new ExactQuantity(factor);
  if (!multiplier.isFinite() || multiplier.lte(0)) {
    throw new EnterpriseDomainError("INVENTORY_UNIT_CONVERSION_INVALID", 400);
  }
  const converted = new ExactQuantity(value).mul(multiplier);
  return requireInventoryQuantity(converted.toFixed(), targetDecimalScale, { signed: true });
}
