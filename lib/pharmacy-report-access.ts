import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyReportAction = "view" | "view_financial" | "view_sensitive" | "export" | "export_sensitive" | "manage_views" | "create_snapshot";

export async function canAccessPharmacyReports(userId: string, organizationId: string, action: PharmacyReportAction) {
  const write = action === "manage_views" || action === "create_snapshot" || action === "export" || action === "export_sensitive";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "PHARMACY_REPORTS", write ? "write" : "read"))) return false;
  const member = await prisma.organizationMember.findFirst({ where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } }, select: { role: true } });
  if (!member) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"].includes(member.role)) return true;
  return action === "view" || action === "manage_views" || action === "export";
}
