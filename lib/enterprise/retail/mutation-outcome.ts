export type RetailMutationOutcome = "SUCCESS" | "PENDING" | "FAILURE";

export type RetailMutationMessageCode =
  | "RETAIL_ACCOUNTING_PENDING"
  | "RETAIL_PROVIDER_PENDING";

type LocalizedCopy = { fr: string; en: string };

const OUTCOME_MESSAGES: Record<RetailMutationMessageCode, LocalizedCopy> = {
  RETAIL_ACCOUNTING_PENDING: {
    fr: "L’opération est enregistrée, mais sa comptabilisation Finance reste à finaliser. Corrigez la configuration Finance si nécessaire puis réessayez : aucun mouvement déjà enregistré ne sera rejoué.",
    en: "The operation is recorded, but its Finance posting still needs to be finalized. Fix the Finance setup if needed and try again: already recorded movements will not be replayed.",
  },
  RETAIL_PROVIDER_PENDING: {
    fr: "L’opération a été transmise à l’opérateur et reste en attente de confirmation. Ne la relancez pas avec de nouvelles données tant que son statut n’a pas été actualisé.",
    en: "The operation was sent to the provider and is still awaiting confirmation. Do not submit it again with new data until its status has been refreshed.",
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
  return { ok: true as const, outcome: "SUCCESS" as const, ...payload };
}

export function retailPendingOutcome<T extends Record<string, unknown>>(
  messageCode: RetailMutationMessageCode,
  payload: T,
) {
  return { ok: true as const, outcome: "PENDING" as const, messageCode, ...payload };
}

export function retailFailureOutcome<T extends Record<string, unknown>>(payload: T) {
  return { ok: false as const, outcome: "FAILURE" as const, ...payload };
}
