export type RetailMutationOutcome = "SUCCESS" | "PENDING" | "FAILURE";

export type RetailMutationMessageCode =
  | "RETAIL_ACCOUNTING_PENDING"
  | "RETAIL_ACCOUNTING_PENDING_JOURNAL"
  | "RETAIL_ACCOUNTING_PENDING_PERIOD_REQUIRED"
  | "RETAIL_ACCOUNTING_PENDING_PERIOD_CLOSED"
  | "RETAIL_ACCOUNTING_PENDING_RATE"
  | "RETAIL_ACCOUNTING_PENDING_ACCOUNT"
  | "RETAIL_ACCOUNTING_PENDING_MAPPING"
  | "RETAIL_ACCOUNTING_PENDING_CONFIGURATION"
  | "RETAIL_ACCOUNTING_PENDING_UNKNOWN"
  | "RETAIL_PROVIDER_PENDING"
  | "RETAIL_PROVIDER_FAILED";

type LocalizedCopy = { fr: string; en: string };

const OUTCOME_MESSAGES: Record<RetailMutationMessageCode, LocalizedCopy> = {
  RETAIL_ACCOUNTING_PENDING: {
    fr: "L’opération est enregistrée, mais sa comptabilisation Finance reste à finaliser. Vérifiez le motif indiqué puis réessayez : aucun mouvement déjà enregistré ne sera rejoué.",
    en: "The operation is recorded, but its Finance posting still needs to be finalized. Check the stated blocker and try again: already recorded movements will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_JOURNAL: {
    fr: "La conversion est enregistrée, mais Finance ne trouve pas de journal Mobile Money actif. Configurez ou activez le journal Mobile Money, puis réessayez : les mouvements des wallets ne seront pas rejoués.",
    en: "The conversion is recorded, but Finance cannot find an active Mobile Money journal. Configure or activate the Mobile Money journal, then try again: wallet movements will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_PERIOD_REQUIRED: {
    fr: "La conversion est enregistrée, mais aucune période comptable ouverte ne couvre la date de l’opération. Ouvrez la période correspondante, puis réessayez : les mouvements des wallets ne seront pas rejoués.",
    en: "The conversion is recorded, but no open accounting period covers the operation date. Open the matching period, then try again: wallet movements will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_PERIOD_CLOSED: {
    fr: "La conversion est enregistrée, mais la période comptable de l’opération est fermée ou verrouillée. Corrigez l’état de la période avant de finaliser la comptabilisation ; les mouvements des wallets ne seront pas rejoués.",
    en: "The conversion is recorded, but the accounting period for the operation is closed or locked. Fix the period status before finalizing posting; wallet movements will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_RATE: {
    fr: "La conversion est enregistrée, mais Finance ne dispose pas du taux nécessaire pour convertir l’écriture vers la devise fonctionnelle à la date de l’opération. Complétez le taux de change Finance puis réessayez ; les wallets ne seront pas mouvementés une seconde fois.",
    en: "The conversion is recorded, but Finance is missing the rate required to translate the entry into the functional currency on the operation date. Complete the Finance exchange rate and try again; the wallets will not move a second time.",
  },
  RETAIL_ACCOUNTING_PENDING_ACCOUNT: {
    fr: "La conversion est enregistrée, mais au moins un wallet est relié à un compte comptable inactif ou invalide pour le posting. Corrigez le compte lié dans Finance puis réessayez ; le transfert wallet ne sera pas rejoué.",
    en: "The conversion is recorded, but at least one wallet is linked to an inactive or invalid ledger account for posting. Fix the linked Finance account and try again; the wallet transfer will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_MAPPING: {
    fr: "La conversion est enregistrée, mais les correspondances comptables obligatoires de Finance sont incomplètes. Complétez les mappings comptables puis réessayez ; les mouvements déjà enregistrés ne seront pas rejoués.",
    en: "The conversion is recorded, but required Finance account mappings are incomplete. Complete the accounting mappings and try again; already recorded movements will not be replayed.",
  },
  RETAIL_ACCOUNTING_PENDING_CONFIGURATION: {
    fr: "La conversion est enregistrée, mais une configuration comptable obligatoire reste incomplète dans Finance. Finalisez la configuration comptable signalée par l’assistant Finance puis réessayez ; le transfert wallet restera inchangé.",
    en: "The conversion is recorded, but a required accounting setup item is still incomplete in Finance. Complete the accounting setup reported by the Finance assistant and try again; the wallet transfer will remain unchanged.",
  },
  RETAIL_ACCOUNTING_PENDING_UNKNOWN: {
    fr: "La conversion est enregistrée, mais sa comptabilisation n’a pas pu être finalisée. Le transfert wallet reste valide. Actualisez l’historique et réessayez la finalisation ; aucun débit ou crédit wallet déjà enregistré ne sera rejoué.",
    en: "The conversion is recorded, but its accounting posting could not be finalized. The wallet transfer remains valid. Refresh history and retry finalization; no recorded wallet debit or credit will be replayed.",
  },
  RETAIL_PROVIDER_PENDING: {
    fr: "L’opération a été transmise à l’opérateur et reste en attente de confirmation. Ne la relancez pas avec de nouvelles données tant que son statut n’a pas été actualisé.",
    en: "The operation was sent to the provider and is still awaiting confirmation. Do not submit it again with new data until its status has been refreshed.",
  },
  RETAIL_PROVIDER_FAILED: {
    fr: "L’opérateur n’a pas confirmé l’opération. Aucun succès n’est enregistré : vérifiez le statut et les informations avant de réessayer.",
    en: "The provider did not confirm the operation. No success was recorded: check the status and details before trying again.",
  },
};

export function retailMutationOutcomeMessage(
  code: RetailMutationMessageCode | string | null | undefined,
  locale: "fr" | "en",
) {
  if (!code || !(code in OUTCOME_MESSAGES)) return null;
  return OUTCOME_MESSAGES[code as RetailMutationMessageCode][locale];
}

export function retailSuccessOutcome<T extends Record<string, unknown>>(payload: T) {
  return { ...payload, ok: true as const, outcome: "SUCCESS" as const };
}

export function retailPendingOutcome<T extends Record<string, unknown>>(
  messageCode: RetailMutationMessageCode,
  payload: T,
) {
  return { ...payload, ok: true as const, outcome: "PENDING" as const, messageCode };
}

export function retailFailureOutcome<T extends Record<string, unknown>>(
  messageCode: RetailMutationMessageCode | null,
  payload: T,
) {
  return { ...payload, ok: false as const, outcome: "FAILURE" as const, ...(messageCode ? { messageCode } : {}) };
}
