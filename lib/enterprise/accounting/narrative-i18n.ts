/**
 * Presentation-only localization of canonical automatic accounting narratives.
 *
 * IMPORTANT: posted text is an immutable audit fact. Never rewrite journals,
 * third-party notes, manually entered descriptions or source references.
 * Only known, anchored ERP-generated English patterns are translated.
 * The same formatter is used by tables, detail views and downloads.
 */
export type AccountingNarrativeLocale = "fr" | "en";

type Template = { pattern: RegExp; fr: string; en: string };
const templates: Template[] = [
  { pattern: /^ISSUE valuation (.+)$/i, fr: "Valorisation d’une sortie de stock — mouvement $1", en: "Inventory issue valuation — movement $1" },
  { pattern: /^RECEIPT valuation (.+)$/i, fr: "Valorisation d’une entrée en stock — mouvement $1", en: "Inventory receipt valuation — movement $1" },
  { pattern: /^ISSUE (.+)$/i, fr: "Sortie de stock — article $1", en: "Inventory issue — item $1" },
  { pattern: /^RECEIPT (.+)$/i, fr: "Entrée de stock — article $1", en: "Inventory receipt — item $1" },
  { pattern: /^Settle receivable (.+)$/i, fr: "Affectation d’un encaissement à une créance client — paiement $1", en: "Customer receivable settlement — payment $1" },
  { pattern: /^Apply customer advance (.+)$/i, fr: "Imputation d’une avance client — paiement $1", en: "Customer advance applied — payment $1" },
  { pattern: /^Settle payable (.+)$/i, fr: "Règlement d’une dette fournisseur — paiement $1", en: "Supplier payable settlement — payment $1" },
  { pattern: /^Apply supplier advance (.+)$/i, fr: "Imputation d’une avance fournisseur — paiement $1", en: "Supplier advance applied — payment $1" },
  { pattern: /^Payment allocation (.+)$/i, fr: "Affectation d’un paiement — $1", en: "Payment allocation — $1" },
  { pattern: /^Allocated (.+)$/i, fr: "Part du paiement affectée — $1", en: "Allocated payment amount — $1" },
  { pattern: /^Advance (.+)$/i, fr: "Avance non encore affectée — $1", en: "Unallocated advance — $1" },
  { pattern: /^Customer invoice (.+)$/i, fr: "Facture client — $1", en: "Customer invoice — $1" },
  { pattern: /^Receivable (.+)$/i, fr: "Créance client — facture $1", en: "Customer receivable — invoice $1" },
  { pattern: /^Revenue reversal (.+)$/i, fr: "Annulation du chiffre d’affaires — $1", en: "Sales revenue reversal — $1" },
  { pattern: /^Revenue (.+)$/i, fr: "Produit des ventes — facture $1", en: "Sales revenue — invoice $1" },
  { pattern: /^Output tax reversal (.+)$/i, fr: "Annulation de taxe collectée — $1", en: "Output tax reversal — $1" },
  { pattern: /^Output tax (.+)$/i, fr: "Taxe collectée — facture $1", en: "Output tax — invoice $1" },
  { pattern: /^Customer credit note (.+)$/i, fr: "Avoir client — $1", en: "Customer credit note — $1" },
  { pattern: /^Receivable credit (.+)$/i, fr: "Réduction de créance client — $1", en: "Receivable credit — $1" },
  { pattern: /^Supplier invoice (.+)$/i, fr: "Facture fournisseur — $1", en: "Supplier invoice — $1" },
  { pattern: /^Supplier credit note (.+)$/i, fr: "Avoir fournisseur — $1", en: "Supplier credit note — $1" },
  { pattern: /^Supplier credit (.+)$/i, fr: "Réduction des achats fournisseurs — $1", en: "Supplier credit — $1" },
  { pattern: /^Payable credit (.+)$/i, fr: "Réduction de dette fournisseur — $1", en: "Payable credit — $1" },
  { pattern: /^Payable (.+)$/i, fr: "Dette fournisseur — facture $1", en: "Supplier payable — invoice $1" },
  { pattern: /^Recoverable tax credit (.+)$/i, fr: "Annulation de taxe récupérable — $1", en: "Recoverable tax credit — $1" },
  { pattern: /^Recoverable tax (.+)$/i, fr: "Taxe récupérable — $1", en: "Recoverable tax — $1" },
  { pattern: /^Expense settlement (.+)$/i, fr: "Règlement d’une dépense — $1", en: "Expense settlement — $1" },
  { pattern: /^Expense (.+)$/i, fr: "Constatation d’une dépense — $1", en: "Expense recognition — $1" },
  { pattern: /^Payroll net liability (.+)$/i, fr: "Dette nette envers le personnel — paie $1", en: "Net payroll payable — $1" },
  { pattern: /^Payroll withholding (.+)$/i, fr: "Retenues sur rémunérations — paie $1", en: "Payroll withholdings — $1" },
  { pattern: /^Payroll (.+)$/i, fr: "Charges de personnel — paie $1", en: "Payroll expenses — $1" },
  { pattern: /^Cash variance (.+)$/i, fr: "Écart de caisse — session $1", en: "Cash discrepancy — session $1" },
  { pattern: /^Asset depreciation (.+)$/i, fr: "Dotation aux amortissements — période $1", en: "Asset depreciation — period $1" },
  { pattern: /^Asset capitalization clearing (.+)$/i, fr: "Compte transitoire d’immobilisation — $1", en: "Asset capitalization clearing — $1" },
  { pattern: /^Asset capitalization (.+)$/i, fr: "Mise à l’actif d’une immobilisation — $1", en: "Asset capitalization — $1" },
  { pattern: /^Capitalized asset (.+)$/i, fr: "Immobilisation comptabilisée — $1", en: "Capitalized asset — $1" },
  { pattern: /^Funding received (.+)$/i, fr: "Financement encaissé — $1", en: "Funding received — $1" },
  { pattern: /^Funding counterpart (.+)$/i, fr: "Contrepartie du financement — $1", en: "Funding counterpart — $1" },
  { pattern: /^Funding (.+)$/i, fr: "Opération de financement — $1", en: "Funding operation — $1" },
  { pattern: /^Bank charge (.+)$/i, fr: "Frais bancaires — $1", en: "Bank charge — $1" },
  { pattern: /^Bank charge$/i, fr: "Frais bancaires", en: "Bank charge" },
  { pattern: /^Functional FX difference (.+)$/i, fr: "Écart de conversion en devise fonctionnelle — $1", en: "Functional currency FX difference — $1" },
  { pattern: /^Closing FX revaluation (.+)$/i, fr: "Réévaluation des devises à la clôture — $1", en: "Closing foreign-exchange revaluation — $1" },
  { pattern: /^Unrealized FX gain (.+)$/i, fr: "Gain de change latent — $1", en: "Unrealized foreign-exchange gain — $1" },
  { pattern: /^Unrealized FX loss (.+)$/i, fr: "Perte de change latente — $1", en: "Unrealized foreign-exchange loss — $1" },
  { pattern: /^Year-end close (.+)$/i, fr: "Clôture de l’exercice — $1", en: "Year-end closing — $1" },
  { pattern: /^Retained earnings (.+)$/i, fr: "Report à nouveau — $1", en: "Retained earnings — $1" },
  { pattern: /^Derecognize accumulated depreciation (.+)$/i, fr: "Sortie des amortissements cumulés — $1", en: "Derecognition of accumulated depreciation — $1" },
  { pattern: /^Derecognize asset (.+)$/i, fr: "Sortie d’immobilisation du bilan — $1", en: "Asset derecognition — $1" },
  { pattern: /^Asset disposal proceeds (.+)$/i, fr: "Produit de cession d’immobilisation — $1", en: "Asset disposal proceeds — $1" },
  { pattern: /^Asset disposal gain (.+)$/i, fr: "Plus-value de cession d’immobilisation — $1", en: "Asset disposal gain — $1" },
  { pattern: /^Asset disposal loss (.+)$/i, fr: "Moins-value de cession d’immobilisation — $1", en: "Asset disposal loss — $1" },
  { pattern: /^Asset disposal (.+)$/i, fr: "Cession d’immobilisation — $1", en: "Asset disposal — $1" },
  { pattern: /^Inventory receipt (.+) valued$/i, fr: "Valorisation d’une réception de stock — $1", en: "Inventory receipt valued — $1" },
  { pattern: /^Inventory issue (.+) valued$/i, fr: "Valorisation d’une sortie de stock — $1", en: "Inventory issue valued — $1" },
];

export function formatAccountingNarrative(value: unknown, locale: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const original = value.trim();
  if (!original) return "";
  for (const template of templates) {
    if (template.pattern.test(original)) return original.replace(template.pattern, locale === "en" ? template.en : template.fr);
  }
  // Human-authored comments, journal titles and unknown legacy text are
  // deliberately preserved verbatim; never invent a translation.
  return original;
}
