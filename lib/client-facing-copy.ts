export type ClientFacingLocale = "fr" | "en";

/**
 * Exact rewrites for legacy system-owned copy that exposes implementation details.
 *
 * This helper is intentionally conservative: it is only called by canonical i18n
 * translators and must never process user-entered or business-record values.
 */
const CLIENT_FACING_REWRITES: Record<ClientFacingLocale, ReadonlyMap<string, string>> = {
  fr: new Map([
    ["Valeur métier à vérifier", "Autre catégorie"],
    [
      "Données filtrées par entreprise, paginées côté serveur et présentées en langage métier.",
      "Consultez, recherchez et suivez les informations utiles à cette activité.",
    ],
    [
      "Les étapes sont calculées par le serveur. Une case se coche automatiquement dès que la configuration correspondante est réellement valide.",
      "Les étapes se cochent automatiquement dès que chaque configuration est prête.",
    ],
    [
      "Les projections relient les objets ERP sans créer de facture, paiement, mouvement de stock ou écriture en double.",
      "Les opérations liées restent synchronisées sans créer de facture, paiement, mouvement de stock ou écriture en double.",
    ],
    ["Continuité inter-module", "Continuité des opérations"],
    ["La santé des projections inter-modules est indisponible.", "Le suivi des opérations liées est momentanément indisponible."],
    ["La projection ne peut pas être relancée.", "Cette synchronisation n’a pas pu être relancée."],
    ["Projection inter-module relancée.", "La synchronisation a été relancée."],
    ["Projection en attente de reprise contrôlée.", "Cette synchronisation doit être relancée."],
    ["Aucune projection inter-module en échec dans les éléments récents.", "Aucune synchronisation récente ne nécessite d’intervention."],
    [
      "Les mutations sont contrôlées par révision et les périodes financières.",
      "Les modifications respectent les périodes financières et les validations en cours.",
    ],
    [
      "Les sources sont sélectionnées dans les référentiels de l’entreprise puis revalidées côté serveur.",
      "Choisissez les références de l’entreprise. Elles sont vérifiées automatiquement avant l’enregistrement.",
    ],
    [
      "La séparation des rôles et la période financière sont vérifiées côté serveur.",
      "Les droits de validation et la période financière sont vérifiés automatiquement.",
    ],
    [
      "Les lignes de la facture sont proposées. Le serveur contrôle les montants et l’unicité.",
      "Les lignes de la facture sont proposées et les montants sont vérifiés automatiquement.",
    ],
    ["Les montants et comptes sont contrôlés côté serveur.", "Les montants et les comptes sont vérifiés automatiquement avant l’enregistrement."],
    [
      "Le compte source et le compte cible doivent être distincts. Le serveur contrôle devise, solde, tenant et approbation.",
      "Choisissez deux comptes distincts. La devise, le solde disponible et les autorisations sont vérifiés avant validation.",
    ],
  ]),
  en: new Map([
    ["Business value to review", "Other category"],
    [
      "Organization-scoped, server-paginated data presented in business language.",
      "Review, search, and follow the information that matters to this activity.",
    ],
    [
      "Steps are calculated by the server. A checkmark appears automatically as soon as the corresponding configuration is truly valid.",
      "Steps are checked automatically as soon as each configuration is ready.",
    ],
    [
      "Projections connect ERP objects without creating duplicate invoices, payments, stock movements or journal entries.",
      "Related operations stay synchronized without creating duplicate invoices, payments, stock movements or journal entries.",
    ],
    ["Cross-module continuity", "Operational continuity"],
    ["Cross-module projection health is unavailable.", "Tracking for related operations is temporarily unavailable."],
    ["The projection cannot be retried.", "This synchronization could not be retried."],
    ["Cross-module projection retried.", "The synchronization was retried."],
    ["Projection awaiting controlled retry.", "This synchronization needs to be retried."],
    ["No failed cross-module projection in recent items.", "No recent synchronization requires attention."],
    [
      "Changes are controlled by revision and finance periods.",
      "Changes respect finance periods and validations already in progress.",
    ],
    [
      "Sources are selected from company master data and revalidated server-side.",
      "Choose the company references you need. They are checked automatically before saving.",
    ],
    [
      "Separation of duties and the finance period are checked server-side.",
      "Approval rights and the finance period are checked automatically.",
    ],
    [
      "Invoice lines are proposed. The server controls amounts and uniqueness.",
      "Invoice lines are proposed and amounts are checked automatically.",
    ],
    ["Amounts and accounts are controlled server-side.", "Amounts and accounts are checked automatically before saving."],
    [
      "Source and target accounts must differ. The server controls currency, balance, tenant and approval.",
      "Choose two different accounts. Currency, available balance, and permissions are checked before approval.",
    ],
  ]),
};

export function clientFacingCopy(locale: string | null | undefined, value: string) {
  const resolvedLocale: ClientFacingLocale = locale === "en" ? "en" : "fr";
  return CLIENT_FACING_REWRITES[resolvedLocale].get(value) || value;
}
