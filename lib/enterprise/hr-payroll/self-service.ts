import type { SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// The employee record is deliberately NOT inferred from email, phone or display name.
// HR must explicitly link it to the active organization membership.
export async function getActiveEnterpriseSelfEmployee(session: SessionPayload, organizationId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!member) return null;
  return prisma.enterpriseEmployee.findFirst({
    where: { organizationId, organizationMemberId: member.id, archivedAt: null, employmentStatus: "ACTIVE" },
    select: { id: true, employeeNumber: true, displayName: true, organizationId: true },
  });
}
