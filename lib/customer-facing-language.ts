export type CustomerFacingLocale = "fr" | "en";

export type CustomerFacingMessageTone = "info" | "success" | "warning" | "error";

export type CustomerFacingMessage = {
  title: string;
  description: string;
  action?: string;
  tone: CustomerFacingMessageTone;
};

type Bilingual = { fr: string; en: string };

const GENERIC_ERROR: Bilingual = {
  fr: "Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.",
  en: "This action could not be completed. Check the information and try again.",
};

const ERROR_MESSAGES: Record<string, Bilingual> = {
  RETAIL_OFFLINE_LOCAL_READ_FAILED: {
    fr: "Les ventes hors connexion enregistrées sur cet appareil ne sont pas accessibles pour le moment.",
    en: "Offline sales saved on this device are not available right now.",
  },
  RETAIL_OFFLINE_DASHBOARD_FAILED: {
    fr: "Les informations nécessaires à la vente hors connexion n’ont pas pu être chargées.",
    en: "The information required for offline sales could not be loaded.",
  },
  RETAIL_OFFLINE_SYNC_FAILED: {
    fr: "La synchronisation des ventes hors connexion n’a pas abouti. Elles restent conservées sur cet appareil et pourront être réessayées.",
    en: "Offline sales could not be synchronized. They remain saved on this device and can be retried.",
  },
  RETAIL_OFFLINE_SNAPSHOT_FAILED: {
    fr: "La vente hors connexion ne peut pas être préparée avec la configuration actuelle.",
    en: "Offline sales cannot be prepared with the current configuration.",
  },
  RETAIL_OFFLINE_CAPTURE_FAILED: {
    fr: "La vente hors connexion n’a pas pu être enregistrée sur cet appareil.",
    en: "The offline sale could not be saved on this device.",
  },
  RETAIL_ONBOARDING_LOAD_FAILED: {
    fr: "L’état de mise en service du Shop n’a pas pu être chargé.",
    en: "The Shop setup status could not be loaded.",
  },
  RETAIL_ONBOARDING_SAVE_FAILED: {
    fr: "La mise en service du Shop n’a pas pu être enregistrée. Vérifiez les éléments sélectionnés puis réessayez.",
    en: "The Shop setup could not be saved. Check the selected items and try again.",
  },
  RETAIL_COUNTRY_PACK_ACTIVATION_FAILED: {
    fr: "La configuration du pays n’a pas pu être activée.",
    en: "The country configuration could not be activated.",
  },
  RETAIL_ONBOARDING_UNAVAILABLE: {
    fr: "La mise en service du Shop est momentanément indisponible.",
    en: "Shop setup is temporarily unavailable.",
  },
  RETAIL_OMNICHANNEL_DASHBOARD_FAILED: {
    fr: "Les magasins et dépôts nécessaires aux commandes clients n’ont pas pu être chargés.",
    en: "The stores and warehouses required for customer orders could not be loaded.",
  },
  RETAIL_OMNICHANNEL_ORDERS_FAILED: {
    fr: "Les commandes clients n’ont pas pu être chargées.",
    en: "Customer orders could not be loaded.",
  },
  RETAIL_OMNICHANNEL_LOAD_FAILED: {
    fr: "L’espace Commandes & retraits n’a pas pu être chargé.",
    en: "The Orders & pickup workspace could not be loaded.",
  },
  RETAIL_CUSTOMER_SEARCH_FAILED: {
    fr: "La recherche de clients n’a pas abouti. Réessayez avec un autre nom, numéro ou contact.",
    en: "Customer search could not be completed. Try another name, number or contact.",
  },
  RETAIL_CUSTOMER_NOT_FOUND: {
    fr: "Ce client n’est plus disponible dans le Shop actif.",
    en: "This customer is no longer available in the active Shop.",
  },
  RETAIL_CUSTOMER_HISTORY_LOAD_FAILED: {
    fr: "Les avantages et l’historique de ce client ne sont pas disponibles pour le moment.",
    en: "This customer’s benefits and history are not available right now.",
  },
  RETAIL_PRODUCT_SEARCH_FAILED: {
    fr: "La recherche de produits n’a pas abouti. Réessayez ou vérifiez le dépôt sélectionné.",
    en: "Product search could not be completed. Try again or check the selected warehouse.",
  },
  RETAIL_OMNICHANNEL_CREATE_FAILED: {
    fr: "La commande client n’a pas pu être créée. Vérifiez le client, le stock et le mode de retrait ou livraison.",
    en: "The customer order could not be created. Check the customer, stock, and pickup or delivery option.",
  },
  RETAIL_COUNTRY_PACK_UNSUPPORTED: {
    fr: "Cette configuration pays n’est pas encore disponible pour votre Shop.",
    en: "This country configuration is not yet available for your Shop.",
  },
  RETAIL_ORGANIZATION_NOT_FOUND: {
    fr: "L’entreprise active ne permet pas d’utiliser cette fonction Retail.",
    en: "The active company cannot use this Retail feature.",
  },
  ACTIVE_PROMOTIONS_REQUIRE_ONLINE: {
    fr: "Des promotions actives nécessitent une connexion pour vérifier le meilleur prix avant l’encaissement.",
    en: "Active promotions require a connection so the best price can be verified before checkout.",
  },
  DYNAMIC_PRICING_REQUIRES_ONLINE: {
    fr: "Les prix de certains articles doivent être vérifiés en ligne avant l’encaissement.",
    en: "Some product prices must be verified online before checkout.",
  },
  RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN: {
    fr: "La personne qui demande un retour ne peut pas valider elle-même le remboursement. Demandez une validation à un autre responsable autorisé.",
    en: "The person requesting a return cannot approve the refund. Ask another authorized manager to review it.",
  },
  RETAIL_RETURN_QUANTITY_EXCEEDED: {
    fr: "La quantité demandée dépasse ce qui peut encore être retourné pour cette vente.",
    en: "The requested quantity exceeds what can still be returned for this sale.",
  },
  RETAIL_RETURN_NOT_FOUND: {
    fr: "Ce retour n’est plus disponible ou ne peut plus être traité.",
    en: "This return is no longer available or can no longer be processed.",
  },
  RETAIL_RETURN_TRANSITION_INVALID: {
    fr: "Ce retour a déjà évolué et cette action n’est plus disponible. Actualisez la liste avant de continuer.",
    en: "This return has already moved forward and this action is no longer available. Refresh the list before continuing.",
  },
  RETAIL_REFUND_ACCOUNT_REQUIRED: {
    fr: "Sélectionnez un compte compatible avec le mode et la devise du remboursement.",
    en: "Select an account compatible with the refund method and currency.",
  },
  RETAIL_PAYMENT_TRANSITION_INVALID: {
    fr: "L’état de ce paiement a changé et cette action n’est plus disponible.",
    en: "This payment status has changed and this action is no longer available.",
  },
  RETAIL_PAYMENT_CREATE_FAILED: {
    fr: "Le paiement n’a pas pu être enregistré. Vérifiez le moyen de paiement, le montant et la devise.",
    en: "The payment could not be recorded. Check the payment method, amount and currency.",
  },
  RETAIL_PAYMENT_LIST_FAILED: {
    fr: "Le suivi des paiements n’est pas disponible pour le moment.",
    en: "Payment follow-up is not available right now.",
  },
};

const STATUS_LABELS: Record<string, Bilingual> = {
  READY: { fr: "Prêt", en: "Ready" },
  ACTIVE: { fr: "Actif", en: "Active" },
  INACTIVE: { fr: "À activer", en: "Needs activation" },
  DRAFT: { fr: "Brouillon", en: "Draft" },
  PAUSED: { fr: "En pause", en: "Paused" },
  ENDED: { fr: "Terminé", en: "Ended" },
  SUSPENDED: { fr: "Suspendu", en: "Suspended" },
  EXHAUSTED: { fr: "Solde épuisé", en: "Balance used up" },
  EXPIRED: { fr: "Expiré", en: "Expired" },
  DISABLED: { fr: "Désactivé", en: "Disabled" },
  ACTIVE_CORE: { fr: "Configuration active", en: "Configuration active" },
  VALIDATED: { fr: "Validé", en: "Validated" },
  SUPPORTED: { fr: "Disponible", en: "Available" },
  TENANT_CONFIGURATION_REQUIRED: { fr: "Configuration requise", en: "Setup required" },
  EVIDENCE_REQUIRED: { fr: "Validation requise", en: "Validation required" },
  NOT_CERTIFIED: { fr: "Non disponible pour le moment", en: "Not available yet" },
  OPEN: { fr: "Ouverte", en: "Open" },
  CLOSED: { fr: "Fermée", en: "Closed" },
  COMPLETED: { fr: "Terminée", en: "Completed" },
  CONFIRMED: { fr: "Confirmée", en: "Confirmed" },
  SUCCESS: { fr: "Réussie", en: "Successful" },
  APPROVED: { fr: "Approuvée", en: "Approved" },
  SUBMITTED: { fr: "Soumise", en: "Submitted" },
  PENDING: { fr: "En attente", en: "Pending" },
  PENDING_APPROVAL: { fr: "En attente de validation", en: "Pending approval" },
  PROCESSING: { fr: "En cours", en: "In progress" },
  RESERVING: { fr: "Réservation en cours", en: "Reserving stock" },
  RESERVED: { fr: "Stock réservé", en: "Stock reserved" },
  FULFILLED: { fr: "Remise terminée", en: "Fulfilled" },
  PENDING_VALIDATION: { fr: "En validation", en: "Pending validation" },
  CLOSING: { fr: "Clôture en cours", en: "Closing" },
  REVERSED: { fr: "Annulée", en: "Reversed" },
  FAILED: { fr: "Échec", en: "Failed" },
  REJECTED: { fr: "Refusée", en: "Rejected" },
  PENDING_SYNC: { fr: "À synchroniser", en: "Waiting to sync" },
  SYNCED: { fr: "Synchronisée", en: "Synced" },
  CONFLICT: { fr: "À vérifier", en: "Needs review" },
  PENDING_PROVIDER: { fr: "Paiement en attente de confirmation", en: "Payment awaiting confirmation" },
  UNKNOWN: { fr: "Confirmation en cours", en: "Confirmation in progress" },
  INITIATED: { fr: "Démarrée", en: "Started" },
  AUTHORIZED: { fr: "Autorisée", en: "Authorized" },
  CAPTURED: { fr: "Confirmée", en: "Confirmed" },
  VOIDED: { fr: "Annulée", en: "Voided" },
  REFUNDED: { fr: "Remboursée", en: "Refunded" },
  RECONCILED: { fr: "Vérifiée", en: "Verified" },
};

const CAPABILITY_LABELS: Record<string, Bilingual> = {
  CORE_LOCALIZATION: { fr: "Langues et configuration du Shop", en: "Shop language and setup" },
  MULTI_CURRENCY: { fr: "Ventes et suivi multi-devises", en: "Multi-currency sales and reporting" },
  TAX_REFERENCE: { fr: "Taxes et règles fiscales", en: "Taxes and fiscal rules" },
  DOCUMENT_NUMBERING: { fr: "Numérotation des documents", en: "Document numbering" },
  FISCAL_RECEIPT: { fr: "Ticket fiscal réglementé", en: "Regulated fiscal receipt" },
  E_INVOICING: { fr: "Facturation électronique", en: "Electronic invoicing" },
};

const DEVICE_TYPE_LABELS: Record<string, Bilingual> = {
  RECEIPT_PRINTER: { fr: "Imprimante de tickets", en: "Receipt printer" },
  BARCODE_SCANNER: { fr: "Lecteur de codes-barres", en: "Barcode scanner" },
  CASH_DRAWER: { fr: "Tiroir-caisse", en: "Cash drawer" },
  PAYMENT_TERMINAL: { fr: "Terminal de paiement", en: "Payment terminal" },
  SCALE: { fr: "Balance", en: "Scale" },
  CUSTOMER_DISPLAY: { fr: "Écran client", en: "Customer display" },
};

const FULFILLMENT_MODE_LABELS: Record<string, Bilingual> = {
  CLICK_COLLECT: { fr: "Commande & retrait", en: "Order & pickup" },
  PICKUP_OTHER_STORE: { fr: "Retrait dans un autre magasin", en: "Pickup at another store" },
  SHIP_FROM_STORE: { fr: "Expédition depuis le magasin", en: "Ship from store" },
  CUSTOMER_DELIVERY: { fr: "Livraison client", en: "Customer delivery" },
};

const PROMOTION_TYPE_LABELS: Record<string, Bilingual> = {
  PERCENTAGE: { fr: "Remise en pourcentage", en: "Percentage discount" },
  FIXED_AMOUNT: { fr: "Remise d’un montant fixe", en: "Fixed amount discount" },
  QUANTITY_BREAK: { fr: "Prix selon la quantité", en: "Quantity-based price" },
  BUY_X_GET_Y: { fr: "Articles achetés + articles offerts", en: "Buy items + get items free" },
  BUNDLE: { fr: "Offre groupée", en: "Bundle offer" },
};

const PROMOTION_STACK_LABELS: Record<string, Bilingual> = {
  EXCLUSIVE: { fr: "Non cumulable", en: "Not combinable" },
  STACKABLE: { fr: "Cumulable", en: "Combinable" },
};

const SALES_CHANNEL_LABELS: Record<string, Bilingual> = {
  POS: { fr: "Vente en caisse", en: "Checkout sale" },
  ONLINE: { fr: "Vente en ligne", en: "Online sale" },
  OMNICHANNEL: { fr: "Commande client", en: "Customer order" },
};

const RETURN_TYPE_LABELS: Record<string, Bilingual> = {
  RETURN: { fr: "Retour", en: "Return" },
  EXCHANGE: { fr: "Échange", en: "Exchange" },
};

const PRODUCT_CONDITION_LABELS: Record<string, Bilingual> = {
  SELLABLE: { fr: "Revendable", en: "Resellable" },
  OPENED: { fr: "Ouvert", en: "Opened" },
  DAMAGED: { fr: "Endommagé", en: "Damaged" },
  DEFECTIVE: { fr: "Défectueux", en: "Defective" },
  EXPIRED: { fr: "Périmé", en: "Expired" },
  OTHER: { fr: "Autre", en: "Other" },
};

const STOCK_DISPOSITION_LABELS: Record<string, Bilingual> = {
  RESTOCK: { fr: "Remettre en stock", en: "Return to stock" },
  SCRAP: { fr: "Sortir du stock / rebut", en: "Remove from stock / scrap" },
  NO_STOCK: { fr: "Aucun mouvement de stock", en: "No stock movement" },
};

const REFUND_METHOD_LABELS: Record<string, Bilingual> = {
  ORIGINAL_TENDER: { fr: "Moyen de paiement d’origine", en: "Original payment method" },
  CASH: { fr: "Espèces", en: "Cash" },
  MOBILE_MONEY: { fr: "Mobile Money", en: "Mobile Money" },
  BANK_TRANSFER: { fr: "Virement bancaire", en: "Bank transfer" },
  CARD: { fr: "Carte", en: "Card" },
  STORE_CREDIT: { fr: "Avoir client", en: "Store credit" },
};

const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<string, Bilingual> = {
  CASH: { fr: "Caisse", en: "Cash account" },
  BANK: { fr: "Banque", en: "Bank account" },
  MOBILE_MONEY: { fr: "Compte Mobile Money", en: "Mobile Money account" },
  CARD_CLEARING: { fr: "Encaissements carte", en: "Card clearing account" },
};

const STORED_VALUE_TYPE_LABELS: Record<string, Bilingual> = {
  GIFT_CARD: { fr: "Carte-cadeau", en: "Gift card" },
  STORE_CREDIT: { fr: "Avoir client", en: "Store credit" },
};

const PAYMENT_METHOD_LABELS: Record<string, Bilingual> = {
  CASH: { fr: "Espèces", en: "Cash" },
  CARD: { fr: "Carte", en: "Card" },
  MOBILE_MONEY: { fr: "Mobile Money", en: "Mobile Money" },
  BANK_TRANSFER: { fr: "Virement bancaire", en: "Bank transfer" },
  OTHER: { fr: "Autre moyen de paiement", en: "Other payment method" },
};

const PAYMENT_STATUS_LABELS: Record<string, Bilingual> = {
  INITIATED: { fr: "À traiter", en: "To process" },
  AUTHORIZED: { fr: "Autorisé", en: "Authorized" },
  CAPTURED: { fr: "Confirmé", en: "Confirmed" },
  FAILED: { fr: "Échec", en: "Failed" },
  VOIDED: { fr: "Annulé", en: "Voided" },
  REFUNDED: { fr: "Remboursé", en: "Refunded" },
};

const TECHNICAL_PATTERN = /(^[A-Z0-9]+(?:_[A-Z0-9]+)+$)|\b(prisma|tenant|idempot|webhook|adapter|payload|snapshot|canonical|server|posting|stack trace|http\s?\d{3}|\/api\/)\b/i;

function pick(value: Bilingual, locale: CustomerFacingLocale) {
  return value[locale];
}

function labelFrom(map: Record<string, Bilingual>, code: string | null | undefined, locale: CustomerFacingLocale, fallback: Bilingual) {
  const normalized = code?.trim().toUpperCase() || "";
  return map[normalized] ? pick(map[normalized], locale) : pick(fallback, locale);
}

function extractKnownCode(raw: string) {
  const normalized = raw.trim().toUpperCase();
  if (ERROR_MESSAGES[normalized]) return normalized;
  return Object.keys(ERROR_MESSAGES).find((code) => normalized.includes(code)) || null;
}

export function customerFacingError(error: unknown, locale: CustomerFacingLocale, fallback?: Bilingual) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = extractKnownCode(raw);
  if (code) return pick(ERROR_MESSAGES[code], locale);
  if (!raw || TECHNICAL_PATTERN.test(raw)) return pick(fallback || GENERIC_ERROR, locale);
  return raw;
}

export function customerFacingStatusLabel(status: string | null | undefined, locale: CustomerFacingLocale) {
  return labelFrom(STATUS_LABELS, status, locale, { fr: "En cours", en: "In progress" });
}

export function customerFacingCapabilityLabel(code: string, locale: CustomerFacingLocale) {
  return labelFrom(CAPABILITY_LABELS, code, locale, { fr: "Fonctionnalité du Shop", en: "Shop capability" });
}

export function customerFacingDeviceType(code: string, locale: CustomerFacingLocale) {
  return labelFrom(DEVICE_TYPE_LABELS, code, locale, { fr: "Équipement du point de vente", en: "POS equipment" });
}

export function customerFacingFulfillmentMode(code: string, locale: CustomerFacingLocale) {
  return labelFrom(FULFILLMENT_MODE_LABELS, code, locale, { fr: "Commande client", en: "Customer order" });
}

export function customerFacingPromotionType(code: string, locale: CustomerFacingLocale) {
  return labelFrom(PROMOTION_TYPE_LABELS, code, locale, { fr: "Offre promotionnelle", en: "Promotional offer" });
}

export function customerFacingPromotionStackMode(code: string, locale: CustomerFacingLocale) {
  return labelFrom(PROMOTION_STACK_LABELS, code, locale, { fr: "Règle de cumul", en: "Combination rule" });
}

export function customerFacingSalesChannel(code: string, locale: CustomerFacingLocale) {
  return labelFrom(SALES_CHANNEL_LABELS, code, locale, { fr: "Canal de vente", en: "Sales channel" });
}

export function customerFacingReturnType(code: string, locale: CustomerFacingLocale) {
  return labelFrom(RETURN_TYPE_LABELS, code, locale, { fr: "Retour client", en: "Customer return" });
}

export function customerFacingProductCondition(code: string, locale: CustomerFacingLocale) {
  return labelFrom(PRODUCT_CONDITION_LABELS, code, locale, { fr: "État à vérifier", en: "Condition to review" });
}

export function customerFacingStockDisposition(code: string, locale: CustomerFacingLocale) {
  return labelFrom(STOCK_DISPOSITION_LABELS, code, locale, { fr: "Traitement du stock", en: "Stock handling" });
}

export function customerFacingRefundMethod(code: string, locale: CustomerFacingLocale) {
  return labelFrom(REFUND_METHOD_LABELS, code, locale, { fr: "Mode de remboursement", en: "Refund method" });
}

export function customerFacingFinancialAccountType(code: string, locale: CustomerFacingLocale) {
  return labelFrom(FINANCIAL_ACCOUNT_TYPE_LABELS, code, locale, { fr: "Compte financier", en: "Financial account" });
}

export function customerFacingStoredValueType(code: string, locale: CustomerFacingLocale) {
  return labelFrom(STORED_VALUE_TYPE_LABELS, code, locale, { fr: "Solde client", en: "Customer balance" });
}

export function customerFacingPaymentMethod(code: string, locale: CustomerFacingLocale) {
  return labelFrom(PAYMENT_METHOD_LABELS, code, locale, { fr: "Moyen de paiement", en: "Payment method" });
}

export function customerFacingPaymentStatus(status: string | null | undefined, locale: CustomerFacingLocale) {
  return labelFrom(PAYMENT_STATUS_LABELS, status, locale, { fr: "En cours", en: "In progress" });
}

export function customerFacingReadinessDetail(detail: unknown, complete: boolean, locale: CustomerFacingLocale) {
  if (typeof detail === "string" && detail.trim() && !TECHNICAL_PATTERN.test(detail)) return detail;
  if (typeof detail === "number") return String(detail);
  return complete
    ? (locale === "en" ? "Configuration verified" : "Configuration vérifiée")
    : (locale === "en" ? "Action required to finish setup" : "Action requise pour terminer la mise en service");
}
