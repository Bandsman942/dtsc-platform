import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import type { EnterpriseFinanceAction, EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const FINANCE_ERROR_MESSAGES: Record<string, string> = {
  FINANCE_PERIOD_CLOSED: "Cette période financière est fermée. Choisissez une période ouverte ou demandez une réouverture autorisée.",
  JOURNAL_ENTRY_UNBALANCED: "Le total des débits doit être égal au total des crédits avant la comptabilisation.",
  POSTING_RULE_NOT_FOUND: "Aucune règle comptable active ne correspond à cette opération. Vérifiez la configuration Finance.",
  POSTING_MAPPING_MISSING: "Un compte comptable requis n’est pas configuré pour cette opération.",
  DUPLICATE_POSTING_ATTEMPT: "Cette opération a déjà été comptabilisée. Aucune seconde écriture n’a été créée.",
  POSTING_BATCH_ALREADY_EXISTS: "Cette opération a déjà été traitée. Le lot comptable existant a été conservé.",
  ACCOUNT_IN_USE: "Ce compte est déjà utilisé dans des écritures. Désactivez-le au lieu de le supprimer.",
  SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette opération.",
  JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN: "La contrepassation doit être effectuée par une autre personne autorisée.",
  JOURNAL_ENTRY_ALREADY_REVERSED: "Cette écriture a déjà été contrepassée. Aucune seconde contrepassation n’a été créée.",
  ONLY_POSTED_ENTRY_CAN_BE_REVERSED: "Seule une écriture comptabilisée peut être contrepassée.",
  INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN: "La sortie dépasse les quantités comptables valorisées disponibles.",
  ASSET_DEPRECIATION_NOT_ELIGIBLE: "Cette échéance d’amortissement n’est pas éligible à la comptabilisation.",
  FINANCIAL_CLOSE_BLOCKED: "La période contient encore des blocages. Corrigez-les avant la clôture.",
  FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN: "La clôture doit être approuvée par une autre personne autorisée.",
  FINANCE_DUPLICATE: "Une donnée identique existe déjà dans cette entreprise.",
};

export async function authorizeFinanceRequest(
  req: Request,
  organizationId: string,
  moduleCode: EnterpriseFinanceModuleCode,
  action: EnterpriseFinanceAction,
  options?: { mutation?: boolean; limit?: number; windowMs?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) return { ok: false as const, response: NextResponse.json({ error: "Forbidden", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized", message: "Votre session a expiré. Reconnectez-vous pour continuer." }, { status: 401 }) };
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-finance:${moduleCode}:${action}:${session.userId}`), options?.limit || 120, options?.windowMs || 3600000);
  if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests", message: "Trop de tentatives ont été effectuées. Réessayez plus tard." }, { status: 429 }) };
  const access = await getEnterpriseAccountingAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "Forbidden", message: "Vous ne disposez pas de la permission Finance nécessaire pour cette action." }, { status: 403 }) };
  return { ok: true as const, session, access };
}

export function financeErrorResponse(error: unknown, fallback = "FINANCE_OPERATION_FAILED") {
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json(
      {
        error: error.code,
        message: FINANCE_ERROR_MESSAGES[error.code] || "L’opération financière n’a pas pu être terminée. Vérifiez les données et le statut de la période.",
        details: error.details,
      },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return NextResponse.json({ error: "FINANCE_DUPLICATE", message: FINANCE_ERROR_MESSAGES.FINANCE_DUPLICATE }, { status: 409 });
  }
  console.error(fallback, error);
  return NextResponse.json(
    {
      error: fallback,
      message: FINANCE_ERROR_MESSAGES[fallback] || "Une erreur interne a empêché l’opération financière. Aucune donnée comptable ne doit être considérée comme validée.",
    },
    { status: 500 },
  );
}

export function financeListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  return { page, pageSize, search: url.searchParams.get("search")?.trim() || undefined, status: url.searchParams.get("status")?.trim() || undefined };
}
