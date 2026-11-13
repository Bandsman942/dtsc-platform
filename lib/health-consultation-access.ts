import { canAccessEnterpriseModule, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";

export async function getHealthConsultationAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "CONSULTATIONS", action))) return null;
  // An administrative enterprise role is never sufficient to edit clinical
  // encounters. Only an active accredited medical assignment with explicit
  // clinical access can write or sign a consultation.
  const permissions = await getHealthStaffMedicalPermissions(session.userId, organizationId);
  const staff = await prisma.healthStaffAssignment.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE",
      availabilityStatus: { not: "SUSPENDED" },
      enterprisePosition: { positionCode: { in: ["DOCTOR","SPECIALIST_DOCTOR","MEDICAL_DIRECTOR"] } } },
    select: { id: true },
  });
  const canViewSensitive = permissions.includes("health.consultations.view_sensitive");
  const canEdit = Boolean(staff && canViewSensitive);
  return {
    membership,
    canCreate: canEdit,
    canUpdate: canEdit,
    canClose: canEdit,
    canReopen: canEdit,
    canCancel: canEdit,
    canViewSensitive,
  };
}
