import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const ERROR_MESSAGES: Record<string, string> = {
  RETAIL_SECTOR_REQUIRED: "Cette entreprise doit utiliser le profil Commerce Retail pour accéder à cette opération.",
  RETAIL_REFERENCE_INVALID: "Une référence sélectionnée n’appartient pas à cette entreprise ou n’est plus active.",
  RETAIL_CATALOG_ITEM_INVALID: "Un article du ticket est introuvable ou inactif.",
  RETAIL_INVENTORY_ITEM_REQUIRED: "Un article suivi en stock doit disposer d’un article d’inventaire actif.",
  RETAIL_CURRENCY_MISMATCH: "La devise du produit ne correspond pas à la devise de l’opération.",
  RETAIL_LINE_TOTAL_INVALID: "La remise ou la taxe rend le total de ligne invalide.",
  RETAIL_TENDER_TOTAL_MISMATCH: "Les paiements doivent correspondre exactement au total du ticket.",
  RETAIL_FINANCIAL_ACCOUNT_INVALID: "Le compte financier sélectionné ne correspond pas au type ou à la devise attendus.",
  RETAIL_OPEN_CASH_SESSION_REQUIRED: "Ouvrez votre session de caisse sur ce compte avant de faire cette opération cash.",
  RETAIL_INSUFFICIENT_BALANCE: "Le solde opérationnel disponible est insuffisant pour cette opération.",
  RETAIL_PROVIDER_NOT_FOUND: "L’opérateur sélectionné n’est pas actif pour ce type d’opération.",
  RETAIL_FLOAT_ACCOUNT_REQUIRED: "L’opérateur doit être lié à un vrai compte de float avant la première opération.",
  RETAIL_SALE_NOT_FOUND: "Le ticket demandé est introuvable.",
  RETAIL_SALE_NOT_RETURNABLE: "Ce ticket ne peut plus faire l’objet d’un retour.",
  RETAIL_SALE_ALREADY_REVERSED: "Ce ticket a déjà été annulé ou a été modifié depuis votre dernière lecture.",
  RETAIL_TRANSACTION_NOT_FOUND: "L’opération Mobile Money est introuvable.",
  RETAIL_TRANSACTION_CONFLICT: "Cette opération Mobile Money a déjà changé d’état.",
  RETAIL_TOPUP_NOT_FOUND: "La recharge Télécom est introuvable.",
  RETAIL_TOPUP_CONFLICT: "Cette recharge ne peut plus être modifiée avec cette version.",
  RETAIL_CLOSE_NOT_FOUND: "La clôture demandée est introuvable.",
  RETAIL_CLOSE_CONFLICT: "La clôture ou une session de caisse liée a changé d’état.",
  RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN: "La personne ayant soumis la clôture ne peut pas la valider.",
  RETAIL_CASH_COUNT_TOTAL_MISMATCH: "Le total des coupures doit correspondre au montant de caisse déclaré.",
  RETAIL_VARIANCE_REASON_REQUIRED: "Tout écart de caisse ou de float doit être justifié avant soumission.",
  RETAIL_DUPLICATE: "Une même référence ne peut apparaître deux fois dans cette opération.",
  RETAIL_PHONE_INVALID: "Saisissez un numéro au format international avec l’indicatif du pays.",
  RETAIL_EXTERNAL_REFERENCE_REQUIRED: "La référence opérateur est obligatoire pour confirmer cette opération.",
  RETAIL_EXTERNAL_REFERENCE_DUPLICATE: "Cette référence opérateur a déjà été enregistrée pour cet opérateur.",
  RETAIL_PRICE_NOT_CONFIGURED: "Aucun prix de vente applicable n’est configuré pour un article du ticket.",
  RETAIL_TAX_CONFIGURATION_REQUIRED: "Un article taxable n’est pas correctement relié au référentiel fiscal de l’entreprise.",
  RETAIL_TAX_RATE_REQUIRED: "Aucun taux fiscal actif n’est applicable à la date de l’opération.",
  RETAIL_PRICE_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à déroger au prix résolu par le moteur Retail.",
  RETAIL_DISCOUNT_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à modifier manuellement la remise calculée.",
  RETAIL_TAX_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à modifier manuellement la taxe calculée.",
  RETAIL_TAX_INCLUDED_OVERRIDE_FORBIDDEN: "Une taxe incluse dans le prix ne peut pas être modifiée manuellement sur ce ticket.",
  RETAIL_PRICE_OVERRIDE_REASON_REQUIRED: "Précisez le motif de la dérogation de prix, remise ou taxe.",
  RETAIL_RETURN_LINE_INVALID: "Une ligne sélectionnée n’appartient pas au ticket d’origine.",
  RETAIL_RETURN_QUANTITY_EXCEEDED: "La quantité demandée dépasse la quantité encore disponible pour retour.",
  RETAIL_RETURN_STOCK_DISPOSITION_INVALID: "Cette ligne ne peut pas être réintégrée en stock avec la disposition choisie.",
  RETAIL_RETURN_NOT_FOUND: "La demande de retour est introuvable.",
  RETAIL_RETURN_CONFLICT: "La demande de retour a déjà changé d’état. Actualisez-la avant de réessayer.",
  RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN: "La personne qui demande le retour ne peut pas approuver elle-même le remboursement.",
  RETAIL_EXCHANGE_SALE_INVALID: "Le ticket de remplacement choisi n’est pas compatible avec cet échange.",
  RETAIL_REFUND_ACCOUNT_INVALID: "Le compte choisi ne peut pas être utilisé pour ce remboursement ou cette devise.",
  RETAIL_REFUND_AMOUNT_INVALID: "Le montant du remboursement doit être positif et cohérent avec le retour.",
  RETAIL_REFUND_TOTAL_MISMATCH: "Le total remboursé ne correspond pas au montant validé du retour.",
  RETAIL_RETURN_PRODUCT_CONDITION_INVALID: "L’état du produit retourné n’est pas reconnu.",
  RETAIL_CUSTOMER_INVALID: "Le client sélectionné n’existe pas comme client actif dans le CRM de cette entreprise.",
  RETAIL_LOYALTY_PROGRAM_NOT_FOUND: "Le programme de fidélité est introuvable.",
  RETAIL_LOYALTY_PROGRAM_INACTIVE: "Le programme de fidélité n’est pas actif à cette date.",
  RETAIL_LOYALTY_ACCOUNT_INACTIVE: "Le compte de fidélité du client n’est pas actif.",
  RETAIL_LOYALTY_CURRENCY_MISMATCH: "La devise de fidélité ne correspond pas à la devise du programme.",
  RETAIL_LOYALTY_CUSTOMER_MISMATCH: "Le compte fidélité ne correspond pas au client du ticket.",
  RETAIL_LOYALTY_BALANCE_INSUFFICIENT: "Le solde de points disponible est insuffisant pour cette utilisation.",
  RETAIL_STORED_VALUE_NOT_FOUND: "La carte cadeau ou l’avoir est introuvable.",
  RETAIL_STORED_VALUE_INACTIVE: "La carte cadeau ou l’avoir n’est pas utilisable dans son état actuel.",
  RETAIL_STORED_VALUE_EXPIRED: "La carte cadeau ou l’avoir a expiré.",
  RETAIL_STORED_VALUE_EXPIRY_INVALID: "La date d’expiration doit être future.",
  RETAIL_STORED_VALUE_CURRENCY_MISMATCH: "La devise de la carte cadeau ou de l’avoir ne correspond pas à l’opération.",
  RETAIL_STORED_VALUE_INSUFFICIENT: "Le solde de la carte cadeau ou de l’avoir est insuffisant.",
  RETAIL_PAYMENT_NOT_FOUND: "La transaction de paiement est introuvable.",
  RETAIL_PAYMENT_CURRENCY_MISMATCH: "La devise du paiement ne correspond pas à la vente ou au retour.",
  RETAIL_PAYMENT_CONFLICT: "La transaction de paiement a changé d’état. Actualisez avant de réessayer.",
  RETAIL_PAYMENT_TRANSITION_INVALID: "Cette transition d’état de paiement n’est pas autorisée.",
  RETAIL_PROVIDER_OPERATION_NOT_FOUND: "L’opération provider est introuvable.",
  RETAIL_PROVIDER_OPERATION_CONFLICT: "L’opération provider a changé d’état. Actualisez avant de réessayer.",
  RETAIL_PROVIDER_OPERATION_TRANSITION_INVALID: "Cette transition d’état provider n’est pas autorisée.",
  RETAIL_DEVICE_NOT_FOUND: "Le périphérique POS configuré est introuvable.",
  RETAIL_ORGANIZATION_NOT_FOUND: "L’entreprise Retail est introuvable.",
  NEGATIVE_STOCK_FORBIDDEN: "Le stock disponible est insuffisant pour terminer cette vente.",
  INVENTORY_BALANCE_CONFLICT: "Le stock a changé pendant l’opération. Actualisez les disponibilités et réessayez.",
};

type RetailMutationRateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export function getRetailMutationRateLimitPolicy(
  moduleCode: RetailModuleCode,
  action: EnterpriseModuleAction,
  requestedLimit?: number,
): RetailMutationRateLimitPolicy {
  if (moduleCode === "RETAIL_POS" && action === "submit") {
    return { limit: requestedLimit || 300, windowMs: 5 * 60 * 1000 };
  }
  if ((moduleCode === "MOBILE_MONEY_AGENCY" || moduleCode === "TELCO_TOPUPS") && action === "submit") {
    return { limit: requestedLimit || 300, windowMs: 15 * 60 * 1000 };
  }
  if (moduleCode === "RETAIL_DAILY_CLOSE") {
    return { limit: requestedLimit || 60, windowMs: 60 * 60 * 1000 };
  }
  return { limit: requestedLimit || 120, windowMs: 60 * 60 * 1000 };
}

export async function authorizeRetailRequest(
  req: Request,
  organizationId: string,
  moduleCode: RetailModuleCode,
  action: EnterpriseModuleAction,
  options?: { mutation?: boolean; limit?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (options?.mutation) {
    const policy = getRetailMutationRateLimitPolicy(moduleCode, action, options.limit);
    const key = getRateLimitKey(req, `retail:${moduleCode}:${action}:${organizationId}:${session.userId}`);
    const limited = await rateLimit(key, policy.limit, policy.windowMs);
    if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests", message: "Trop d’opérations sur une courte période." }, { status: 429 }) };
  }
  return { ok: true as const, session, access };
}

export function retailErrorResponse(error: unknown, fallback = "RETAIL_OPERATION_FAILED") {
  if (error instanceof EnterpriseRetailError) return NextResponse.json({ error: error.code, message: ERROR_MESSAGES[error.code] || "L’opération Retail n’a pas pu être terminée.", details: error.details }, { status: error.status });
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json({
      error: error.code,
      message: "La comptabilisation de l’opération Shop n’est pas prête ou n’a pas pu être finalisée. Vérifiez la configuration Finance, les comptes et la valorisation du stock.",
      details: error.details,
    }, { status: error.status });
  }
  if (error instanceof EnterpriseDomainError) {
    return NextResponse.json({ error: error.code, message: ERROR_MESSAGES[error.code] || error.message || "L’opération métier n’a pas pu être terminée." }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
    return NextResponse.json({ error: "RETAIL_DUPLICATE", message: "Cette opération existe déjà ou sa référence est déjà utilisée." }, { status: 409 });
  }
  return NextResponse.json({ error: fallback, message: "L’opération n’a pas pu être terminée. Vérifiez les données et réessayez." }, { status: 500 });
}

export function retailListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 30)));
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const providerCode = (url.searchParams.get("providerCode") || "").trim().toUpperCase();
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const from = fromValue ? new Date(fromValue) : null;
  const to = toValue ? new Date(toValue) : null;
  return { page, pageSize, search, status, providerCode, from: from && !Number.isNaN(from.getTime()) ? from : null, to: to && !Number.isNaN(to.getTime()) ? to : null };
}
