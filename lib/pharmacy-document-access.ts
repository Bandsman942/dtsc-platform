import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export type PharmacyDocumentAction = "view" | "view_sensitive" | "create" | "update" | "download" | "download_sensitive" | "validate" | "reject" | "archive" | "renew" | "link" | "manage_confidentiality" | "view_access_logs" | "manage_compliance";

export async function canAccessPharmacyDocuments(userId: string, organizationId: string, action: PharmacyDocumentAction) {
  const managed = ["validate", "reject", "archive", "manage_confidentiality", "view_access_logs", "manage_compliance"].includes(action);
  const enterpriseAction = action === "view" || action === "download" ? "read" : managed ? "manage" : "write";
  if (!(await canAccessEnterpriseModule(userId, organizationId, "PHARMACY_DOCUMENTS", enterpriseAction))) return false;
  const member = await prisma.organizationMember.findFirst({ where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } }, select: { role: true } });
  if (!member) return false;
  if (["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"].includes(member.role)) return true;
  return ["view", "create", "update", "download", "link", "renew"].includes(action);
}

export async function canAccessPharmacyDocumentRecord(userId: string, organizationId: string, confidentialityLevel: string, action: "view" | "download") {
  const sensitive = ["VERY_CONFIDENTIAL", "MANAGERS_ONLY", "ADMIN_ENTERPRISE", "QUALITY_ONLY", "FINANCIAL", "RESPONSIBLE_PHARMACIST"].includes(confidentialityLevel);
  return canAccessPharmacyDocuments(userId, organizationId, sensitive ? action === "view" ? "view_sensitive" : "download_sensitive" : action);
}
