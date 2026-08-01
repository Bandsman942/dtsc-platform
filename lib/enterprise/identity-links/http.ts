import { NextResponse } from "next/server";
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
  console.error("Enterprise identity link operation failed", error);
  return NextResponse.json(
    {
      error: "IDENTITY_LINK_OPERATION_FAILED",
      message: "L’opération n’a pas pu être terminée. Réessayez ou contactez le support si le problème persiste.",
    },
    { status: 500 },
  );
}
