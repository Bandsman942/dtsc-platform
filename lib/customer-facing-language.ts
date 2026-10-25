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
  RETAIL_OMNICHANNEL_RETURN_INVOICE_REQUIRED: { fr: "Aucune facture client correspondante et émise n’est disponible. Finalisez la facturation dans Finance avant le retour.", en: "A matching issued customer invoice is required. Complete invoicing in Finance first." },
  RETAIL_OMNICHANNEL_RETURN_INVOICE_UNPAID: { fr: "Cette commande ne dispose pas d’un encaissement client confirmé pouvant être remboursé.", en: "This order has no confirmed customer payment available for refund." },
  RETAIL_OMNICHANNEL_RETURN_PAID_SOURCE_REQUIRED: { fr: "Aucun encaissement confirmé ne couvre seul ce montant. Vérifiez les allocations Finance ; les paiements fractionnés nécessitent un traitement dédié.", en: "No single confirmed payment covers this refund. Check Finance allocations; split tenders require a dedicated workflow." },
  RETAIL_OMNICHANNEL_RETURN_DELIVERY_PROOF_REQUIRED: { fr: "Le retour nécessite une commande entièrement livrée avec preuve de remise au client.", en: "Returns require a fully delivered order with customer handover evidence." },
  RETAIL_OMNICHANNEL_RETURN_VALIDATOR_REQUIRED: { fr: "Choisissez un validateur indépendant habilité à approuver les paiements et avoirs dans Finance.", en: "Choose an independent approver with permission to approve payments and credit notes in Finance." },
  RETAIL_OMNICHANNEL_RETURN_FINANCE_PERMISSION_REQUIRED: { fr: "Cette étape exige les droits Paiements et Créances dans Finance. Contactez le responsable financier.", en: "This step requires Payments and Receivables permissions in Finance. Contact your finance manager." },
  RETAIL_OMNICHANNEL_RETURN_FINANCE_CONFLICT: { fr: "Le remboursement ou l’avoir financier ne correspond plus à la demande approuvée. Contrôlez les pièces dans Finance.", en: "The refund or credit note no longer matches the approved request. Review Finance records." },
  RETAIL_OMNICHANNEL_RETURN_SETTLEMENT_SELF_APPROVAL: { fr: "Le préparateur et le valideur des pièces ne peuvent pas confirmer eux-mêmes le décaissement. Demandez un autre responsable Finance habilité.", en: "The preparer or approver cannot confirm their own payout. Ask another authorized Finance officer." },
  RETAIL_OMNICHANNEL_RETURN_STOCK_INVALID: { fr: "Le stock reçu ne peut pas être réintégré automatiquement. Vérifiez le dépôt et la traçabilité des articles.", en: "Returned goods cannot be restocked automatically. Review the warehouse and item traceability." },
  RETAIL_OMNICHANNEL_RETURN_STOCK_AMBIGUOUS: { fr: "La livraison provenait de plusieurs emplacements. Faites vérifier l'origine physique des articles avant de les remettre en stock.", en: "This delivery came from multiple stock locations. Verify the physical return destination before restocking." },
  RETAIL_OMNICHANNEL_RETURN_ORIGINAL_STOCK_UNVALUED: { fr: "La sortie de stock d'origine n'a pas d'écriture comptable de valorisation validée. Faites régulariser cette livraison par la comptabilité avant d'autoriser sa remise en stock.", en: "The original stock issue has no posted valuation entry. Ask Accounting to reconcile the delivery before approving restocking." },
  RETAIL_OMNICHANNEL_RETURN_QUANTITY_EXCEEDED: { fr: "La quantité dépasse le solde encore disponible pour retour. Actualisez la commande.", en: "The quantity exceeds the remaining returnable amount. Refresh the order." },
  RETAIL_OMNICHANNEL_RETURN_CONFLICT: { fr: "La demande a changé d’état. Actualisez avant de poursuivre.", en: "This return has changed status. Refresh before continuing." },
  RETAIL_OMNICHANNEL_RETURN_AMOUNT_INVALID: { fr: "Le montant remboursable ne correspond pas aux lignes de la commande.", en: "The refundable amount does not match the order lines." },
  RETAIL_OMNICHANNEL_RETURN_IDEMPOTENCY_COLLISION: { fr: "Cette référence de retour correspond déjà à une autre demande. Actualisez.", en: "This return reference already belongs to a different request. Refresh." },
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
  RETAIL_OMNICHANNEL_CANCEL_FAILED: {
    fr: "Cette commande n’a pas pu être annulée. Actualisez son statut et réessayez.",
    en: "This order could not be cancelled. Refresh its status and try again.",
  },
  RETAIL_OMNICHANNEL_CANCELLATION_CONFLICT: {
    fr: "Cette commande a changé d’état ou une livraison a commencé. L’annulation directe n’est plus possible.",
    en: "This order changed status or delivery started. Direct cancellation is no longer available.",
  },
  RETAIL_OMNICHANNEL_ORDER_NOT_FOUND: {
    fr: "Cette commande est introuvable dans l’entreprise active.",
    en: "This order was not found in the active company.",
  },
  RETAIL_OMNICHANNEL_ORDER_CONTEXT_MISSING: {
    fr: "Cette ancienne référence de commande nécessite une vérification par le support.",
    en: "This older order reference requires review by support.",
  },
  RETAIL_OMNICHANNEL_CATALOG_DUPLICATE: {
    fr: "Un article apparaît plusieurs fois dans le panier. Regroupez ses quantités.",
    en: "An item appears more than once in the basket. Combine its quantities.",
  },
  RETAIL_OMNICHANNEL_RESERVATION_INCOMPLETE: {
    fr: "La réservation de stock est en cours ou a échoué. Actualisez avant de réessayer.",
    en: "Stock reservation is still processing or failed. Refresh before trying again.",
  },
  RETAIL_OMNICHANNEL_IDEMPOTENCY_PAYLOAD_MISMATCH: {
    fr: "Cette référence de commande a déjà été utilisée avec des informations différentes.",
    en: "This order reference was already used with different details.",
  },
  RETAIL_OMNICHANNEL_PRICE_PRECISION_UNSUPPORTED: {
    fr: "Le montant du panier ne peut pas être enregistré au centime sans écart. Ajustez le prix ou la quantité.",
    en: "The basket amount cannot be saved to cents without changing the total. Adjust the price or quantity.",
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

const OMNICHANNEL_RETURN_COPY = {
  fr: {
    open: "Demander un retour", title: "Retour après livraison", reason: "Motif du retour",
    reasonPlaceholder: "Décrivez le problème ou la raison du retour", validator: "Validateur indépendant",
    validatorMissing: "Aucun validateur Finance autorisé n’est disponible.", quantity: "Quantité à retourner",
    condition: "État du produit", disposition: "Traitement du stock", restock: "Remettre en vente",
    scrap: "Hors stock / destruction", noStock: "Ne pas réintégrer", submit: "Envoyer la demande",
    close: "Fermer", history: "Demandes de retour", approve: "Approuver", reject: "Rejeter",
    prepare: "Préparer l’avoir et le remboursement", settle: "Confirmer le remboursement et le stock",
    decisionReason: "Motif de la décision", financeHint: "L’approbation de l’avoir et du paiement s’effectue dans Finance par le validateur désigné. Le décaissement exige ensuite un autre responsable habilité.",
    success: "Opération enregistrée. Actualisez pour consulter le nouveau statut.", noReturns: "Aucune demande de retour.",
    conditionSellable: "Revendable", conditionOpened: "Ouvert", conditionDamaged: "Endommagé", conditionDefective: "Défectueux", conditionExpired: "Périmé", conditionOther: "Autre",
    inspection: "Je confirme que les articles retournés ont été reçus et inspectés physiquement avant la réintégration éventuelle au stock.", inspectionNotes: "Constat de réception et d'inspection",
    PENDING_APPROVAL: "À valider", APPROVED: "Approuvé, à préparer", FINANCE_PENDING: "En attente Finance",
    REJECTED: "Refusé", COMPLETED: "Remboursé et traité",
  },
  en: {
    open: "Request return", title: "After-delivery return", reason: "Return reason",
    reasonPlaceholder: "Describe the issue or reason for return", validator: "Independent approver",
    validatorMissing: "No authorized Finance approver is available.", quantity: "Quantity to return",
    condition: "Product condition", disposition: "Stock handling", restock: "Restock for sale",
    scrap: "Scrap / unavailable", noStock: "Do not restock", submit: "Send return request",
    close: "Close", history: "Return requests", approve: "Approve", reject: "Reject",
    prepare: "Prepare credit note and refund", settle: "Confirm refund and inventory",
    decisionReason: "Decision reason", financeHint: "The designated approver must approve the credit note and refund payment in Finance. A separate authorized officer then settles the refund.",
    success: "Action recorded. Refresh to see the updated status.", noReturns: "No return requests.",
    conditionSellable: "Resellable", conditionOpened: "Opened", conditionDamaged: "Damaged", conditionDefective: "Defective", conditionExpired: "Expired", conditionOther: "Other",
    inspection: "I confirm that returned goods have been physically received and inspected before any restocking.", inspectionNotes: "Receipt and inspection details",
    PENDING_APPROVAL: "Pending approval", APPROVED: "Approved, preparation needed", FINANCE_PENDING: "Waiting on Finance",
    REJECTED: "Rejected", COMPLETED: "Refunded and processed",
  },
} as const;

export function customerFacingOmnichannelReturnCopy(locale: CustomerFacingLocale) {
  return OMNICHANNEL_RETURN_COPY[locale];
}

const OMNICHANNEL_CANCELLATION_COPY = {
  fr: {
    cancel: "Annuler la commande",
    reason: "Motif de l’annulation (obligatoire)",
    reasonPlaceholder: "Précisez pourquoi cette commande est annulée",
    confirm: "Confirmer l’annulation",
    back: "Retour",
    successSuffix: "annulée. Les réservations de stock et les avantages ont été libérés.",
  },
  en: {
    cancel: "Cancel order",
    reason: "Reason for cancellation (required)",
    reasonPlaceholder: "Explain why this order is cancelled",
    confirm: "Confirm cancellation",
    back: "Go back",
    successSuffix: "cancelled. Inventory and reserved benefits were released.",
  },
} as const;

export function customerFacingOmnichannelCancellationCopy(locale: CustomerFacingLocale) {
  return OMNICHANNEL_CANCELLATION_COPY[locale];
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
