const DRC_COUNTRY_MARKERS = new Set([
  "CD",
  "COD",
  "RDC",
  "DRC",
  "CONGO RDC",
  "CONGO-KINSHASA",
  "DEMOCRATIC REPUBLIC OF THE CONGO",
]);

function normalizeCountry(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z -]/g, "");
}

export function requiredRetailOperatorCurrencies(country: string | null | undefined) {
  return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : [];
}

export function isRetailOperatorCurrencyReady(country: string | null | undefined, currencies: Iterable<string>) {
  // Readiness must count only real normalized ISO-like currency values. This keeps the
  // shared Mobile Money/Telco policy deterministic even if a future caller passes blanks.
  const mapped = new Set(
    Array.from(currencies, (currency) => currency.trim().toUpperCase()).filter(Boolean),
  );
  const required = requiredRetailOperatorCurrencies(country);
  return required.length ? required.every((currency) => mapped.has(currency)) : mapped.size >= 2;
}
