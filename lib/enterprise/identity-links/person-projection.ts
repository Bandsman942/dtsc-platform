import type { Prisma } from "@prisma/client";

/**
 * Refresh the *current* display snapshot of explicitly linked people.
 * Never infer identity from an email, never rewrite consent records or relation types.
 * Caller must hold the business mutation transaction so account presentation cannot lag.
 */
export async function synchronizeLinkedPersonIdentityTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  businessPartyId: string,
  actorUserId: string,
) {
  const party = await tx.enterpriseBusinessParty.findFirst({
    where: { id: businessPartyId, organizationId, archivedAt: null, partyType: "PERSON" },
    select: { id: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true },
  });
  if (!party) return { updated: 0 };

  const supplierLink = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId, businessPartyId, archivedAt: null },
    select: { supplierId: true },
  });
  const references = await tx.enterprisePersonBusinessReference.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      OR: [
        { businessPartyId },
        ...(supplierLink ? [{ supplierId: supplierLink.supplierId }] : []),
      ],
    },
    select: { personIdentityId: true },
  });
  if (!references.length) return { updated: 0 };
  const personIds = [...new Set(references.map((item) => item.personIdentityId))];
  const activeLinks = await tx.enterpriseIdentityLink.findMany({
    where: {
      organizationId,
      personIdentityId: { in: personIds },
      status: "ACTIVE",
    },
    select: { id: true, personIdentityId: true },
  });
  if (!activeLinks.length) return { updated: 0 };
  const activePersonIds = [...new Set(activeLinks.map((link) => link.personIdentityId))];
  const displayName = party.displayName?.trim() || party.legalName.trim();
  const identities = await tx.enterprisePersonIdentity.findMany({
    where: { organizationId, id: { in: activePersonIds }, status: "ACTIVE", archivedAt: null },
    select: { id: true, displayName: true, primaryEmail: true, primaryPhone: true },
  });
  let updated = 0;
  for (const identity of identities) {
    if (identity.displayName === displayName &&
        identity.primaryEmail === party.primaryEmail &&
        identity.primaryPhone === party.primaryPhone) continue;
    const fields = [
      ...(identity.displayName !== displayName ? ["displayName"] : []),
      ...(identity.primaryEmail !== party.primaryEmail ? ["primaryEmail"] : []),
      ...(identity.primaryPhone !== party.primaryPhone ? ["primaryPhone"] : []),
    ];
    const result = await tx.enterprisePersonIdentity.updateMany({
      where: { id: identity.id, organizationId, status: "ACTIVE", archivedAt: null },
      data: {
        displayName,
        primaryEmail: party.primaryEmail,
        primaryPhone: party.primaryPhone,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new Error("PERSON_IDENTITY_PROJECTION_CONFLICT");
    updated++;
    // Journal the live representation update, never alter the signed consent statement.
    for (const link of activeLinks.filter((row) => row.personIdentityId === identity.id)) {
      await tx.enterpriseIdentityLinkEvent.create({
        data: {
          organizationId,
          identityLinkId: link.id,
          eventType: "PERSON_IDENTITY_DISPLAY_SYNCHRONIZED",
          actorUserId,
          metadataJson: { changedFields: fields, businessPartyId },
        },
      });
    }
  }
  return { updated };
}
