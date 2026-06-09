import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyProductAction = "view" | "create" | "update" | "archive" | "manage_pricing" | "manage_dispensing_rules";

const permissionByAction: Record<PharmacyProductAction, string> = {
  view: "pharmacy.products.view",
  create: "pharmacy.products.create",
  update: "pharmacy.products.update",
  archive: "pharmacy.products.archive",
  manage_pricing: "pharmacy.products.manage_pricing",
  manage_dispensing_rules: "pharmacy.products.manage_dispensing_rules",
};

export async function canAccessPharmacyProducts(userId: string, organizationId: string, action: PharmacyProductAction) {
  const moduleAction = action === "view" ? "read" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "MEDICINES_PRODUCTS", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (membership.role === "OWNER" || membership.role === "ADMIN_ENTREPRISE" || membership.role === "ADMIN_ENTERPRISE") return true;
  if (membership.role === "MANAGER") return true;
  return action === "view";
}

export function pharmacyProductPermission(action: PharmacyProductAction) {
  return permissionByAction[action];
}
