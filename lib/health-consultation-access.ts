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
      },
    select: { id: true, enterprisePosition: { select: { positionCode: true } } },
  });
  const canViewSensitive = permissions.includes("health.consultations.view_sensitive");
  const qualifiedProfessional = Boolean(staff && canViewSensitive);
  const maySign = qualifiedProfessional && ["DOCTOR","SPECIALIST_DOCTOR","MEDICAL_DIRECTOR"].includes(staff?.enterprisePosition.positionCode || "");
  return {
    membership,
    canCreate: Boolean(maySign && permissions.includes("health.consultations.create")),
    canUpdate: Boolean(qualifiedProfessional && permissions.includes("health.consultations.update")),
    canClose: Boolean(maySign && permissions.includes("health.consultations.close")),
    canReopen: Boolean(maySign && permissions.includes("health.consultations.reopen")),
    canCancel: Boolean(maySign && permissions.includes("health.consultations.cancel")),
    canViewSensitive,
  };
}
