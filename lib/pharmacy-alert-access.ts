import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyAlertAction = "view" | "detect" | "update" | "manage";

export async function canAccessPharmacyAlerts(userId: string, organizationId: string, action: PharmacyAlertAction) {
  const enterpriseAction = action === "view" ? "read" : action === "manage" ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "ALERTS_EXPIRY_LOW_STOCK", enterpriseAction))) return false;
  const member = await prisma.organizationMember.findFirst({ where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } }, select: { role: true } });
  if (!member) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"].includes(member.role)) return true;
  return action === "view" || action === "update";
}
