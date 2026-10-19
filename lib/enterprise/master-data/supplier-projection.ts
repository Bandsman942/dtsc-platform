import { normalizeEnterpriseSupplierName } from "@/lib/enterprise/procurement/supplier-normalization";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// This projection must be committed together with the canonical identity mutation.
export async function refreshLinkedSupplierSnapshotFromPartyTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  businessPartyId: string,
  actorUserId: string,
) {
  const link = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId, businessPartyId, archivedAt: null },
    select: { supplierId: true },
  });
  if (!link) return { updated: false };
  const party = await tx.enterpriseBusinessParty.findFirst({
    where: { id: businessPartyId, organizationId, archivedAt: null },
    include: { addresses: { where: { archivedAt: null, status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
  });
  if (!party) throw new Error("SUPPLIER_CANONICAL_PARTY_NOT_FOUND");
  const address = party.addresses[0];
  const updated = await tx.enterpriseSupplier.updateMany({
    where: { id: link.supplierId, organizationId, archivedAt: null },
    data: {
      legalName: party.legalName,
      displayName: party.displayName,
      normalizedName: normalizeEnterpriseSupplierName(party.legalName),
      email: party.primaryEmail,
      phone: party.primaryPhone,
      addressLine: address?.line1 || null,
      city: address?.city || null,
      country: address?.countryCode || null,
      taxIdentifier: party.taxIdentifier,
      registrationId: party.registrationId,
      notes: party.notes,
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new Error("SUPPLIER_SNAPSHOT_NOT_FOUND");
  return { updated: true, supplierId: link.supplierId };
}

// Compatibility helper for callers without an existing transaction.
export async function refreshLinkedSupplierSnapshotFromParty(
  organizationId: string,
  businessPartyId: string,
  actorUserId: string,
) {
  return prisma.$transaction((tx) =>
    refreshLinkedSupplierSnapshotFromPartyTx(tx, organizationId, businessPartyId, actorUserId),
  );
}
