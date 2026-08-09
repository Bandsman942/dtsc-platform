const PHARMACY_TOOL_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "PHARMACY_LOW_STOCK_READ", pattern: /stock\s*(faible|bas|minim)|rupture|réappro|reappro/i },
  { code: "PHARMACY_EXPIRY_READ", pattern: /pérem|perem|expir|fefo|lot/i },
  { code: "PHARMACY_OPEN_ALERTS_READ", pattern: /alerte|urgent|notification/i },
  { code: "PHARMACY_TODAY_SALES_READ", pattern: /vente|recette|chiffre|caissier/i },
  { code: "PHARMACY_CASH_SESSIONS_READ", pattern: /caisse|paiement|écart|ecart|session/i },
  { code: "PHARMACY_OPEN_PURCHASES_READ", pattern: /achat|commande|fournisseur|approvisionnement/i },
  { code: "PHARMACY_QUALITY_INCIDENTS_READ", pattern: /qualité|qualite|incident|pharmacovigilance/i },
  { code: "PHARMACY_DOCUMENTS_SUMMARY_READ", pattern: /document|certificat|conformité|conformite/i },
];

export function selectPharmacyReadToolCodes(content: string) {
  const selected = ["PHARMACY_DASHBOARD_READ"];
  for (const candidate of PHARMACY_TOOL_PATTERNS) {
    if (candidate.pattern.test(content)) selected.push(candidate.code);
  }
  return Array.from(new Set(selected)).slice(0, 6);
}
