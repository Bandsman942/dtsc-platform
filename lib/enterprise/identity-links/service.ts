import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildUrlForHostType } from "@/lib/domains";
import {
  buildEnterpriseIdentityConsentStatement,
  buildEnterpriseIdentityRevocationStatement,
  canTransitionEnterpriseIdentityLink,
  ENTERPRISE_IDENTITY_INVITATION_TTL_DAYS,
  type EnterpriseIdentityLinkStatus,
  type EnterpriseIdentityRelationType,
} from "@/lib/enterprise/identity-links/contracts";
import type {
  EnterpriseIdentityApprovalInput,
  EnterpriseIdentityInvitationInput,
  EnterpriseIdentityUserRequestInput,
} from "@/lib/enterprise/identity-links/schemas";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

const PENDING_LINK_STATUSES = [
  "INVITATION_PENDING",
  "REQUEST_PENDING",
  "USER_CONSENT_REQUIRED",
  "ORGANIZATION_APPROVAL_REQUIRED",
] as const;

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

type BusinessTarget = Pick<
  EnterpriseIdentityInvitationInput,
  "businessPartyId" | "businessPartyContactId" | "employeeId" | "supplierId" | "supplierContactId" | "displayName" | "relationType" | "roleCode"
>;

export class EnterpriseIdentityLinkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EnterpriseIdentityLinkError";
  }
}

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

async function requireOrganization(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new EnterpriseIdentityLinkError(
      "ORGANIZATION_NOT_FOUND",
      "L’entreprise demandée est introuvable ou inactive.",
      404,
    );
  }
  return organization;
}

async function validateBusinessTarget(
  db: DatabaseClient,
  organizationId: string,
  target: BusinessTarget,
) {
  if (target.supplierContactId) {
    const contact = await db.enterpriseSupplierContact.findFirst({
      where: { id: target.supplierContactId, organizationId },
      select: { id: true, name: true, email: true, phone: true, supplier: { select: { id: true, legalName: true, displayName: true } } },
    });
    if (!contact) {
      throw new EnterpriseIdentityLinkError("BUSINESS_TARGET_NOT_FOUND", "Le contact fournisseur sélectionné est introuvable dans cette entreprise.", 404);
    }
    return {
      displayName: target.displayName || contact.name,
      primaryEmail: contact.email,
      primaryPhone: contact.phone,
      businessPartyId: null,
      businessPartyContactId: null,
      employeeId: null,
      supplierId: null,
      supplierContactId: contact.id,
    };
  }

  if (target.supplierId) {
    const supplier = await db.enterpriseSupplier.findFirst({
      where: { id: target.supplierId, organizationId, archivedAt: null },
      select: { id: true, legalName: true, displayName: true, email: true, phone: true, supplierType: true },
    });
    if (!supplier) {
      throw new EnterpriseIdentityLinkError("BUSINESS_TARGET_NOT_FOUND", "La fiche fournisseur sélectionnée est introuvable dans cette entreprise.", 404);
    }
    if (target.relationType === "SUPPLIER_REPRESENTATIVE" && supplier.supplierType !== "PERSON") {
      throw new EnterpriseIdentityLinkError("SUPPLIER_REPRESENTATIVE_REQUIRES_PERSON", "Sélectionnez un contact du fournisseur personne morale, et non l’organisation elle-même.", 400);
    }
    return {
      displayName: target.displayName || supplier.displayName || supplier.legalName,
      primaryEmail: supplier.email,
      primaryPhone: supplier.phone,
      businessPartyId: null,
      businessPartyContactId: null,
      employeeId: null,
      supplierId: supplier.id,
      supplierContactId: null,
    };
  }

  if (target.employeeId) {
    const employee = await db.enterpriseEmployee.findFirst({
      where: { id: target.employeeId, organizationId, archivedAt: null },
      select: { id: true, displayName: true, workEmail: true, workPhone: true },
    });
    if (!employee) {
      throw new EnterpriseIdentityLinkError(
        "BUSINESS_TARGET_NOT_FOUND",
        "La fiche employé sélectionnée est introuvable dans cette entreprise.",
        404,
      );
    }
    return {
      displayName: employee.displayName,
      primaryEmail: employee.workEmail,
      primaryPhone: employee.workPhone,
      businessPartyId: null,
      businessPartyContactId: null,
      employeeId: employee.id,
      supplierId: null,
      supplierContactId: null,
    };
  }

  if (target.businessPartyContactId) {
    const contact = await db.enterpriseBusinessPartyContact.findFirst({
      where: {
        id: target.businessPartyContactId,
        archivedAt: null,
        businessParty: { organizationId, archivedAt: null },
      },
      select: {
        id: true,
        contactType: true,
        label: true,
        value: true,
        businessParty: { select: { legalName: true, displayName: true } },
      },
    });
    if (!contact) {
      throw new EnterpriseIdentityLinkError(
        "BUSINESS_TARGET_NOT_FOUND",
        "Le contact fournisseur ou client sélectionné est introuvable dans cette entreprise.",
        404,
      );
    }
    return {
      displayName: target.displayName || contact.label || contact.businessParty.displayName || contact.businessParty.legalName,
      primaryEmail: contact.contactType === "EMAIL" ? contact.value : null,
      primaryPhone: contact.contactType === "PHONE" ? contact.value : null,
      businessPartyId: null,
      businessPartyContactId: contact.id,
      employeeId: null,
      supplierId: null,
      supplierContactId: null,
    };
  }

  if (target.businessPartyId) {
    const businessParty = await db.enterpriseBusinessParty.findFirst({
      where: { id: target.businessPartyId, organizationId, archivedAt: null },
      select: {
        id: true,
        partyType: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
        primaryPhone: true,
      },
    });
    if (!businessParty) {
      throw new EnterpriseIdentityLinkError(
        "BUSINESS_TARGET_NOT_FOUND",
        "La fiche métier sélectionnée est introuvable dans cette entreprise.",
        404,
      );
    }
    if (target.relationType === "SUPPLIER_REPRESENTATIVE" && businessParty.partyType !== "PERSON") {
      throw new EnterpriseIdentityLinkError(
        "SUPPLIER_REPRESENTATIVE_REQUIRES_PERSON",
        "Sélectionnez le contact autorisé du fournisseur, et non l’organisation fournisseur elle-même.",
        400,
      );
    }
    return {
      displayName: businessParty.displayName || businessParty.legalName,
      primaryEmail: businessParty.primaryEmail,
      primaryPhone: businessParty.primaryPhone,
      businessPartyId: businessParty.id,
      businessPartyContactId: null,
      employeeId: null,
      supplierId: null,
      supplierContactId: null,
    };
  }

  throw new EnterpriseIdentityLinkError(
    "BUSINESS_TARGET_REQUIRED",
    "Sélectionnez une fiche métier précise avant d’envoyer l’invitation.",
    400,
  );
}

async function findBusinessReference(
  db: DatabaseClient,
  organizationId: string,
  target: BusinessTarget,
) {
  return db.enterprisePersonBusinessReference.findFirst({
    where: {
      organizationId,
      relationType: target.relationType,
      status: "ACTIVE",
      archivedAt: null,
      OR: [
        ...(target.businessPartyId ? [{ businessPartyId: target.businessPartyId }] : []),
        ...(target.businessPartyContactId ? [{ businessPartyContactId: target.businessPartyContactId }] : []),
        ...(target.employeeId ? [{ employeeId: target.employeeId }] : []),
        ...(target.supplierId ? [{ supplierId: target.supplierId }] : []),
        ...(target.supplierContactId ? [{ supplierContactId: target.supplierContactId }] : []),
      ],
    },
  });
}

async function ensurePersonIdentityForTarget(
  db: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  target: BusinessTarget,
) {
  const validated = await validateBusinessTarget(db, organizationId, target);
  const existingReference = await findBusinessReference(db, organizationId, target);
  if (existingReference) {
    const identity = await db.enterprisePersonIdentity.findFirst({
      where: { id: existingReference.personIdentityId, organizationId, archivedAt: null },
    });
    if (!identity) {
      throw new EnterpriseIdentityLinkError(
        "PERSON_IDENTITY_INCONSISTENT",
        "La référence métier existe, mais son identité entreprise est indisponible.",
        409,
      );
    }
    return identity;
  }

  const identity = await db.enterprisePersonIdentity.create({
    data: {
      organizationId,
      displayName: target.displayName || validated.displayName,
      primaryEmail: validated.primaryEmail,
      primaryPhone: validated.primaryPhone,
      createdByUserId: actorUserId,
    },
  });
  await db.enterprisePersonBusinessReference.create({
    data: {
      organizationId,
      personIdentityId: identity.id,
      businessPartyId: validated.businessPartyId,
      businessPartyContactId: validated.businessPartyContactId,
      employeeId: validated.employeeId,
      supplierId: validated.supplierId,
      supplierContactId: validated.supplierContactId,
      relationType: target.relationType,
      roleCode: target.roleCode,
      createdByUserId: actorUserId,
    },
  });
  return identity;
}

async function attachBusinessReferenceToIdentity(
  db: Prisma.TransactionClient,
  organizationId: string,
  personIdentityId: string,
  actorUserId: string,
  target: BusinessTarget,
) {
  const validated = await validateBusinessTarget(db, organizationId, target);
  const existingReference = await findBusinessReference(db, organizationId, target);
  if (existingReference && existingReference.personIdentityId !== personIdentityId) {
    throw new EnterpriseIdentityLinkError(
      "BUSINESS_TARGET_ALREADY_LINKED",
      "Cette fiche métier est déjà rattachée à une autre identité entreprise.",
      409,
    );
  }
  if (!existingReference) {
    await db.enterprisePersonBusinessReference.create({
      data: {
        organizationId,
        personIdentityId,
        businessPartyId: validated.businessPartyId,
        businessPartyContactId: validated.businessPartyContactId,
        employeeId: validated.employeeId,
        supplierId: validated.supplierId,
        supplierContactId: validated.supplierContactId,
        relationType: target.relationType,
        roleCode: target.roleCode,
        createdByUserId: actorUserId,
      },
    });
  }
  await db.enterprisePersonIdentity.updateMany({
    where: { id: personIdentityId, organizationId, archivedAt: null },
    data: {
      displayName: target.displayName || validated.displayName,
      primaryEmail: validated.primaryEmail,
      primaryPhone: validated.primaryPhone,
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
    },
  });
}

async function recordEvent(
  db: Prisma.TransactionClient,
  input: {
    organizationId: string;
    identityLinkId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorUserId?: string | null;
    reason?: string | null;
    metadataJson?: Prisma.InputJsonValue;
  },
) {
  return db.enterpriseIdentityLinkEvent.create({ data: input });
}

async function updateLinkWithRevision(
  db: Prisma.TransactionClient,
  link: { id: string; revision: number; status: string },
  data: Prisma.EnterpriseIdentityLinkUpdateManyMutationInput,
) {
  const result = await db.enterpriseIdentityLink.updateMany({
    where: { id: link.id, revision: link.revision, status: link.status },
    data: { ...data, revision: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_CONCURRENT_UPDATE",
      "La relation a été modifiée entre-temps. Actualisez la page avant de réessayer.",
      409,
    );
  }
}

export async function createEnterpriseIdentityInvitation({
  organizationId,
  actorUserId,
  input,
}: {
  organizationId: string;
  actorUserId: string;
  input: EnterpriseIdentityInvitationInput;
}) {
  const organization = await requireOrganization(organizationId);
  const email = normalizeEmail(input.email);
  const invitationToken = randomBytes(32).toString("base64url");
  const invitationTokenDigest = digest(invitationToken);
  const invitationEmailDigest = digest(email);
  const expiresAt = new Date(Date.now() + ENTERPRISE_IDENTITY_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, locale: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const identity = await ensurePersonIdentityForTarget(tx, organizationId, actorUserId, input);
    const duplicate = await tx.enterpriseIdentityLink.findFirst({
      where: {
        organizationId,
        personIdentityId: identity.id,
        status: { in: [...PENDING_LINK_STATUSES, "ACTIVE"] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new EnterpriseIdentityLinkError(
        "IDENTITY_LINK_ALREADY_PENDING",
        "Une invitation ou une relation active existe déjà pour cette fiche métier.",
        409,
      );
    }

    const link = await tx.enterpriseIdentityLink.create({
      data: {
        organizationId,
        personIdentityId: identity.id,
        userId: existingUser?.id || null,
        origin: "ENTERPRISE",
        requestedRelationType: input.relationType,
        requestedRoleCode: input.roleCode,
        status: "INVITATION_PENDING",
        initiatedByUserId: actorUserId,
        purpose: input.purpose,
        consentTextVersion: input.consentTextVersion,
        invitationEmailDigest,
        invitationTokenDigest,
        expiresAt,
      },
    });
    await recordEvent(tx, {
      organizationId,
      identityLinkId: link.id,
      eventType: "INVITATION_CREATED",
      fromStatus: "DRAFT",
      toStatus: "INVITATION_PENDING",
      actorUserId,
      metadataJson: { relationType: input.relationType, expiresAt: expiresAt.toISOString() },
    });
    return link;
  });

  const targetPath = `/enterprise-links?token=${encodeURIComponent(invitationToken)}`;
  const targetUrl = buildUrlForHostType("app", targetPath);
  const registrationUrl = buildUrlForHostType(
    "account",
    `/auth/sign-up?next=${encodeURIComponent(targetUrl)}`,
  );
  const consentStatement = buildEnterpriseIdentityConsentStatement({
    organizationName: organization.name,
    relationType: input.relationType,
    purpose: input.purpose,
    locale: existingUser?.locale,
  });
  const emailResult = await sendZohoOutboundMail({
    deliveryMode: "direct",
    subject: `${organization.name} vous invite sur DTSC Platform`,
    to: [email],
    heading: "Invitation privée à relier votre compte DTSC",
    source: "enterprise-identity-link",
    message: [
      `Bonjour ${existingUser?.name || input.displayName},`,
      "",
      consentStatement,
      "",
      existingUser ? `Consulter l’invitation : ${targetUrl}` : `Créer votre compte puis consulter l’invitation : ${registrationUrl}`,
      "",
      `Cette invitation expire le ${expiresAt.toLocaleDateString("fr-FR")}. Le lien est personnel et à usage unique.`,
      "",
      "Équipe DTSC",
    ].join("\n"),
  }).catch(() => ({ sent: false, reason: "DELIVERY_FAILED" }));

  if (emailResult.sent) {
    await prisma.enterpriseIdentityLink.updateMany({
      where: { id: created.id, status: "INVITATION_PENDING" },
      data: { invitationSentAt: new Date(), revision: { increment: 1 } },
    });
  } else {
    await prisma.enterpriseIdentityLinkEvent.create({
      data: {
        organizationId,
        identityLinkId: created.id,
        eventType: "INVITATION_DELIVERY_FAILED",
        toStatus: "INVITATION_PENDING",
        actorUserId,
      },
    });
  }

  if (existingUser) {
    await notifyUser({
      userId: existingUser.id,
      organizationId,
      type: "ENTERPRISE_IDENTITY",
      title: "Invitation à relier votre compte DTSC",
      body: `${organization.name} souhaite relier votre compte à une fiche métier. Votre consentement est requis.`,
      targetUrl: targetPath,
      idempotencyKey: `enterprise-identity-invitation:${created.id}`,
    });
  }

  return {
    accepted: true,
    expiresAt,
    message: "Si l’adresse indiquée peut recevoir cette invitation, la personne sera informée par un canal privé.",
  };
}

export async function createUserInitiatedIdentityRequest({
  organizationId,
  userId,
  input,
}: {
  organizationId: string;
  userId: string;
  input: EnterpriseIdentityUserRequestInput;
}) {
  const [organization, user] = await Promise.all([
    requireOrganization(organizationId),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, locale: true } }),
  ]);
  if (!user) {
    throw new EnterpriseIdentityLinkError("USER_NOT_FOUND", "Votre compte est introuvable.", 404);
  }

  const existing = await prisma.enterpriseIdentityLink.findFirst({
    where: {
      organizationId,
      userId,
      requestedRelationType: input.relationType,
      status: { in: [...PENDING_LINK_STATUSES, "ACTIVE"] },
    },
    select: { id: true },
  });
  if (existing) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_REQUEST_ALREADY_EXISTS",
      "Une demande ou relation de ce type existe déjà avec cette entreprise.",
      409,
    );
  }

  const statement = buildEnterpriseIdentityConsentStatement({
    organizationName: organization.name,
    relationType: input.relationType,
    purpose: input.purpose,
    locale: user.locale,
  });
  const created = await prisma.$transaction(async (tx) => {
    const identity = await tx.enterprisePersonIdentity.create({
      data: {
        organizationId,
        displayName: user.name,
        createdByUserId: userId,
      },
    });
    const link = await tx.enterpriseIdentityLink.create({
      data: {
        organizationId,
        personIdentityId: identity.id,
        userId,
        origin: "USER",
        requestedRelationType: input.relationType,
        requestedRoleCode: input.roleCode,
        status: "ORGANIZATION_APPROVAL_REQUIRED",
        initiatedByUserId: userId,
        purpose: input.purpose,
        consentTextVersion: input.consentTextVersion,
        userDecisionAt: new Date(),
      },
    });
    await tx.enterpriseIdentityConsentRecord.create({
      data: {
        organizationId,
        identityLinkId: link.id,
        userId,
        action: "ACCEPT",
        purpose: input.purpose,
        consentTextVersion: input.consentTextVersion,
        statementDigest: assertionDigest(statement, input.consentTextVersion),
        metadataJson: { origin: "USER_REQUEST" },
      },
    });
    await recordEvent(tx, {
      organizationId,
      identityLinkId: link.id,
      eventType: "USER_REQUEST_CREATED",
      fromStatus: "DRAFT",
      toStatus: "ORGANIZATION_APPROVAL_REQUIRED",
      actorUserId: userId,
      metadataJson: { relationType: input.relationType },
    });
    return link;
  });

  const administrators = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      role: { in: ["OWNER", "ADMIN_ENTREPRISE", "MANAGER"] },
    },
    select: { userId: true },
    take: 50,
  });
  await notifyUsers({
    userIds: administrators.map((membership) => membership.userId),
    organizationId,
    type: "ENTERPRISE_IDENTITY",
    title: "Nouvelle demande de relation entreprise",
    body: `${user.name} demande à être reconnu comme ${input.relationType.toLocaleLowerCase("fr")} dans ${organization.name}.`,
    targetUrl: `/enterprise-identity-admin?link=${created.id}`,
  });
  return created;
}

export async function acceptEnterpriseIdentityInvitation({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const tokenDigest = digest(token);
  const [link, user] = await Promise.all([
    prisma.enterpriseIdentityLink.findUnique({ where: { invitationTokenDigest: tokenDigest } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, locale: true } }),
  ]);
  if (!link || !user) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_INVALID",
      "Cette invitation est invalide ou n’est plus disponible.",
      404,
    );
  }
  if (link.userId && link.userId !== userId) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_WRONG_USER",
      "Cette invitation a été adressée à un autre compte DTSC.",
      403,
    );
  }
  if (link.invitationEmailDigest !== digest(normalizeEmail(user.email))) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_EMAIL_MISMATCH",
      "Connectez-vous avec l’adresse à laquelle l’invitation a été envoyée.",
      403,
    );
  }
  if (link.status === "ACTIVE" && link.userId === userId) return link;
  if (link.expiresAt && link.expiresAt <= new Date()) {
    if (link.status === "INVITATION_PENDING") {
      await prisma.$transaction(async (tx) => {
        await updateLinkWithRevision(tx, link, {
          status: "EXPIRED",
          invitationTokenDigest: null,
        });
        await recordEvent(tx, {
          organizationId: link.organizationId,
          identityLinkId: link.id,
          eventType: "INVITATION_EXPIRED",
          fromStatus: link.status,
          toStatus: "EXPIRED",
          actorUserId: userId,
        });
      });
    }
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_INVITATION_EXPIRED",
      "Cette invitation a expiré. Demandez à l’entreprise d’en envoyer une nouvelle.",
      410,
    );
  }
  assertTransition(link.status, "ACTIVE");

  const organization = await requireOrganization(link.organizationId);
  const statement = buildEnterpriseIdentityConsentStatement({
    organizationName: organization.name,
    relationType: link.requestedRelationType as EnterpriseIdentityRelationType,
    purpose: link.purpose,
    locale: user.locale,
  });
  await prisma.$transaction(async (tx) => {
    await updateLinkWithRevision(tx, link, {
      userId,
      status: "ACTIVE",
      userDecisionAt: new Date(),
      activatedAt: new Date(),
      invitationTokenDigest: null,
    });
    await tx.enterpriseIdentityConsentRecord.create({
      data: {
        organizationId: link.organizationId,
        identityLinkId: link.id,
        userId,
        action: "ACCEPT",
        purpose: link.purpose,
        consentTextVersion: link.consentTextVersion,
        statementDigest: assertionDigest(statement, link.consentTextVersion),
        metadataJson: { origin: "ENTERPRISE_INVITATION" },
      },
    });
    await recordEvent(tx, {
      organizationId: link.organizationId,
      identityLinkId: link.id,
      eventType: "USER_CONSENT_ACCEPTED",
      fromStatus: link.status,
      toStatus: "ACTIVE",
      actorUserId: userId,
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

export async function refuseEnterpriseIdentityInvitation({
  token,
  userId,
  reason,
}: {
  token: string;
  userId: string;
  reason?: string;
}) {
  const link = await prisma.enterpriseIdentityLink.findUnique({
    where: { invitationTokenDigest: digest(token) },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!link || !user) {
    throw new EnterpriseIdentityLinkError("IDENTITY_INVITATION_INVALID", "Cette invitation est invalide.", 404);
  }
  if ((link.userId && link.userId !== userId) || link.invitationEmailDigest !== digest(normalizeEmail(user.email))) {
    throw new EnterpriseIdentityLinkError("IDENTITY_INVITATION_WRONG_USER", "Cette invitation ne vous appartient pas.", 403);
  }
  assertTransition(link.status, "REFUSED");
  await prisma.$transaction(async (tx) => {
    await updateLinkWithRevision(tx, link, {
      userId,
      status: "REFUSED",
      userDecisionAt: new Date(),
      refusedAt: new Date(),
      refusalReason: reason || null,
      invitationTokenDigest: null,
    });
    await recordEvent(tx, {
      organizationId: link.organizationId,
      identityLinkId: link.id,
      eventType: "USER_CONSENT_REFUSED",
      fromStatus: link.status,
      toStatus: "REFUSED",
      actorUserId: userId,
      reason,
    });
  });
  return { ok: true };
}

export async function approveUserInitiatedIdentityRequest({
  organizationId,
  linkId,
  actorUserId,
  input,
}: {
  organizationId: string;
  linkId: string;
  actorUserId: string;
  input: EnterpriseIdentityApprovalInput;
}) {
  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: { id: linkId, organizationId },
  });
  if (!link || !link.userId) {
    throw new EnterpriseIdentityLinkError("IDENTITY_REQUEST_NOT_FOUND", "La demande est introuvable.", 404);
  }
  if (link.revision !== input.revision) {
    throw new EnterpriseIdentityLinkError(
      "IDENTITY_LINK_CONCURRENT_UPDATE",
      "La demande a changé. Actualisez la page avant de la traiter.",
      409,
    );
  }
  assertTransition(link.status, "ACTIVE");
  await prisma.$transaction(async (tx) => {
    await attachBusinessReferenceToIdentity(tx, organizationId, link.personIdentityId, actorUserId, {
      ...input,
      relationType: link.requestedRelationType as EnterpriseIdentityRelationType,
      roleCode: input.roleCode || link.requestedRoleCode || undefined,
    });
    await updateLinkWithRevision(tx, link, {
      status: "ACTIVE",
      reviewedByUserId: actorUserId,
      organizationDecisionAt: new Date(),
      activatedAt: new Date(),
    });
    await recordEvent(tx, {
      organizationId,
      identityLinkId: link.id,
      eventType: "ORGANIZATION_REQUEST_APPROVED",
      fromStatus: link.status,
      toStatus: "ACTIVE",
      actorUserId,
    });
  });
  await notifyUser({
    userId: link.userId,
    organizationId,
    type: "ENTERPRISE_IDENTITY",
    title: "Votre relation entreprise a été approuvée",
    body: "L’entreprise a confirmé votre demande. Les services associés sont maintenant accessibles selon vos droits.",
    targetUrl: `/enterprise-links?link=${link.id}`,
    idempotencyKey: `enterprise-identity-approved:${link.id}`,
  });
  return prisma.enterpriseIdentityLink.findUnique({ where: { id: link.id } });
}

export async function refuseUserInitiatedIdentityRequest({
  organizationId,
  linkId,
  actorUserId,
  revision,
  reason,
}: {
  organizationId: string;
  linkId: string;
  actorUserId: string;
  revision: number;
  reason?: string;
}) {
  const link = await prisma.enterpriseIdentityLink.findFirst({ where: { id: linkId, organizationId } });
  if (!link || !link.userId) {
    throw new EnterpriseIdentityLinkError("IDENTITY_REQUEST_NOT_FOUND", "La demande est introuvable.", 404);
  }
  if (link.revision !== revision) {
    throw new EnterpriseIdentityLinkError("IDENTITY_LINK_CONCURRENT_UPDATE", "La demande a changé. Actualisez la page.", 409);
  }
  assertTransition(link.status, "REFUSED");
  await prisma.$transaction(async (tx) => {
    await updateLinkWithRevision(tx, link, {
      status: "REFUSED",
      reviewedByUserId: actorUserId,
      organizationDecisionAt: new Date(),
      refusedAt: new Date(),
      refusalReason: reason || null,
    });
    await recordEvent(tx, {
      organizationId,
      identityLinkId: link.id,
      eventType: "ORGANIZATION_REQUEST_REFUSED",
      fromStatus: link.status,
      toStatus: "REFUSED",
      actorUserId,
      reason,
    });
  });
  await notifyUser({
    userId: link.userId,
    organizationId,
    type: "ENTERPRISE_IDENTITY",
    title: "Demande de relation examinée",
    body: "L’entreprise n’a pas confirmé cette relation. Votre compte DTSC reste inchangé.",
    targetUrl: `/enterprise-links?link=${link.id}`,
    idempotencyKey: `enterprise-identity-refused:${link.id}`,
  });
  return { ok: true };
}

export async function revokeEnterpriseIdentityLink({
  linkId,
  userId,
  revision,
  reason,
  locale,
}: {
  linkId: string;
  userId: string;
  revision: number;
  reason?: string;
  locale?: string | null;
}) {
  const link = await prisma.enterpriseIdentityLink.findFirst({ where: { id: linkId, userId } });
  if (!link) {
    throw new EnterpriseIdentityLinkError("IDENTITY_LINK_NOT_FOUND", "La relation est introuvable.", 404);
  }
  if (link.revision !== revision) {
    throw new EnterpriseIdentityLinkError("IDENTITY_LINK_CONCURRENT_UPDATE", "La relation a changé. Actualisez la page.", 409);
  }
  assertTransition(link.status, "REVOKED");
  const statement = buildEnterpriseIdentityRevocationStatement(locale);
  await prisma.$transaction(async (tx) => {
    await updateLinkWithRevision(tx, link, {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: reason || null,
    });
    await tx.enterpriseIdentityConsentRecord.create({
      data: {
        organizationId: link.organizationId,
        identityLinkId: link.id,
        userId,
        action: "REVOKE",
        purpose: link.purpose,
        consentTextVersion: link.consentTextVersion,
        statementDigest: assertionDigest(statement, link.consentTextVersion),
        metadataJson: { reasonProvided: Boolean(reason) },
      },
    });
    await recordEvent(tx, {
      organizationId: link.organizationId,
      identityLinkId: link.id,
      eventType: "USER_CONSENT_REVOKED",
      fromStatus: link.status,
      toStatus: "REVOKED",
      actorUserId: userId,
      reason,
    });
  });
  await notifyUser({
    userId: link.initiatedByUserId,
    organizationId: link.organizationId,
    type: "ENTERPRISE_IDENTITY",
    title: "Autorisation de relation retirée",
    body: "L’utilisateur a déconnecté son compte DTSC de la fiche métier. Les données métier conservées par l’entreprise ne sont pas supprimées automatiquement.",
    targetUrl: `/enterprise-identity-admin?link=${link.id}`,
    idempotencyKey: `enterprise-identity-revoked:${link.id}:${revision}`,
  });
  return { ok: true };
}

export async function cancelEnterpriseIdentityLink({
  organizationId,
  linkId,
  actorUserId,
  revision,
  reason,
}: {
  organizationId: string;
  linkId: string;
  actorUserId: string;
  revision: number;
  reason?: string;
}) {
  const link = await prisma.enterpriseIdentityLink.findFirst({ where: { id: linkId, organizationId } });
  if (!link) {
    throw new EnterpriseIdentityLinkError("IDENTITY_LINK_NOT_FOUND", "La relation est introuvable.", 404);
  }
  if (link.revision !== revision) {
    throw new EnterpriseIdentityLinkError("IDENTITY_LINK_CONCURRENT_UPDATE", "La relation a changé. Actualisez la page.", 409);
  }
  assertTransition(link.status, "CANCELLED");
  await prisma.$transaction(async (tx) => {
    await updateLinkWithRevision(tx, link, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason || null,
      invitationTokenDigest: null,
      reviewedByUserId: actorUserId,
    });
    await recordEvent(tx, {
      organizationId,
      identityLinkId: link.id,
      eventType: "IDENTITY_LINK_CANCELLED",
      fromStatus: link.status,
      toStatus: "CANCELLED",
      actorUserId,
      reason,
    });
  });
  return { ok: true };
}

export async function listOrganizationIdentityLinks(organizationId: string) {
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const personIds = [...new Set(links.map((link) => link.personIdentityId))];
  const [people, references] = await Promise.all([
    prisma.enterprisePersonIdentity.findMany({
      where: { organizationId, id: { in: personIds } },
      select: { id: true, displayName: true, status: true },
    }),
    prisma.enterprisePersonBusinessReference.findMany({
      where: { organizationId, personIdentityId: { in: personIds }, archivedAt: null },
      select: {
        id: true,
        personIdentityId: true,
        relationType: true,
        roleCode: true,
        businessPartyId: true,
        businessPartyContactId: true,
        employeeId: true,
        supplierId: true,
        supplierContactId: true,
      },
    }),
  ]);
  const personById = new Map(people.map((person) => [person.id, person]));
  return links.map((link) => ({
    ...link,
    person: personById.get(link.personIdentityId) || null,
    references: references.filter((reference) => reference.personIdentityId === link.personIdentityId),
  }));
}

export async function listUserIdentityLinks(userId: string) {
  const links = await prisma.enterpriseIdentityLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const organizationIds = [...new Set(links.map((link) => link.organizationId))];
  const personIds = [...new Set(links.map((link) => link.personIdentityId))];
  const [organizations, people] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: organizationIds }, deletedAt: null },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.enterprisePersonIdentity.findMany({
      where: { id: { in: personIds } },
      select: { id: true, displayName: true },
    }),
  ]);
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const personById = new Map(people.map((person) => [person.id, person]));
  return links.map((link) => ({
    ...link,
    organization: organizationById.get(link.organizationId) || null,
    person: personById.get(link.personIdentityId) || null,
  }));
}
