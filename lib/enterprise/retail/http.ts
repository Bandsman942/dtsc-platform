import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const ERROR_MESSAGES: Record<string, string> = {
  RETAIL_SECTOR_REQUIRED: "Cette entreprise doit utiliser le profil Commerce Retail pour accéder à cette opération.",
  RETAIL_REFERENCE_INVALID: "Un site, dépôt, emplacement ou client sélectionné n’appartient pas à cette entreprise.",
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
  RETAIL_PHONE_INVALID: "Saisissez un numéro international valide, par exemple +243xxxxxxxxx.",
  RETAIL_EXTERNAL_REFERENCE_REQUIRED: "La référence opérateur est obligatoire pour confirmer cette opération.",
  RETAIL_EXTERNAL_REFERENCE_DUPLICATE: "Cette référence opérateur a déjà été enregistrée pour cet opérateur.",
  RETAIL_PRICE_OVERRIDE_FORBIDDEN: "Ce prix, cette remise ou cette taxe diffère du catalogue. Un responsable autorisé doit valider cette dérogation.",
  RETAIL_PRICE_OVERRIDE_REASON_REQUIRED: "Précisez le motif de la dérogation de prix, remise ou taxe.",
  RETAIL_ORGANIZATION_NOT_FOUND: "L’entreprise Retail est introuvable.",
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
  if (error instanceof EnterpriseRetailError) return NextResponse.json({ error: error.code, message: ERROR_MESSAGES[error.code] || error.code, details: error.details }, { status: error.status });
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json({
      error: error.code,
      message: "La comptabilisation de l’opération Shop n’est pas prête ou n’a pas pu être finalisée. Vérifiez la configuration Finance, les comptes et la valorisation du stock.",
      details: error.details,
    }, { status: error.status });
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