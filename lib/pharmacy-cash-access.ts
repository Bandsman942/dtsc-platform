import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyCashAction = "view" | "open" | "pay" | "close" | "submit" | "validate" | "reject" | "refund" | "resolve";

export async function canAccessPharmacyCash(userId: string, organizationId: string, action: PharmacyCashAction) {
  const enterpriseAction = action === "view" ? "read" : action === "validate" || action === "reject" || action === "resolve" ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "CASH_INVOICES_PAYMENTS", enterpriseAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (membership.role === "OWNER" || membership.role === "ADMIN_ENTREPRISE" || membership.role === "ADMIN_ENTERPRISE" || membership.role === "MANAGER") return true;
  return action === "view" || action === "open" || action === "pay" || action === "close" || action === "submit" || action === "refund";
}
