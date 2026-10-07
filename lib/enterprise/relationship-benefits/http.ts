import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { EnterpriseRelationshipBenefitError } from "@/lib/enterprise/relationship-benefits/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function authorizeRelationshipBenefitsRequest(
  req: Request,
  organizationId: string,
  action: EnterpriseModuleAction,
  options?: { mutation?: boolean; limit?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden", message: "Cette action doit être réalisée depuis DTSC Platform." }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized", message: "Votre session a expiré." }, { status: 401 }) };
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: "Wrong context", message: "Activez d’abord l’espace de cette entreprise." }, { status: 403 }) };
  }
  const access = await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "RELATIONSHIP_BENEFITS", action });
  if (!access.allowed) {
    const status = access.code === "ENTITLEMENT_DENIED" ? 402 : 403;
    return { ok: false as const, response: NextResponse.json({ error: access.code, message: access.message }, { status }) };
  }
  if (options?.mutation) {
    const limited = await rateLimit(
      getRateLimitKey(req, `relationship-benefits:${organizationId}:${session.userId}:${action}`),
      options.limit || 120,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      return { ok: false as const, response: NextResponse.json({ error: "Too many requests", message: "Trop d’opérations sur une courte période. Réessayez plus tard." }, { status: 429 }) };
    }
  }
  return { ok: true as const, session, access };
}

export function relationshipBenefitErrorResponse(error: unknown) {
  if (error instanceof EnterpriseRelationshipBenefitError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
    return NextResponse.json({ error: "RELATIONSHIP_BENEFIT_DUPLICATE", message: "Un avantage avec ce code existe déjà dans cette entreprise." }, { status: 409 });
  }
  console.error("Enterprise relationship benefit operation failed", error);
  return NextResponse.json(
    { error: "RELATIONSHIP_BENEFIT_OPERATION_FAILED", message: "L’opération n’a pas pu être terminée. Vérifiez les données et réessayez." },
    { status: 500 },
  );
}
