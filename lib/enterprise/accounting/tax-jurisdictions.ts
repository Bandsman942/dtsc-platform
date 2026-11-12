/** ISO 3166 country jurisdictions supported by the tax configuration UI.
 * Labels are resolved using Intl.DisplayNames to avoid an independent translation registry.
 * Unknown countries must be configured centrally; never silently infer a tax regime.
 */
export const TAX_COUNTRY_CODES = [
  "AO", "BF", "BI", "BJ", "BW", "CA", "CD", "CF", "CG", "CH", "CI", "CM", "CN", "DE",
  "DJ", "DZ", "EG", "ES", "ET", "FR", "GA", "GB", "GH", "GM", "GN", "GQ", "GW", "IN",
  "IT", "JP", "KE", "KM", "LR", "LS", "LU", "MA", "MG", "ML", "MR", "MU", "MW", "MZ",
  "NA", "NE", "NG", "NL", "NO", "RW", "SC", "SD", "SE", "SL", "SN", "SO", "SS", "ST",
  "SZ", "TD", "TG", "TN", "TZ", "UG", "US", "ZA", "ZM", "ZW", "BE", "BR", "AE", "PT",
] as const;

export const DRC_PROVINCES = [
  "Bas-Uele", "Équateur", "Haut-Katanga", "Haut-Lomami", "Haut-Uele", "Ituri",
  "Kasaï", "Kasaï-Central", "Kasaï-Oriental", "Kinshasa", "Kongo-Central",
  "Kwango", "Kwilu", "Lomami", "Lualaba", "Mai-Ndombe", "Maniema", "Mongala",
  "Nord-Kivu", "Nord-Ubangi", "Sankuru", "Sud-Kivu", "Sud-Ubangi", "Tanganyika",
  "Tshopo", "Tshuapa",
] as const;

const COUNTRY_ALIASES: Record<string, string> = {
  "RDC": "CD", "DRC": "CD", "COD": "CD", "CONGO-KINSHASA": "CD",
  "DEMOCRATIC REPUBLIC OF THE CONGO": "CD", "REPUBLIQUE DEMOCRATIQUE DU CONGO": "CD",
  "RÉPUBLIQUE DÉMOCRATIQUE DU CONGO": "CD", "CONGO-BRAZZAVILLE": "CG",
  "REPUBLIC OF THE CONGO": "CG", "REPUBLIQUE DU CONGO": "CG", "RÉPUBLIQUE DU CONGO": "CG",
};

export function normalizeTaxCountryCode(value: string | null | undefined): string | null {
  const input = (value || "").trim().toUpperCase();
  if (!input) return null;
  const code = COUNTRY_ALIASES[input] || input;
  return (TAX_COUNTRY_CODES as readonly string[]).includes(code) ? code : null;
}

export function taxCountryOptions(locale: "fr" | "en") {
  const names = new Intl.DisplayNames([locale === "en" ? "en" : "fr"], { type: "region" });
  return [...TAX_COUNTRY_CODES].sort((a, b) => (names.of(a) || a).localeCompare(names.of(b) || b, locale)).map((code) => ({
    code, label: names.of(code) || code,
  }));
}
