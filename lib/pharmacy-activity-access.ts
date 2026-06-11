import { prisma } from "@/lib/prisma";

export const pharmacyActivityPermissions = [
  "pharmacy.activities.view", "pharmacy.activities.dashboard", "pharmacy.activities.view_own", "pharmacy.activities.view_department",
  "pharmacy.activities.view_all", "pharmacy.activities.create_replenishment_request", "pharmacy.activities.signal_stockout",
  "pharmacy.activities.signal_near_expiry", "pharmacy.activities.submit_inventory", "pharmacy.activities.request_stock_adjustment",
  "pharmacy.activities.submit_cash_report", "pharmacy.activities.signal_sale_anomaly", "pharmacy.activities.create_quality_incident",
  "pharmacy.activities.request_pharmacist_advice", "pharmacy.activities.comment", "pharmacy.activities.attach_document",
  "pharmacy.activities.complete_own", "pharmacy.activities.cancel_own", "pharmacy.activities.validate", "pharmacy.activities.reject",
  "pharmacy.activities.assign", "pharmacy.activities.view_sensitive", "pharmacy.activities.view_financial", "pharmacy.activities.manage_workflows",
] as const;

const managers = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);

export async function getPharmacyActivityAccess(userId: string, organizationId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null, organization: { sectorCode: "PHARMACY", status: "ACTIVE", deletedAt: null } },
    select: { role: true },
  });
  if (!member) return null;
  const manage = managers.has(member.role);
  return {
    role: member.role,
    canViewAll: manage,
    canValidate: manage,
    canAssign: manage,
    canViewSensitive: manage,
    canViewFinancial: manage,
    permissions: pharmacyActivityPermissions.filter((permission) => manage || !["pharmacy.activities.view_all", "pharmacy.activities.validate", "pharmacy.activities.reject", "pharmacy.activities.assign", "pharmacy.activities.view_sensitive", "pharmacy.activities.view_financial", "pharmacy.activities.manage_workflows"].includes(permission)),
  };
}
