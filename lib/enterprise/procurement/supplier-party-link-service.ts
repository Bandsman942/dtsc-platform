import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import { prisma } from "@/lib/prisma";
import { ensureSupplierCanonicalPartyTx } from "@/lib/enterprise/procurement/supplier-party-sync";

type SupplierPartyLinkInput = {
  supplierId: string;
  paymentTerms?: string | null;
  complianceStatus: "NOT_REVIEWED" | "APPROVED" | "CONDITIONAL" | "BLOCKED";
  averageLeadTimeDays?: number | null;
};

export async function convergeEnterpriseSupplierParty(
  organizationId: string,
  actorUserId: string,
  input: SupplierPartyLinkInput,
) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.enterpriseSupplier.findFirst({
      where: { id: input.supplierId, organizationId, archivedAt: null },
    });
    if (!supplier) throw new EnterpriseCoreV2Error("Fournisseur introuvable.", 404, "SUPPLIER_NOT_FOUND");

    const before = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId, supplierId: supplier.id, archivedAt: null },
    });
    const convergence = await ensureSupplierCanonicalPartyTx(tx, organizationId, actorUserId, supplier);
    if (before) return { link: before, idempotent: true };

    const link = await tx.enterpriseSupplierPartyLink.update({
      where: { id: convergence.link.id },
      data: {
        paymentTerms: input.paymentTerms || null,
        complianceStatus: input.complianceStatus,
        averageLeadTimeDays: input.averageLeadTimeDays ?? null,
        revision: { increment: 1 },
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplier",
      entityId: supplier.id,
      eventType: "SUPPLIER_PARTY_LINKED",
      summary: `Fournisseur ${supplier.legalName} lié au tiers ${convergence.party.code}`,
      actorUserId,
      metadataJson: { businessPartyId: convergence.party.id, supplierPartyLinkId: link.id },
    });
    return { link, idempotent: false };
  });
}
