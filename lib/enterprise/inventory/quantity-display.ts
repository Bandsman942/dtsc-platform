/** Format an exact decimal quantity without silently discarding historical fractions.
 * Catalog decimalScale is the authority for normal quantities; an incompatible
 * historical value is preserved exactly and flagged for the caller.
 */
export function formatInventoryQuantity(
  quantity: { decimalPlaces(): number; toFixed(scale: number): string },
  decimalScale: number,
): { value: string; precisionMismatch: boolean } {
  const actualScale = quantity.decimalPlaces();
  if (!Number.isInteger(decimalScale) || decimalScale < 0 || decimalScale > 6) {
    return { value: quantity.toFixed(actualScale), precisionMismatch: true };
  }
  return {
    value: quantity.toFixed(Math.max(actualScale, decimalScale)),
    precisionMismatch: actualScale > decimalScale,
  };
}

/** Excel preserves at most 15 significant digits. Keep larger quantities as
 * exact text instead of first losing their micro-units through Number().
 * This is only an export representation; the canonical value remains decimal.
 */
export function inventoryQuantityExportValue(value: string): string | number {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  const significant = value.replace(/^-/, "").replace(".", "").replace(/^0+/, "");
  if (significant.length > 15) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

/** Exact HTML step for a configured catalog unit. Missing configuration remains
 * explicit so callers can disable editing instead of inventing a precision. */
export function inventoryQuantityStep(decimalScale: number | undefined): string | undefined {
  if (typeof decimalScale !== "number" || !Number.isInteger(decimalScale) || decimalScale < 0 || decimalScale > 6) return undefined;
  return decimalScale === 0 ? "1" : `0.${"0".repeat(decimalScale - 1)}1`;
}

/** Browser validation complements the authoritative Decimal check on the server. */
export function isInventoryQuantityInputValid(value: string, decimalScale: number | undefined, positive = true): boolean {
  if (typeof decimalScale !== "number" || !inventoryQuantityStep(decimalScale) || !/^\d+(?:\.\d+)?$/.test(value.trim())) return false;
  const [integer, fraction = ""] = value.trim().split(".");
  if (integer.replace(/^0+/, "").length > 15 || fraction.replace(/0+$/, "").length > decimalScale) return false;
  return !positive || /[1-9]/.test(integer + fraction);
}

/** Exact millionths for forms that must sum several valid physical quantities. */
export function inventoryQuantityMicrounits(value: string): bigint {
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
}

export function localizeInventoryQuantity(value: string, locale: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!parts) return value;
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(({ type }) => type === "decimal")?.value ?? ".";
  return parts[1] + formatter.format(BigInt(parts[2])) + (parts[3] ? separator + parts[3] : "");
}

export type InventoryQuantityMetric = "onHand" | "reserved" | "sellable";
export function inventoryQuantityMetricLabel(metric: InventoryQuantityMetric, locale: "fr" | "en"): string {
  const labels = { onHand: { fr: "Stock physique", en: "On-hand stock" }, reserved: { fr: "Réservations et retenues", en: "Reservations and holds" }, sellable: { fr: "Stock vendable", en: "Sellable stock" } };
  return labels[metric][locale];
}
