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
  { pattern: /^Retail POS sale (.+)$/i, fr: "Vente au point de vente — $1", en: "Retail point-of-sale transaction — $1" },
  { pattern: /^Retail POS reversal (.+)$/i, fr: "Contrepassation d’une vente en caisse — $1", en: "Retail POS sale reversal — $1" },
  { pattern: /^Retail POS return (.+)$/i, fr: "Retour client sur vente au point de vente — $1", en: "Retail POS customer return — $1" },
  { pattern: /^Retail output tax reversal (.+)$/i, fr: "Annulation de TVA collectée sur vente au comptoir — $1", en: "Retail output tax reversal — $1" },
  { pattern: /^Retail output tax (.+)$/i, fr: "TVA collectée sur vente au comptoir — $1", en: "Retail output tax — $1" },
  { pattern: /^Retail revenue reversal (.+)$/i, fr: "Annulation du produit des ventes en caisse — $1", en: "Retail sales revenue reversal — $1" },
  { pattern: /^Retail revenue (.+)$/i, fr: "Produit des ventes en caisse — $1", en: "Retail sales revenue — $1" },
  { pattern: /^Retail cashback expense reversal (.+)$/i, fr: "Annulation de charge de remise fidélité — $1", en: "Retail cashback expense reversal — $1" },
  { pattern: /^Retail cashback liability reversal (.+)$/i, fr: "Annulation de dette liée au cashback — $1", en: "Retail cashback liability reversal — $1" },
  { pattern: /^Retail cashback expense (.+)$/i, fr: "Charge liée au cashback client — $1", en: "Retail cashback expense — $1" },
  { pattern: /^Retail cashback credit liability (.+)$/i, fr: "Dette envers le client pour cashback — $1", en: "Retail cashback customer credit payable — $1" },
  { pattern: /^Retail inventory return (.+)$/i, fr: "Valorisation d’un retour en stock — $1", en: "Retail inventory return valuation — $1" },
  { pattern: /^Retail stock return (.+)$/i, fr: "Retour de marchandises en stock — article — $1", en: "Retail returned inventory item — $1" },
  { pattern: /^Retail COGS reversal (.+)$/i, fr: "Annulation du coût des marchandises vendues — article — $1", en: "Retail cost-of-goods-sold reversal — item — $1" },
  { pattern: /^Retail return revenue (.+)$/i, fr: "Annulation du produit d’une vente retournée — $1", en: "Retail return revenue reversal — $1" },
  { pattern: /^Retail return output tax (.+)$/i, fr: "Régularisation de TVA collectée sur retour client — $1", en: "Retail return output tax adjustment — $1" },
  { pattern: /^Store credit refund (.+)$/i, fr: "Remboursement par avoir magasin — $1", en: "Store credit refund — $1" },
  { pattern: /^Returned cashback liability (.+)$/i, fr: "Reprise de dette cashback après retour — $1", en: "Returned cashback liability — $1" },
  { pattern: /^Returned cashback expense (.+)$/i, fr: "Reprise de charge cashback après retour — $1", en: "Returned cashback expense — $1" },
  { pattern: /^Telco float reversal (.+)$/i, fr: "Reconstitution du solde opérateur après annulation — $1", en: "Telecom operator float reversal — $1" },
  { pattern: /^Telco tender reversal (.+)$/i, fr: "Annulation d’un encaissement de recharge télécom — $1", en: "Telecom tender reversal — $1" },
  { pattern: /^Telco tender (.+)$/i, fr: "Encaissement d’une recharge télécom — $1", en: "Telecom top-up receipt — $1" },
  { pattern: /^Telco operator float (.+)$/i, fr: "Consommation du solde chez l’opérateur télécom — $1", en: "Telecom operator float consumption — $1" },
  { pattern: /^Telco margin reversal (.+)$/i, fr: "Annulation de marge de recharge télécom — $1", en: "Telecom service margin reversal — $1" },
  { pattern: /^Telco service margin (.+)$/i, fr: "Marge sur recharge télécom — $1", en: "Telecom service margin — $1" },
  { pattern: /^Telco top-up reversal (.+)$/i, fr: "Annulation d’une recharge télécom — $1", en: "Telecom top-up reversal — $1" },
  { pattern: /^Telco top-up (.+)$/i, fr: "Recharge télécom vendue — $1", en: "Telecom top-up sale — $1" },
  { pattern: /^Mobile Money service fee reversal (.+)$/i, fr: "Annulation de commission de service Mobile Money — $1", en: "Mobile Money service fee reversal — $1" },
  { pattern: /^Mobile Money service fee (.+)$/i, fr: "Commission de service Mobile Money — $1", en: "Mobile Money service fee — $1" },
  { pattern: /^Mobile Money operator FX reversal (.+)$/i, fr: "Annulation de change sur le solde opérateur Mobile Money — $1", en: "Mobile Money operator FX reversal — $1" },
  { pattern: /^Mobile Money operator FX (.+)$/i, fr: "Opération de change du solde opérateur Mobile Money — $1", en: "Mobile Money operator FX — $1" },
  { pattern: /^Mobile Money reversal (.+)$/i, fr: "Contrepassation d’une opération Mobile Money — $1", en: "Mobile Money transaction reversal — $1" },
  { pattern: /^FX reversal in (.+)$/i, fr: "Annulation de l’entrée de devises lors d’un change — $1", en: "Foreign exchange inflow reversal — $1" },
  { pattern: /^FX reversal out (.+)$/i, fr: "Annulation de la sortie de devises lors d’un change — $1", en: "Foreign exchange outflow reversal — $1" },
  { pattern: /^Operator FX in (.+)$/i, fr: "Entrée de devises sur le solde opérateur — $1", en: "Operator foreign-exchange inflow — $1" },
  { pattern: /^Operator FX out (.+)$/i, fr: "Sortie de devises du solde opérateur — $1", en: "Operator foreign-exchange outflow — $1" },
  { pattern: /^Customer refund (.+)$/i, fr: "Remboursement au client — $1", en: "Customer refund — $1" },
  { pattern: /^Internal transfer (.+)$/i, fr: "Virement interne entre comptes financiers — $1", en: "Internal transfer between financial accounts — $1" },
  { pattern: /^Transfer in (.+)$/i, fr: "Entrée liée à un virement interne — $1", en: "Internal transfer received — $1" },
  { pattern: /^Transfer out (.+)$/i, fr: "Sortie liée à un virement interne — $1", en: "Internal transfer sent — $1" },
  { pattern: /^(DEPOSIT|WITHDRAWAL) cash (.+)$/i, fr: "Mouvement de caisse Mobile Money ($1) — $2", en: "Mobile Money cash movement ($1) — $2" },
  { pattern: /^(DEPOSIT|WITHDRAWAL) operator float (.+)$/i, fr: "Mouvement de solde opérateur Mobile Money ($1) — $2", en: "Mobile Money operator float movement ($1) — $2" },
  { pattern: /^Mobile Money (deposit|withdrawal) (.+)$/i, fr: "Opération Mobile Money ($1) — $2", en: "Mobile Money transaction ($1) — $2" },
  { pattern: /^(CASH|CARD|MOBILE_MONEY|BANK_TRANSFER|TRANSFER) refund (.+)$/i, fr: "Remboursement client ($1) — $2", en: "Customer refund ($1) — $2" },
  { pattern: /^(CASH|CARD|MOBILE_MONEY|BANK_TRANSFER|TRANSFER) (.+)$/i, fr: "Encaissement client ($1) — $2", en: "Customer receipt ($1) — $2" },

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
