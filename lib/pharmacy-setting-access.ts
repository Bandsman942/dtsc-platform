import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacySettingAction = "view" | "update" | "update_critical" | "view_history" | "reset";
export async function canAccessPharmacySettings(userId: string, organizationId: string, action: PharmacySettingAction) {
  if (!(await canAccessEnterpriseModule(userId, organizationId, "PHARMACY_SETTINGS", action === "view" || action === "view_history" ? "read" : "manage"))) return false;
  const member = await prisma.organizationMember.findFirst({ where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } }, select: { role: true } });
  if (!member) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(member.role)) return true;
  return member.role === "MANAGER" && action !== "update_critical" && action !== "reset";
}
