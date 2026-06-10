import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyPurchaseAction = "view" | "create" | "update" | "submit" | "validate" | "reject" | "cancel" | "suspend" | "create_receipt" | "manage";

export async function canAccessPharmacyPurchases(userId: string, organizationId: string, action: PharmacyPurchaseAction) {
  const moduleAction = action === "view" ? "read" : ["validate", "reject", "cancel", "suspend", "manage"].includes(action) ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "SUPPLIERS_ORDERS", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (membership.role === "OWNER" || membership.role === "ADMIN_ENTREPRISE" || membership.role === "ADMIN_ENTERPRISE") return true;
  if (membership.role === "MANAGER") return true;
  return action === "view" || action === "create" || action === "update" || action === "submit" || action === "create_receipt";
}
