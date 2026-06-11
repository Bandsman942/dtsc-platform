import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyQualityAction = "view" | "create" | "update" | "manage" | "batch";

export async function canAccessPharmacyQuality(userId: string, organizationId: string, action: PharmacyQualityAction) {
  const enterpriseAction = action === "view" ? "read" : action === "create" || action === "update" ? "write" : "manage";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "QUALITY_PHARMACOVIGILANCE", enterpriseAction))) return false;
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!member) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"].includes(member.role)) return true;
  return action === "view" || action === "create" || action === "update";
}
