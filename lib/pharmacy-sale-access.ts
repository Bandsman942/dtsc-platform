import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
export type PharmacySaleAction = "view" | "create" | "update" | "confirm" | "pay" | "cancel" | "refund" | "pharmacist_validate" | "manage_anomalies";
export async function canAccessPharmacySales(userId: string, organizationId: string, action: PharmacySaleAction) {
  const moduleAction = action === "view" ? "read" : ["cancel", "refund", "pharmacist_validate", "manage_anomalies"].includes(action) ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "SALES_DISPENSATION", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({ where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } }, select: { role: true } });
  if (!membership) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role)) return true;
  if (membership.role === "MANAGER") return true;
  return ["view", "create", "update", "confirm", "pay"].includes(action);
}
