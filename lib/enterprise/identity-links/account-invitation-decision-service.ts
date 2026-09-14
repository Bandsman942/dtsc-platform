import { createHash } from "node:crypto";
import {
  buildEnterpriseIdentityConsentStatement,
  canTransitionEnterpriseIdentityLink,
  type EnterpriseIdentityLinkStatus,
  type EnterpriseIdentityRelationType,
} from "@/lib/enterprise/identity-links/contracts";
import { EnterpriseIdentityLinkError } from "@/lib/enterprise/identity-links/service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function assertionDigest(statement: string, version: string) {
  return digest(`${version}\n${statement}`);
}

function assertTransition(from: string, to: EnterpriseIdentityLinkStatus) {
  if (!canTransitionEnterpriseIdentityLink(from as EnterpriseIdentityLinkStatus, to)) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_INVALID_TRANSITION",
      "Cette action n’est plus disponible dans l’état actuel de la relation.",
      409,
    );
  }
}

async function requireAccountBoundInvitation({
  linkId,
  userId,
  revision,
}: {
  linkId: string;
  userId: string;
  revision: number;
}) {
  const [link, user] = await Promise.all([
    prisma.enterpriseIdentityLink.findFirst({
      where: { id: linkId, userId, origin: "ENTERPRISE" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, locale: true },
    }),
  ]);

  if (!link || !user) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_NOT_FOUND",
      "Cette invitation est introuvable ou n’est pas associée à votre compte DTSC.",
      404,
    );
  }

  if (link.status === "ACTIVE" || link.status === "REFUSED") {
    return { link, user, alreadyDecided: true as const };
  }

  if (link.revision !== revision) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_CONCURRENT_UPDATE",
      "Cette invitation a changé. Actualisez la page avant de réessayer.",
      409,
    );
  }

  if (link.status !== "INVITATION_PENDING") {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_INVALID_TRANSITION",
      "Cette invitation ne peut plus être acceptée ou refusée depuis cet écran.",
      409,
    );
  }

  if (!link.invitationEmailDigest || link.invitationEmailDigest !== digest(normalizeEmail(user.email))) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_EMAIL_MISMATCH",
      "Connectez-vous avec l’adresse à laquelle l’invitation a été envoyée.",
      403,
    );
  }

  if (link.expiresAt && link.expiresAt <= new Date()) {
    const expired = await prisma.enterpriseIdentityLink.updateMany({
      where: { id: link.id, userId, revision: link.revision, status: "INVITATION_PENDING" },
      data: { status: "EXPIRED", invitationTokenDigest: null, revision: { increment: 1 } },
    });
    if (expired.count === 1) {
      await prisma.enterpriseIdentityLinkEvent.create({
        data: {
          organizationId: link.organizationId,
          identityLinkId: link.id,
          eventType: "INVITATION_EXPIRED",
          fromStatus: "INVITATION_PENDING",
          toStatus: "EXPIRED",
          actorUserId: userId,
        },
      });
    }
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_EXPIRED",
      "Cette invitation a expiré. Demandez à l’entreprise d’en envoyer une nouvelle.",
      410,
    );
  }

  return { link, user, alreadyDecided: false as const };
}

export async function acceptAccountBoundEnterpriseIdentityInvitation({
  linkId,
  userId,
  revision,
}: {
  linkId: string;
  userId: string;
  revision: number;
}) {
  const loaded = await requireAccountBoundInvitation({ linkId, userId, revision });
  if (loaded.alreadyDecided) {
    if (loaded.link.status === "ACTIVE") return loaded.link;
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_INVALID_TRANSITION",
      "Cette invitation a déjà été refusée.",
      409,
    );
  }

  const { link, user } = loaded;
  assertTransition(link.status, "ACTIVE");
  const organization = await prisma.organization.findFirst({
    where: { id: link.organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new EnterpriseIdentityLinkError(
      "ORGANIZATION_NOT_FOUND",
      "L’entreprise à l’origine de cette invitation est introuvable ou inactive.",
      404,
    );
  }

  const statement = buildEnterpriseIdentityConsentStatement({
    organizationName: organization.name,
    relationType: link.requestedRelationType as EnterpriseIdentityRelationType,
    purpose: link.purpose,
    locale: user.locale,
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.enterpriseIdentityLink.updateMany({
      where: {
        id: link.id,
        userId,
        revision: link.revision,
        status: "INVITATION_PENDING",
      },
      data: {
        status: "ACTIVE",
        userDecisionAt: new Date(),
        activatedAt: new Date(),
        invitationTokenDigest: null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new EnterpriseIdentityLinkError(
        "IDENTITY_LINK_CONCURRENT_UPDATE",
        "Cette invitation a changé. Actualisez la page avant de réessayer.",
        409,
      );
    }

    await tx.enterpriseIdentityConsentRecord.create({
      data: {
        organizationId: link.organizationId,
        identityLinkId: link.id,
        userId,
        action: "ACCEPT",
        purpose: link.purpose,
        consentTextVersion: link.consentTextVersion,
        statementDigest: assertionDigest(statement, link.consentTextVersion),
        metadataJson: { origin: "ENTERPRISE_INVITATION", decisionChannel: "ACCOUNT_RELATION_DETAIL" },
      },
    });
    await tx.enterpriseIdentityLinkEvent.create({
      data: {
        organizationId: link.organizationId,
        identityLinkId: link.id,
        eventType: "USER_CONSENT_ACCEPTED",
        fromStatus: link.status,
        toStatus: "ACTIVE",
        actorUserId: userId,
        metadataJson: { decisionChannel: "ACCOUNT_RELATION_DETAIL" },
      },
    });
  });

  await notifyUser({
    userId: link.initiatedByUserId,
    organizationId: link.organizationId,
    type: "ENTERPRISE_IDENTITY",
    title: "Invitation acceptée",
    body: `La personne invitée a accepté la relation avec ${organization.name}.`,
    targetUrl: `/enterprise-identity-admin?link=${link.id}`,
    idempotencyKey: `enterprise-identity-accepted:${link.id}`,
  });

  return prisma.enterpriseIdentityLink.findUnique({ where: { id: link.id } });
}

export async function refuseAccountBoundEnterpriseIdentityInvitation({
  linkId,
  userId,
  revision,
  reason,
}: {
  linkId: string;
  userId: string;
  revision: number;
  reason?: string;
}) {
  const loaded = await requireAccountBoundInvitation({ linkId, userId, revision });
  if (loaded.alreadyDecided) {
    if (loaded.link.status === "REFUSED") return { ok: true };
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_INVALID_TRANSITION",
      "Cette invitation a déjà été acceptée.",
      409,
    );
  }

  const { link } = loaded;
  assertTransition(link.status, "REFUSED");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.enterpriseIdentityLink.updateMany({
      where: {
        id: link.id,
        userId,
        revision: link.revision,
        status: "INVITATION_PENDING",
      },
      data: {
        status: "REFUSED",
        userDecisionAt: new Date(),
        refusedAt: new Date(),
        refusalReason: reason || null,
        invitationTokenDigest: null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new EnterpriseIdentityLinkError(
        "IDENTITY_LINK_CONCURRENT_UPDATE",
        "Cette invitation a changé. Actualisez la page avant de réessayer.",
        409,
      );
    }
    await tx.enterpriseIdentityLinkEvent.create({
      data: {
        organizationId: link.organizationId,
        identityLinkId: link.id,
        eventType: "USER_CONSENT_REFUSED",
        fromStatus: link.status,
        toStatus: "REFUSED",
        actorUserId: userId,
        reason,
        metadataJson: { decisionChannel: "ACCOUNT_RELATION_DETAIL" },
      },
    });
  });

  return { ok: true };
}
