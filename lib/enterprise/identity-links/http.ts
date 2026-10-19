import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth";
import { EnterpriseIdentityLinkError } from "@/lib/enterprise/identity-links/service";
import {
  canAccessOrganizationAdministration,
  requireActiveOrganizationMembership,
} from "@/lib/organizations";
import { isSameOriginRequest } from "@/lib/request-security";

export async function requireIdentityLinkSession(req: Request) {
  if (!isSameOriginRequest(req)) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_ORIGIN_DENIED",
      "Cette action doit être réalisée depuis DTSC Platform.",
      403,
    );
  }
  const session = await getSession();
  if (!session) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_UNAUTHENTICATED",
      "Votre session a expiré. Reconnectez-vous pour continuer.",
      401,
    );
  }
  return session;
}

export async function requireIdentityLinkOrganizationAdmin(req: Request, organizationId: string) {
  const session = await requireIdentityLinkSession(req);
  if (session.activeOrganizationId !== organizationId || session.activeContext !== "ORGANIZATION") {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_WRONG_CONTEXT",
      "Activez d’abord le contexte de l’entreprise concernée.",
      403,
    );
  }
  const membership = await requireActiveOrganizationMembership(session, organizationId);
  if (!membership || !canAccessOrganizationAdministration(membership.role)) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_ADMIN_REQUIRED",
      "Vous n’êtes pas autorisé à gérer les relations de cette entreprise.",
      403,
    );
  }
  return { session, membership };
}

export function identityLinkErrorResponse(error: unknown) {
  if (error instanceof EnterpriseIdentityLinkError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  // Prisma's raw exception can contain the full rejected row (purpose and user IDs).
  // Never log the exception object or its message: keep diagnostics free of user data.
  const supportReference = randomUUID().slice(0, 8).toUpperCase();
  const isOutdatedRelationConstraint = error instanceof Error &&
    error.name === "PrismaClientUnknownRequestError" &&
    /EnterpriseIdentityLink_relationType_check|EnterprisePersonBusinessReference_relationType_check/.test(error.message);
  const safeCode = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z][0-9]{4}$/.test(error.code)
      ? error.code : "UNEXPECTED";
  console.error("Enterprise identity link operation failed", {
    kind: error instanceof Error ? error.name : "Unknown",
    code: safeCode,
    supportReference,
  });
  return NextResponse.json(
    {
      error: isOutdatedRelationConstraint ? "IDENTITY_LINK_RELATION_CONFIGURATION_OUTDATED" : "IDENTITY_LINK_OPERATION_FAILED",
      message: isOutdatedRelationConstraint
        ? "Ce type de relation n’est pas encore autorisé par la configuration de l’entreprise. Contactez le support avec la référence indiquée."
        : "La demande n’a pas pu être enregistrée. Réessayez puis contactez le support avec la référence indiquée si nécessaire.",
      supportReference,
    },
    { status: isOutdatedRelationConstraint ? 503 : 500 },
  );
}
