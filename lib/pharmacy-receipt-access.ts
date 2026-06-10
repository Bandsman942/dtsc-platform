import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyReceiptAction = "view" | "create" | "update" | "submit" | "validate" | "reject" | "cancel" | "view_cost" | "manage_documents" | "manage_discrepancies";

export async function canAccessPharmacyReceipts(userId: string, organizationId: string, action: PharmacyReceiptAction) {
  const moduleAction = action === "view" ? "read" : ["validate", "reject", "cancel", "manage_documents", "manage_discrepancies"].includes(action) ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "STOCK_RECEIPTS", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role)) return true;
  if (membership.role === "MANAGER") return action !== "cancel";
  return action === "view" || action === "create" || action === "update" || action === "submit";
}
