import { NextResponse } from "next/server";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseGamingCheckoutError } from "@/lib/enterprise/gaming/checkout";

const messages: Record<string, { fr: string; en: string }> = {
  GAMING_CHECKOUT_NOT_FOUND: { fr: "Cet encaissement Gaming est introuvable.", en: "This Gaming checkout could not be found." },
  GAMING_CHECKOUT_SESSION_NOT_FOUND: { fr: "La session sélectionnée est introuvable.", en: "The selected session could not be found." },
  GAMING_CHECKOUT_SESSION_NOT_READY: { fr: "Terminez d’abord la session avant de préparer son encaissement.", en: "End the session before preparing its checkout." },
  GAMING_CHECKOUT_BILLABLE_SESSION_REQUIRED: { fr: "Cette session ne contient pas encore de montant serveur facturable. Vérifiez le tarif et terminez la session.", en: "This session does not yet contain a server-calculated billable amount. Check pricing and end the session." },
  GAMING_CHECKOUT_IDEMPOTENCY_CONFLICT: { fr: "Cette clé de reprise a déjà été utilisée pour une autre session.", en: "This retry key was already used for another session." },
  GAMING_CHECKOUT_SERVICE_INVALID: { fr: "Le service facturé n’est plus actif dans le Catalogue commun.", en: "The billed service is no longer active in the shared Catalog." },
  GAMING_CHECKOUT_DUPLICATE_EXTRA_ITEM: { fr: "Un article complémentaire apparaît plusieurs fois. Regroupez sa quantité sur une seule ligne.", en: "An extra item appears more than once. Combine its quantity into one line." },
  GAMING_CHECKOUT_EXTRA_ITEM_INVALID: { fr: "Un article complémentaire n’existe plus dans le Catalogue de cette entreprise.", en: "An extra item no longer exists in this organization Catalog." },
  GAMING_CHECKOUT_EXTRA_MUST_BE_PHYSICAL: { fr: "Les lignes complémentaires du checkout sont réservées aux produits physiques. Le temps de jeu reste le service de la session.", en: "Checkout extras are reserved for physical products. Gaming time remains the session service." },
  GAMING_CHECKOUT_EXTRA_PRICE_MISSING: { fr: "Aucun prix de vente actif dans la devise de la session n’existe pour cet article.", en: "No active sale price in the session currency exists for this item." },
  GAMING_CHECKOUT_INVENTORY_ITEM_REQUIRED: { fr: "Un produit suivi en stock n’est pas configuré dans Inventory. Configurez-le avant la vente.", en: "A stock-tracked product is not configured in Inventory. Configure it before selling." },
  GAMING_CHECKOUT_LOT_SELECTION_REQUIRED: { fr: "Ce produit exige un lot de stock explicite. Le checkout Gaming ne peut pas choisir un lot automatiquement.", en: "This product requires an explicit stock lot. Gaming checkout cannot choose a lot automatically." },
  GAMING_CHECKOUT_WAREHOUSE_REQUIRED: { fr: "Sélectionnez un entrepôt pour les snacks ou accessoires suivis en stock.", en: "Select a warehouse for stock-tracked snacks or accessories." },
  GAMING_CHECKOUT_WAREHOUSE_INVALID: { fr: "L’entrepôt sélectionné n’est pas actif dans cette entreprise.", en: "The selected warehouse is not active in this organization." },
  GAMING_CHECKOUT_WAREHOUSE_SITE_MISMATCH: { fr: "L’entrepôt sélectionné n’appartient pas au site du poste de jeu.", en: "The selected warehouse does not belong to the gaming station site." },
  GAMING_CHECKOUT_LOCATION_INVALID: { fr: "L’emplacement de stock sélectionné n’appartient pas à cet entrepôt.", en: "The selected stock location does not belong to this warehouse." },
  GAMING_CHECKOUT_STATION_ASSET_INVALID: { fr: "L’actif du poste de jeu n’est plus disponible. Corrigez le poste avant l’encaissement.", en: "The gaming station asset is no longer available. Fix the station before checkout." },
  GAMING_CHECKOUT_CUSTOMER_INVALID: { fr: "Le client de la session n’est plus un client CRM actif de cette entreprise.", en: "The session customer is no longer an active CRM customer in this organization." },
  GAMING_CHECKOUT_REVISION_CONFLICT: { fr: "Cet encaissement a changé entre-temps. Rechargez-le avant de recommencer.", en: "This checkout changed in the meantime. Reload it before trying again." },
  GAMING_CHECKOUT_INVOICE_NOT_FOUND: { fr: "La facture Finance liée à cet encaissement est introuvable.", en: "The Finance invoice linked to this checkout could not be found." },
  GAMING_CHECKOUT_INVOICE_NOT_ISSUED: { fr: "La facture n’a pas pu être émise. Vérifiez sa validation Finance.", en: "The invoice could not be issued. Check its Finance approval." },
  GAMING_CHECKOUT_NOT_PAYABLE: { fr: "Cet encaissement n’accepte plus de nouveau paiement dans son état actuel.", en: "This checkout cannot accept another payment in its current state." },
  GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN: { fr: "La créance de cette facture n’a plus de solde ouvert.", en: "This invoice receivable no longer has an open balance." },
  GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING: { fr: "Le paiement dépasse le montant encore disponible après les paiements déjà préparés.", en: "The payment exceeds the amount still available after already prepared payments." },
  GAMING_CHECKOUT_PAYMENT_IDEMPOTENCY_CONFLICT: { fr: "Cette clé de paiement correspond déjà à un autre montant, compte ou moyen de paiement.", en: "This payment retry key already belongs to another amount, account, or payment method." },
  GAMING_CHECKOUT_PAYMENT_INVALID: { fr: "Ce paiement n’appartient pas à cet encaissement ou utilise une devise/contrepartie incompatible.", en: "This payment does not belong to this checkout or uses an incompatible currency/counterparty." },
  GAMING_CHECKOUT_PAYMENT_NOT_CONFIRMED: { fr: "Le paiement n’a pas atteint l’état confirmé dans Finance.", en: "The payment did not reach the confirmed Finance state." },
  GAMING_CHECKOUT_CANNOT_CANCEL: { fr: "Cet encaissement ne peut plus être annulé directement. Utilisez le remboursement après émission/paiement.", en: "This checkout can no longer be directly cancelled. Use the refund flow after issuance/payment." },
  GAMING_CHECKOUT_NOT_REFUNDABLE: { fr: "Seul un encaissement entièrement payé peut entrer dans le workflow de remboursement.", en: "Only a fully paid checkout can enter the refund workflow." },
  GAMING_CHECKOUT_REFUND_IDEMPOTENCY_CONFLICT: { fr: "Cette clé de remboursement correspond déjà à un autre compte ou moyen de paiement.", en: "This refund retry key already belongs to another account or payment method." },
  GAMING_CHECKOUT_REFUND_NOT_PENDING: { fr: "Aucune demande de remboursement n’est en attente pour cet encaissement.", en: "No refund request is pending for this checkout." },
  GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN: { fr: "Le demandeur du remboursement ne peut pas approuver lui-même le remboursement.", en: "The refund requester cannot approve their own refund." },
  GAMING_CHECKOUT_REFUND_PAYMENT_NOT_FOUND: { fr: "Le paiement sortant de remboursement est introuvable.", en: "The outbound refund payment could not be found." },
  GAMING_CHECKOUT_REFUND_PAYMENT_NOT_APPROVED: { fr: "Le remboursement doit d’abord être approuvé dans le workflow Paiements.", en: "The refund must first be approved through the Payments workflow." },
  GAMING_CHECKOUT_CREDIT_NOTE_NOT_POSTED: { fr: "L’avoir client du remboursement n’a pas pu être comptabilisé.", en: "The customer credit note for the refund could not be posted." },
  GAMING_CHECKOUT_REFUND_NOT_CONFIRMED: { fr: "Le paiement de remboursement n’a pas pu être confirmé dans la trésorerie commune.", en: "The refund payment could not be confirmed in shared treasury." },
  GAMING_CLOSE_NOT_FOUND: { fr: "Cette clôture Gaming est introuvable.", en: "This Gaming close could not be found." },
  GAMING_CLOSE_SITE_INVALID: { fr: "Le site sélectionné n’est pas actif dans cette entreprise.", en: "The selected site is not active in this organization." },
  GAMING_CLOSE_DUPLICATE_SCOPE: { fr: "Le même compte et moyen de paiement apparaissent plusieurs fois dans la déclaration.", en: "The same account and payment method appear more than once in the declaration." },
  GAMING_CLOSE_FINANCIAL_ACCOUNT_INVALID: { fr: "Un compte financier sélectionné n’est pas actif dans cette entreprise.", en: "A selected financial account is not active in this organization." },
  GAMING_CLOSE_FINANCIAL_ACCOUNT_SITE_MISMATCH: { fr: "Un compte financier sélectionné est rattaché à un autre site.", en: "A selected financial account is assigned to another site." },
  GAMING_CLOSE_VARIANCE_REASON_REQUIRED: { fr: "Expliquez l’écart entre le net attendu et le montant déclaré avant de soumettre la clôture.", en: "Explain the difference between expected net and declared amount before submitting the close." },
  GAMING_CLOSE_ALREADY_EXISTS: { fr: "Une clôture soumise ou validée existe déjà pour ce site et cette journée métier.", en: "A submitted or validated close already exists for this site and business day." },
  GAMING_CLOSE_REVISION_CONFLICT: { fr: "Cette clôture a changé entre-temps. Rechargez-la avant de recommencer.", en: "This close changed in the meantime. Reload it before trying again." },
  GAMING_CLOSE_ALREADY_DECIDED: { fr: "Cette clôture a déjà été validée ou rejetée.", en: "This close has already been validated or rejected." },
  GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN: { fr: "La personne qui soumet la clôture ne peut pas la valider elle-même.", en: "The person who submits the close cannot validate it themselves." },
};

function locale(req: Request): "fr" | "en" {
  return req.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function gamingCheckoutErrorResponse(error: unknown, request: Request, fallback = "GAMING_CHECKOUT_OPERATION_FAILED") {
  if (error instanceof EnterpriseGamingCheckoutError) {
    const language = locale(request);
    const message = messages[error.code]?.[language] || (language === "en" ? "The Gaming operation could not be completed." : "L’opération Gaming n’a pas pu être terminée.");
    return NextResponse.json({ error: error.code, message, details: error.details }, { status: error.status });
  }
  if (error instanceof EnterpriseAccountingError) return financeErrorResponse(error, fallback);
  if (error instanceof EnterpriseDomainError) return enterpriseDomainErrorResponse(error, fallback, request);
  console.error(fallback, error);
  const language = locale(request);
  return NextResponse.json({ error: fallback, message: language === "en" ? "An internal error prevented the Gaming operation." : "Une erreur interne a empêché l’opération Gaming." }, { status: 500 });
}
