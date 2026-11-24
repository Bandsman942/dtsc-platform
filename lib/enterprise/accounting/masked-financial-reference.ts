export function maskFinancialReference(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const tail = normalized.replace(/[^\p{L}\p{N}]/gu, "").slice(-4);
  return tail ? "•••• " + tail : "••••";
}
