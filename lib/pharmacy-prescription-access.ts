import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyPrescriptionAction =
  | "view"
  | "create"
  | "update"
  | "submit"
  | "validate"
  | "reject"
  | "match_products"
  | "substitute"
  | "create_sale"
  | "mark_dispensed"
  | "archive"
  | "manage_documents";

export async function canAccessPharmacyPrescriptions(
  userId: string,
  organizationId: string,
  action: PharmacyPrescriptionAction,
) {
  const moduleAction =
    action === "view"
      ? "read"
      : ["validate", "reject", "substitute", "archive", "manage_documents"].includes(action)
        ? "manage"
        : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "PRESCRIPTIONS", moduleAction))) {
    return false;
  }
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null },
    },
    select: { role: true },
  });
  if (!membership) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"].includes(membership.role)) {
    return true;
  }
  return ["view", "create", "update", "submit", "match_products", "create_sale"].includes(action);
}
