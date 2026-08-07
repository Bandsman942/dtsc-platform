import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const RETAIL_ERROR_MESSAGES: Record<string, string> = {
  RETAIL_SECTOR_REQUIRED: "Ce module est réservé aux entreprises configurées dans le secteur Commerce / distribution / vente.",
  RETAIL_PROVIDER_NOT_FOUND: "L’opérateur sélectionné n’est pas configuré pour cette entreprise.",
  RETAIL_FINANCIAL_ACCOUNT_INVALID: "Le compte financier sélectionné est invalide, inactif ou dans une autre devise.",
  RETAIL_CASH_ACCOUNT_REQUIRED: "Sélectionnez une caisse active pour cette opération.",
  RETAIL_FLOAT_ACCOUNT_REQUIRED: "Configurez un compte de float Mobile Money pour cet opérateur.",
  RETAIL_OPEN_CASH_SESSION_REQUIRED: "Une session de caisse ouverte est nécessaire avant cette opération.",
  RETAIL_INSUFFICIENT_BALANCE: "Le solde opérationnel du compte est insuffisant pour terminer cette opération.",
  RETAIL_TENDER_TOTAL_MISMATCH: "Le total des moyens de paiement doit être exactement égal au total du ticket.",
  RETAIL_CURRENCY_MISMATCH: "Tous les éléments de l’opération doivent utiliser la même devise.",
  RETAIL_SALE_NOT_FOUND: "Le ticket de vente est introuvable.",
  RETAIL_SALE_ALREADY_REVERSED: "Ce ticket a déjà été annulé.",
  RETAIL_TRANSACTION_NOT_FOUND: "L’opération Mobile Money est introuvable.",
  RETAIL_TOPUP_NOT_FOUND: "La recharge Télécom est introuvable.",
  RETAIL_CLOSE_NOT_FOUND: "La clôture journalière est introuvable.",
  RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN: "La personne qui soumet la clôture ne peut pas la valider elle-même.",
  RETAIL_CLOSE_CONFLICT: "La clôture a déjà évolué. Rechargez les données avant de continuer.",
  RETAIL_VARIANCE_REASON_REQUIRED: "Justifiez chaque écart de caisse ou de float avant la soumission.",
  RETAIL_CASH_COUNT_TOTAL_MISMATCH: "Le total des coupures ne correspond pas au montant déclaré en caisse.",
  RETAIL_DUPLICATE: "Cette opération existe déjà. Le doublon a été bloqué.",
};

export async function authorizeRetailRequest(
  req: Request,
  organizationId: string,
  moduleCode: RetailModuleCode,
  action: EnterpriseModuleAction,
  options?: { mutation?: boolean; limit?: number; windowMs?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized", message: "Votre session a expiré. Reconnectez-vous pour continuer." }, { status: 401 }) };
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-retail:${moduleCode}:${action}:${session.userId}`), options?.limit || 120, options?.windowMs || 3600000);
  if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests", message: "Trop de tentatives ont été effectuées. Réessayez plus tard." }, { status: 429 }) };
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "Forbidden", message: "Votre poste ne vous autorise pas à réaliser cette action Retail." }, { status: 403 }) };
  return { ok: true as const, session, access };
}

export function retailErrorResponse(error: unknown, fallback = "RETAIL_OPERATION_FAILED") {
  if (error instanceof EnterpriseRetailError) {
    return NextResponse.json({ error: error.code, message: RETAIL_ERROR_MESSAGES[error.code] || "L’opération Retail n’a pas pu être terminée.", details: error.details }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return NextResponse.json({ error: "RETAIL_DUPLICATE", message: RETAIL_ERROR_MESSAGES.RETAIL_DUPLICATE }, { status: 409 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback, message: "Une erreur interne a empêché l’opération Retail. Vérifiez les données avant de réessayer." }, { status: 500 });
}

export function retailListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from") as string) : undefined;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to") as string) : undefined;
  return {
    page,
    pageSize,
    search: url.searchParams.get("search")?.trim() || undefined,
    status: url.searchParams.get("status")?.trim() || undefined,
    providerCode: url.searchParams.get("providerCode")?.trim().toUpperCase() || undefined,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  };
}
