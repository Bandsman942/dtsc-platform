import { normalizeEnterpriseSupplierName } from "@/lib/enterprise/procurement/supplier-normalization";
import { prisma } from "@/lib/prisma";

export async function refreshLinkedSupplierSnapshotFromParty(
  organizationId: string,
  businessPartyId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId, businessPartyId, archivedAt: null },
      select: { supplierId: true },
    });
    if (!link) return { updated: false };
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: businessPartyId, organizationId, archivedAt: null },
    });
    if (!party) return { updated: false };
    const updated = await tx.enterpriseSupplier.updateMany({
      where: { id: link.supplierId, organizationId, archivedAt: null },
      data: {
        legalName: party.legalName,
        displayName: party.displayName,
        normalizedName: normalizeEnterpriseSupplierName(party.legalName),
        email: party.primaryEmail,
        phone: party.primaryPhone,
        taxIdentifier: party.taxIdentifier,
        registrationId: party.registrationId,
        notes: party.notes,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    return { updated: updated.count === 1, supplierId: link.supplierId };
  });
}
