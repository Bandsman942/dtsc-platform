import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { EducationModuleCode, EducationResourceCode } from "@/lib/enterprise/education/constants";
import { EDUCATION_RESOURCE_MODULE } from "@/lib/enterprise/education/constants";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const ERROR_MESSAGES: Record<string, { fr: string; en: string }> = {
  EDUCATION_REFERENCE_INVALID: {
    fr: "Une référence académique sélectionnée n’appartient pas à cette entreprise ou n’est plus active.",
    en: "A selected academic reference does not belong to this organization or is no longer active.",
  },
  EDUCATION_PERIOD_YEAR_MISMATCH: {
    fr: "La période sélectionnée n’appartient pas à l’année académique choisie.",
    en: "The selected period does not belong to the selected academic year.",
  },
  EDUCATION_CLASS_SCOPE_MISMATCH: {
    fr: "La classe sélectionnée ne correspond pas à l’année ou au campus de cette offre de cours.",
    en: "The selected class does not match the academic year or campus of this course offering.",
  },
  EDUCATION_YEAR_IN_USE: {
    fr: "Cette année académique est déjà utilisée. Clôturez-la ou conservez-la dans l’historique au lieu de la supprimer.",
    en: "This academic year is already in use. Close it or keep it in history instead of deleting it.",
  },
  EDUCATION_PERIOD_IN_USE: {
    fr: "Cette période académique est déjà utilisée et doit rester disponible dans l’historique.",
    en: "This academic period is already in use and must remain available in history.",
  },
  EDUCATION_RECORD_NOT_FOUND: {
    fr: "Cette donnée académique est introuvable ou a déjà été archivée.",
    en: "This academic record was not found or has already been archived.",
  },
  REVISION_CONFLICT: {
    fr: "Cette fiche a été modifiée par une autre personne. Actualisez-la avant de réessayer.",
    en: "This record was changed by someone else. Refresh it before trying again.",
  },
};

function localeFor(req?: Request) {
  return req?.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export async function authorizeEducationRequest(
  req: Request,
  organizationId: string,
  resourceOrModule: EducationResourceCode | EducationModuleCode,
  action: EnterpriseModuleAction,
  options?: { mutation?: boolean; limit?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) {
    return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN", message: "Origine de requête non autorisée." }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 }) };
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: "INVALID_CONTEXT", message: "Sélectionnez cette entreprise avant de continuer." }, { status: 403 }) };
  }
  const moduleCode = resourceOrModule in EDUCATION_RESOURCE_MODULE
    ? EDUCATION_RESOURCE_MODULE[resourceOrModule as EducationResourceCode]
    : resourceOrModule as EducationModuleCode;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à utiliser ce module." }, { status: 403 }) };
  if (options?.mutation) {
    const key = getRateLimitKey(req, `education:${moduleCode}:${action}:${organizationId}:${session.userId}`);
    const limited = await rateLimit(key, options.limit || 120, 60 * 60 * 1000);
    if (!limited.ok) {
      return { ok: false as const, response: NextResponse.json({ error: "RATE_LIMITED", message: "Trop d’opérations académiques sur une courte période." }, { status: 429 }) };
    }
  }
  return { ok: true as const, session, access, moduleCode };
}

export function educationErrorResponse(error: unknown, fallback = "EDUCATION_OPERATION_FAILED", req?: Request) {
  const locale = localeFor(req);
  if (error instanceof EnterpriseDomainError) {
    const message = ERROR_MESSAGES[error.code]?.[locale]
      || (locale === "en" ? "The academic operation could not be completed with the current information." : "L’opération académique ne peut pas être terminée avec les informations actuelles.");
    return NextResponse.json({ error: error.code, message }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
    return NextResponse.json({
      error: "EDUCATION_DUPLICATE",
      message: locale === "en" ? "A record with the same academic code already exists." : "Une donnée avec le même code académique existe déjà.",
    }, { status: 409 });
  }
  return NextResponse.json({
    error: fallback,
    message: locale === "en" ? "The academic operation could not be completed. Review the information and try again." : "L’opération académique n’a pas pu être terminée. Vérifiez les informations puis réessayez.",
  }, { status: 500 });
}

export function educationListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 25)));
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const campusId = (url.searchParams.get("campusId") || "").trim() || null;
  const academicYearId = (url.searchParams.get("academicYearId") || "").trim() || null;
  return { page, pageSize, search, status, campusId, academicYearId, skip: (page - 1) * pageSize };
}
