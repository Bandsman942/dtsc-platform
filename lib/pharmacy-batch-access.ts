import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyBatchAction = "view" | "create" | "update" | "archive" | "quarantine" | "release_quarantine" | "recall" | "block" | "view_cost" | "view_documents" | "manage_documents";

export async function canAccessPharmacyBatches(userId: string, organizationId: string, action: PharmacyBatchAction) {
  const moduleAction = action === "view" || action === "view_documents" ? "read" : action === "archive" || action === "recall" || action === "block" || action === "manage_documents" ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "BATCH_EXPIRY", moduleAction))) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!membership) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role)) return true;
  if (membership.role === "MANAGER") return action !== "archive";
  return action === "view" || action === "view_documents";
}
