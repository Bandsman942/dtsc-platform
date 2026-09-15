import { NextResponse } from "next/server";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { EnterpriseGamingCheckoutError } from "@/lib/enterprise/gaming/checkout";

const messages: Record<string, { fr: string; en: string }> = {
  GAMING_CHECKOUT_NOT_FOUND: { fr: "Cet encaissement Gaming est introuvable.", en: "This Gaming checkout could not be found." },
  GAMING_CHECKOUT_SESSION_NOT_FOUND: { fr: "La session de jeu est introuvable.", en: "The gaming session could not be found." },
  GAMING_CHECKOUT_SESSION_NOT_READY: { fr: "Terminez d’abord la session avant de l’encaisser.", en: "End the session before starting checkout." },
  GAMING_CHECKOUT_BILLABLE_SESSION_REQUIRED: { fr: "La session ne contient pas encore un montant final facturable.", en: "The session does not yet contain a final billable amount." },
  GAMING_CHECKOUT_INVOICE_NOT_ISSUED: { fr: "La facture doit être approuvée et émise avant l’encaissement.", en: "The invoice must be approved and issued before collection." },
  GAMING_CHECKOUT_NOT_PAYABLE: { fr: "Cet encaissement n’accepte plus de nouveau paiement.", en: "This checkout no longer accepts a new payment." },
  GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING: { fr: "Le paiement dépasse le montant restant à encaisser.", en: "The payment exceeds the amount still due." },
  GAMING_CHECKOUT_PAYMENT_INVALID: { fr: "Ce paiement ne correspond pas à cet encaissement.", en: "This payment does not belong to this checkout." },
  GAMING_CHECKOUT_NOT_REFUNDABLE: { fr: "Seul un encaissement entièrement payé peut être remboursé.", en: "Only a fully paid checkout can be refunded." },
  GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN: { fr: "La personne qui demande le remboursement ne peut pas l’approuver elle-même.", en: "The refund requester cannot approve their own refund." },
  GAMING_CHECKOUT_WAREHOUSE_REQUIRED: { fr: "Sélectionnez un dépôt pour les articles physiques suivis en stock.", en: "Select a warehouse for stock-tracked physical items." },
  GAMING_CHECKOUT_EXTRA_PRICE_MISSING: { fr: "Un article ajouté n’a pas de prix de vente actif dans la devise de la session.", en: "An added item has no active sale price in the session currency." },
  GAMING_CLOSE_VARIANCE_REASON_REQUIRED: { fr: "Expliquez tout écart entre le montant attendu et le montant déclaré.", en: "Explain every variance between expected and declared amounts." },
  GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN: { fr: "La personne qui soumet la clôture ne peut pas la valider elle-même.", en: "The person submitting the close cannot validate it themselves." },
  OPEN_CASH_SESSION_REQUIRED: { fr: "Ouvrez d’abord une session de caisse sur le compte sélectionné.", en: "Open a cash session on the selected account first." },
  PAYMENT_CASH_ACCOUNT_REQUIRED: { fr: "Un paiement en espèces exige un compte de caisse actif.", en: "A cash payment requires an active cash account." },
  PAYMENT_MOBILE_MONEY_ACCOUNT_REQUIRED: { fr: "Un paiement Mobile Money exige un compte Mobile Money actif.", en: "A Mobile Money payment requires an active Mobile Money account." },
  ACCOUNTING_SELF_APPROVAL_FORBIDDEN: { fr: "Une autre personne autorisée doit approuver cette opération.", en: "Another authorized person must approve this operation." },
  ACCOUNTING_APPROVER_NOT_ELIGIBLE: { fr: "L’approbateur choisi n’a pas les droits nécessaires.", en: "The selected approver does not have the required permissions." },
};

function language(req: Request) {
  return (req.headers.get("accept-language") || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
}

export function gamingCheckoutErrorResponse(error: unknown, req: Request) {
  const code = error instanceof EnterpriseGamingCheckoutError || error instanceof EnterpriseAccountingError ? error.code : "GAMING_CHECKOUT_FAILED";
  const status = error instanceof EnterpriseGamingCheckoutError || error instanceof EnterpriseAccountingError ? error.status : 500;
  const locale = language(req);
  const fallback = locale === "en" ? "The Gaming operation could not be completed." : "L’opération Gaming n’a pas pu être terminée.";
  return NextResponse.json({ error: code, message: messages[code]?.[locale] || fallback }, { status });
}
