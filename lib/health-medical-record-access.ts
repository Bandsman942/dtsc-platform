import { canAccessEnterpriseModule, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";

export async function getHealthMedicalRecordAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "MEDICAL_RECORDS", action))) return null;
  const medicalPermissions = await getHealthStaffMedicalPermissions(session.userId, organizationId);
  const canViewSensitive = medicalPermissions.includes("health.medical_records.view_sensitive");
  // Clinical mutation is not an enterprise administrator capability. The
  // assignment is already filtered by ACTIVE in getHealthStaffMedicalPermissions.
  const canEditClinical = canViewSensitive;
  const canManageConfidentialNotes = medicalPermissions.includes("health.medical_records.confidential_notes");
  return {
    membership,
    canCreate: canEditClinical,
    canUpdate: canEditClinical,
    canArchive: canEditClinical,
    canManageStructuredItems: canEditClinical,
    canViewSensitive,
    canManageConfidentialNotes,
  };
}
