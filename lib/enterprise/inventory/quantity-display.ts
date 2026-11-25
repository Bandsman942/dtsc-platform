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
