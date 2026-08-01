import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { EnterpriseIdentityLinkError } from "@/lib/enterprise/identity-links/service";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function getEnterpriseIdentityInvitationPreview({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const [link, user] = await Promise.all([
    prisma.enterpriseIdentityLink.findUnique({
      where: { invitationTokenDigest: digest(token) },
      select: {
        id: true,
        organizationId: true,
        personIdentityId: true,
        userId: true,
        requestedRelationType: true,
        requestedRoleCode: true,
        status: true,
        purpose: true,
        consentTextVersion: true,
        invitationEmailDigest: true,
        expiresAt: true,
        revision: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  if (!link || !user) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_INVALID",
      "Cette invitation est invalide ou n’est plus disponible.",
      404,
    );
  }
  if ((link.userId && link.userId !== userId) || link.invitationEmailDigest !== digest(user.email.trim().toLowerCase())) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_WRONG_USER",
      "Cette invitation a été adressée à un autre compte DTSC.",
      403,
    );
  }
  const [organization, person] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: link.organizationId, deletedAt: null },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.enterprisePersonIdentity.findFirst({
      where: { id: link.personIdentityId, organizationId: link.organizationId },
      select: { id: true, displayName: true },
    }),
  ]);
  if (!organization || !person) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_UNAVAILABLE",
      "L’entreprise ou la fiche métier associée n’est plus disponible.",
      410,
    );
  }
  return {
    ...link,
    organization,
    person,
    expired: Boolean(link.expiresAt && link.expiresAt <= new Date()),
  };
}
