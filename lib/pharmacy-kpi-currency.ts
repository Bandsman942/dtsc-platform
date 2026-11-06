/**
 * A historical base-currency amount is only comparable with the pharmacy's
 * current base currency when every sale in the window shares that currency.
 * Never silently sum a USD historical base with a CDF historical base.
 */
export type PharmacyBaseAmountGroup = {
  baseCurrency: string;
  _sum: { totalAmountBase: { toString(): string } | number | null };
};

export type PharmacyAmountKpi = {
  amount: number | null;
  reliable: boolean;
};

export function resolvePharmacyAmountKpi(
  groups: PharmacyBaseAmountGroup[],
  currentBaseCurrency: string,
  invalidSnapshotCount: number,
): PharmacyAmountKpi {
  if (!currentBaseCurrency || invalidSnapshotCount > 0 ||
    groups.some((group) => group.baseCurrency !== currentBaseCurrency)) {
    return { amount: null, reliable: false };
  }

  const amount = groups.reduce((total, group) => total + Number(group._sum.totalAmountBase || 0), 0);
  return Number.isFinite(amount)
    ? { amount, reliable: true }
    : { amount: null, reliable: false };
}
