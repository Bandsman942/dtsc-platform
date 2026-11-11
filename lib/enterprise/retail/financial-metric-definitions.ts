import type { RetailExecutiveMetric } from "@/lib/enterprise/retail/executive-metrics";

/**
 * Immutable, browser-safe interpretation of existing RETAIL KPI projections.
 *
 * This is NOT an authority for permissions, balances, accounting or posting.
 * Backend services and their module-specific RBAC remain the only authorities.
 * Unknown/uncertified data must never be inferred from this registry.
 */
export type RetailMetricTimeBasis = "PERIOD_FLOW" | "CURRENT_BALANCE" | "ISSUANCE_PERIOD_CURRENT_ALLOCATION";
export type RetailMetricEvidence = "LEGACY_POS" | "FINANCE_INVOICE" | "FINANCE_PAYMENT" | "FINANCE_RECEIVABLE" | "POSTED_LEDGER" | "APPROVED_EXPENSE" | "MOBILE_MONEY" | "TELCO" | "FINANCIAL_ACCOUNT";
export type RetailMetricDefinition = {
  timeBasis: RetailMetricTimeBasis;
  evidence: RetailMetricEvidence;
  dateField: string | null;
  /** Context is deliberately short enough for KPI cards; not a certification. */
  interpretation: { fr: string; en: string };
};

export const RETAIL_METRIC_DEFINITIONS = {
  posSales: {
    timeBasis: "PERIOD_FLOW", evidence: "LEGACY_POS", dateField: "soldAt",
    interpretation: { fr: "Tickets historiques clôturés pendant la période ; distincts des factures Finance.", en: "Legacy POS tickets closed in the period; separate from Finance invoices." },
  },
  posCollections: {
    timeBasis: "PERIOD_FLOW", evidence: "LEGACY_POS", dateField: "soldAt",
    interpretation: { fr: "Règlements des tickets POS historiques ; ne pas additionner aux encaissements Finance sans rapprochement.", en: "Legacy POS ticket tenders; do not combine with Finance receipts without reconciliation." },
  },
  financeCollections: {
    timeBasis: "PERIOD_FLOW", evidence: "FINANCE_PAYMENT", dateField: "paymentDate",
    interpretation: { fr: "Allocations confirmées aux factures Retail, par date de paiement dans la période ; distinctes des soldes de créances.", en: "Confirmed Retail invoice allocations by payment date in the period; distinct from receivable balances." },
  },
  invoices: {
    timeBasis: "PERIOD_FLOW", evidence: "FINANCE_INVOICE", dateField: "issuedAt",
    interpretation: { fr: "Factures émises pendant la période, nettes des avoirs actuellement enregistrés ; montant TTC, pas CA HT.", en: "Invoices issued in the period, net of currently recorded credits; gross including tax, not net revenue." },
  },
  invoiceAllocated: {
    timeBasis: "ISSUANCE_PERIOD_CURRENT_ALLOCATION", evidence: "FINANCE_INVOICE", dateField: "issuedAt",
    interpretation: { fr: "Règlements cumulés à date des factures émises dans la période ; ce n'est pas l'encaissement de cette période.", en: "Lifetime allocations to invoices issued in the period; not cash collected during that period." },
  },
  outstanding: {
    timeBasis: "CURRENT_BALANCE", evidence: "FINANCE_RECEIVABLE", dateField: null,
    interpretation: { fr: "Soldes impayés actuels des factures Retail, toutes dates d'émission ; pas un solde historique reconstitué.", en: "Current open Retail invoice balances across issue dates; not a reconstructed historical balance." },
  },
  overdue: {
    timeBasis: "CURRENT_BALANCE", evidence: "FINANCE_RECEIVABLE", dateField: null,
    interpretation: { fr: "Créances actuellement impayées dont l'échéance est passée ; ancienneté arrêtée au jour de consultation.", en: "Currently unpaid amounts past due at the time of consultation." },
  },
  expenses: {
    timeBasis: "PERIOD_FLOW", evidence: "APPROVED_EXPENSE", dateField: "expenseDate",
    interpretation: { fr: "Dépenses approuvées pendant la période ; ni décaissements prouvés ni charges comptables.", en: "Expenses approved in the period; neither confirmed outflows nor posted accounting expenses." },
  },
  postedRevenue: {
    timeBasis: "PERIOD_FLOW", evidence: "POSTED_LEDGER", dateField: "accountingDate",
    interpretation: { fr: "Produits issus des écritures postées de la période ; attribution boutique et exhaustivité à vérifier.", en: "Revenue from posted ledger lines in the period; store attribution and completeness require verification." },
  },
  postedCogs: {
    timeBasis: "PERIOD_FLOW", evidence: "POSTED_LEDGER", dateField: "accountingDate",
    interpretation: { fr: "Coût des ventes issu des écritures postées ; traçabilité et rapprochement stock dans le détail COGS.", en: "Posted cost of sales; stock provenance and reconciliation available in the COGS detail." },
  },
  postedGrossMargin: {
    timeBasis: "PERIOD_FLOW", evidence: "POSTED_LEDGER", dateField: "accountingDate",
    interpretation: { fr: "Produits postés moins coûts des ventes postés de la même période et devise ; marge provisoire.", en: "Posted revenue less posted cost of sales in the same period/currency; provisional margin." },
  },
  postedOperatingResult: {
    timeBasis: "PERIOD_FLOW", evidence: "POSTED_LEDGER", dateField: "accountingDate",
    interpretation: { fr: "Produits et autres produits moins coûts des ventes et charges postées ; résultat non certifié.", en: "Posted revenue and other income less cost of sales and expenses; uncertified result." },
  },
  mobileMoneyDeposits: {
    timeBasis: "PERIOD_FLOW", evidence: "MOBILE_MONEY", dateField: "occurredAt",
    interpretation: { fr: "Principal des dépôts confirmés ; volume de tiers, pas un produit de l'entreprise.", en: "Confirmed deposit principal; customer transaction volume, not business revenue." },
  },
  mobileMoneyWithdrawals: {
    timeBasis: "PERIOD_FLOW", evidence: "MOBILE_MONEY", dateField: "occurredAt",
    interpretation: { fr: "Principal des retraits confirmés ; volume de tiers, pas une charge de l'entreprise.", en: "Confirmed withdrawal principal; customer transaction volume, not a business expense." },
  },
  mobileMoneyCommission: {
    timeBasis: "PERIOD_FLOW", evidence: "MOBILE_MONEY", dateField: "occurredAt",
    interpretation: { fr: "Commissions prestataire sur opérations confirmées ; leur encaissement et leur comptabilisation sont distincts.", en: "Provider commissions on confirmed transactions; settlement and accounting are separate." },
  },
  mobileMoneyFees: {
    timeBasis: "PERIOD_FLOW", evidence: "MOBILE_MONEY", dateField: "occurredAt",
    interpretation: { fr: "Frais clients sur opérations confirmées, distincts des principaux et des règlements reçus.", en: "Customer fees on confirmed transactions; separate from principal and receipts." },
  },
  telcoSales: {
    timeBasis: "PERIOD_FLOW", evidence: "TELCO", dateField: "occurredAt",
    interpretation: { fr: "Valeur opérationnelle des recharges réussies, non assimilable aux produits comptabilisés.", en: "Operational value of successful top-ups, not automatically posted revenue." },
  },
  telcoCost: {
    timeBasis: "PERIOD_FLOW", evidence: "TELCO", dateField: "occurredAt",
    interpretation: { fr: "Coût opérateur des recharges réussies ; pas nécessairement une charge comptabilisée.", en: "Provider cost of successful top-ups; not necessarily a posted expense." },
  },
  telcoMargin: {
    timeBasis: "PERIOD_FLOW", evidence: "TELCO", dateField: "occurredAt",
    interpretation: { fr: "Ventes Télécom moins coût opérateur sur opérations réussies ; marge opérationnelle à rapprocher.", en: "Successful top-up sales less provider cost; operational margin pending reconciliation." },
  },
  treasuryBalance: {
    timeBasis: "CURRENT_BALANCE", evidence: "FINANCIAL_ACCOUNT", dateField: null,
    interpretation: { fr: "Soldes opérationnels des comptes financiers actifs au moment de la consultation, non nécessairement rapprochés.", en: "Current operational balances of active financial accounts; not necessarily reconciled." },
  },
  treasuryReconciled: {
    timeBasis: "CURRENT_BALANCE", evidence: "FINANCIAL_ACCOUNT", dateField: null,
    interpretation: { fr: "Solde rapproché déclaré sur les comptes actifs ; doit être justifié par les rapprochements.", en: "Reported reconciled position on active accounts; requires reconciliation evidence." },
  },
  treasuryAvailable: {
    timeBasis: "CURRENT_BALANCE", evidence: "FINANCIAL_ACCOUNT", dateField: null,
    interpretation: { fr: "Position disponible déclarée sur les comptes actifs. Si une disponibilité manque, ne pas la déduire du solde opérationnel.", en: "Reported available position on active accounts. Missing availability must not be inferred from operational balance." },
  },
} as const satisfies Record<RetailExecutiveMetric, RetailMetricDefinition>;

export function retailMetricTimeCaption(metric: RetailExecutiveMetric, locale: "fr" | "en"): string {
  const definition = RETAIL_METRIC_DEFINITIONS[metric];
  if (definition.timeBasis === "CURRENT_BALANCE") return locale === "fr" ? "Solde actuel" : "Current balance";
  if (definition.timeBasis === "ISSUANCE_PERIOD_CURRENT_ALLOCATION") return locale === "fr" ? "Émission sur période · allocation à date" : "Issue period · allocation to date";
  return locale === "fr" ? "Flux de période" : "Period flow";
}
