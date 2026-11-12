/**
 * DTSC curated tax suggestions. This is NOT a tax authority and never silently
 * activates a tax for a tenant. Legal applicability and fiscal-device compliance
 * must be confirmed by the organization before opting in.
 *
 * Source: DGI RDC, https://dgi.gouv.cd/teledeclaration/ (verified 2026-11-12).
 * Rates are decimal fractions: "0.16" means sixteen percent.
 */
export type DtscTaxTemplate = Readonly<{
  code: string;
  version: string;
  jurisdiction: string;
  nameFr: string;
  nameEn: string;
  category: "VAT";
  rate: string;
  effectiveFrom: string;
  sourceAuthority: string;
  sourceUrl: string;
  verifiedAt: string;
  guidanceFr: string;
  guidanceEn: string;
}>;

export const DTSC_TAX_TEMPLATES: readonly DtscTaxTemplate[] = Object.freeze([
  Object.freeze({
    code: "CD-VAT-STANDARD",
    version: "2026.11.12",
    jurisdiction: "CD",
    nameFr: "TVA — Taux normal (RDC)",
    nameEn: "Value-added tax — Standard rate (DR Congo)",
    category: "VAT",
    rate: "0.16",
    effectiveFrom: "2026-11-12",
    sourceAuthority: "Direction générale des impôts (RDC)",
    sourceUrl: "https://dgi.gouv.cd/teledeclaration/",
    verifiedAt: "2026-11-12",
    guidanceFr: "Proposition réservée aux entreprises assujetties et opérations effectivement taxables. Vérifiez le régime, les exonérations et les exigences de facture normalisée.",
    guidanceEn: "Suggested only for VAT-registered businesses and actually taxable operations. Check exemptions and fiscal-invoice requirements.",
  }),
]);

export function listDtscTaxTemplates(jurisdiction: string) {
  return DTSC_TAX_TEMPLATES.filter((template) => template.jurisdiction === jurisdiction);
}

export function getDtscTaxTemplate(code: string, version: string) {
  return DTSC_TAX_TEMPLATES.find((item) => item.code === code && item.version === version) ?? null;
}
