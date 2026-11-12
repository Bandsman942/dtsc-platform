/**
 * DGI RDC e-DEF / DEF READINESS ONLY, no fiscal device, certificate or
 * homologation is connected to DTSC Platform. Never generate DEF serial,
 * authorization code or QR from these unverified facts.
 * Official reference: https://dgi.gouv.cd/reforme-de-la-facture-normalisee/
 */
export type DgiInvoiceDraft = {
  companyCountry: string | null;
  seller: { legalName: string | null; nif: string | null; rccm: string | null; address: string | null };
  buyer: { legalName: string | null; nif: string | null };
  invoice: {
    number: string; issueDate: Date | null; status: string; currencyCode: string;
    subtotal: string; taxTotal: string; grandTotal: string;
    lines: Array<{ description: string; quantity: string; unitPrice: string; taxAmount: string;
      taxCodeId: string | null; taxBreakdownJson: unknown }>;
  };
};
export type DgiReadiness = {
  purpose: "DATA_COMPLETENESS_CHECK";
  certificationState: "NOT_HOMOLOGATED";
  canTransmit: false;
  canClaimNormalizedInvoice: false;
  readyForLegalReview: boolean;
  missing: string[];
  warnings: string[];
  officialSource: string;
};
export function evaluateDgiReadiness(source: DgiInvoiceDraft): DgiReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];
  const required = (value: string | null | undefined, key: string) => {
    if (!value?.trim()) missing.push(key);
  };
  if (source.companyCountry !== "CD") warnings.push("DGI_RDC_SCOPE_ONLY");
  required(source.seller.legalName, "SELLER_LEGAL_NAME");
  required(source.seller.nif, "SELLER_NIF");
  required(source.seller.rccm, "SELLER_RCCM");
  required(source.seller.address, "SELLER_ADDRESS");
  required(source.buyer.legalName, "BUYER_NAME");
  required(source.buyer.nif, "BUYER_TAX_NUMBER");
  required(source.invoice.number, "INVOICE_NUMBER");
  if (!source.invoice.issueDate) missing.push("INVOICE_DATE");
  if (!["ISSUED", "PAID", "PARTIALLY_PAID", "OVERDUE"].includes(source.invoice.status)) warnings.push("DOCUMENT_NOT_FINAL");
  if (!source.invoice.currencyCode.trim()) missing.push("CURRENCY");
  if (!source.invoice.lines.length) missing.push("INVOICE_LINES");
  for (const [index, line] of source.invoice.lines.entries()) {
    if (!line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0) missing.push(`LINE_${index + 1}_DETAIL`);
    if (Number(line.taxAmount) > 0 && !line.taxCodeId && !Array.isArray(line.taxBreakdownJson)) {
      missing.push(`LINE_${index + 1}_TAX_PROVENANCE`);
    }
  }
  const numbers = [source.invoice.subtotal, source.invoice.taxTotal, source.invoice.grandTotal].map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) missing.push("TOTALS_NUMERIC");
  return {
    purpose: "DATA_COMPLETENESS_CHECK",
    certificationState: "NOT_HOMOLOGATED", canTransmit: false,
    canClaimNormalizedInvoice: false,
    readyForLegalReview: source.companyCountry === "CD" && !missing.length && !warnings.includes("DOCUMENT_NOT_FINAL"),
    missing, warnings,
    officialSource: "https://dgi.gouv.cd/reforme-de-la-facture-normalisee/",
  };
}
