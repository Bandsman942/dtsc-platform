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
