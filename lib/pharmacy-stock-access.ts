import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyStockAction = "view" | "create" | "count" | "submit" | "validate" | "adjust" | "manage_locations";

export async function canAccessPharmacyStock(userId: string, organizationId: string, action: PharmacyStockAction) {
  const moduleAction = action === "view" || action === "count" ? "read" : action === "validate" || action === "manage_locations" ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "STOCK_INVENTORY", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role)) return true;
  if (membership.role === "MANAGER") return action !== "manage_locations";
  return action === "view" || action === "count";
}
