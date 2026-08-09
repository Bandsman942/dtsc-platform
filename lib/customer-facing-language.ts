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
};

const STATUS_LABELS: Record<string, Bilingual> = {
  READY: { fr: "Prêt", en: "Ready" },
  ACTIVE: { fr: "Actif", en: "Active" },
  INACTIVE: { fr: "À activer", en: "Needs activation" },
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
  PROCESSING: { fr: "En cours", en: "In progress" },
  RESERVING: { fr: "Réservation en cours", en: "Reserving stock" },
  RESERVED: { fr: "Stock réservé", en: "Stock reserved" },
  FULFILLED: { fr: "Remise terminée", en: "Fulfilled" },
  PENDING_VALIDATION: { fr: "En validation", en: "Pending validation" },
  CLOSING: { fr: "Clôture en cours", en: "Closing" },
  REVERSED: { fr: "Annulée", en: "Reversed" },
  FAILED: { fr: "Échec", en: "Failed" },
  REJECTED: { fr: "À vérifier", en: "Needs review" },
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

const TECHNICAL_PATTERN = /(^[A-Z0-9]+(?:_[A-Z0-9]+)+$)|\b(prisma|tenant|idempot|webhook|adapter|payload|snapshot|canonical|server|posting|stack trace|http\s?\d{3}|\/api\/)\b/i;

function pick(value: Bilingual, locale: CustomerFacingLocale) {
  return value[locale];
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
  if (!status) return locale === "en" ? "Not available" : "Non disponible";
  const normalized = status.trim().toUpperCase();
  return STATUS_LABELS[normalized] ? pick(STATUS_LABELS[normalized], locale) : (locale === "en" ? "In progress" : "En cours");
}

export function customerFacingCapabilityLabel(code: string, locale: CustomerFacingLocale) {
  return CAPABILITY_LABELS[code] ? pick(CAPABILITY_LABELS[code], locale) : (locale === "en" ? "Shop capability" : "Fonctionnalité du Shop");
}

export function customerFacingDeviceType(code: string, locale: CustomerFacingLocale) {
  return DEVICE_TYPE_LABELS[code] ? pick(DEVICE_TYPE_LABELS[code], locale) : (locale === "en" ? "POS equipment" : "Équipement du point de vente");
}

export function customerFacingFulfillmentMode(code: string, locale: CustomerFacingLocale) {
  return FULFILLMENT_MODE_LABELS[code] ? pick(FULFILLMENT_MODE_LABELS[code], locale) : (locale === "en" ? "Customer order" : "Commande client");
}

export function customerFacingReadinessDetail(detail: unknown, complete: boolean, locale: CustomerFacingLocale) {
  if (typeof detail === "string" && detail.trim() && !TECHNICAL_PATTERN.test(detail)) return detail;
  if (typeof detail === "number") return String(detail);
  return complete
    ? (locale === "en" ? "Configuration verified" : "Configuration vérifiée")
    : (locale === "en" ? "Action required to finish setup" : "Action requise pour terminer la mise en service");
}
