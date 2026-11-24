/** Display-only projection. Do not write this projection back to storage. */
export function maskFinancialReference(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const characters = Array.from(normalized.replace(/[^\p{L}\p{N}]/gu, ""));
  // Already masked references remain idempotent; short raw references must never be disclosed.
  if (normalized === "••••") return normalized;
  if (/^•••• [\p{L}\p{N}]{1,4}$/u.test(normalized)) return normalized;
  return characters.length > 4 ? "•••• " + characters.slice(-4).join("") : "••••";
}
