import { redirect } from "next/navigation";
import { EnterpriseActivitiesModule } from "@/components/enterprise/enterprise-activities-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export default async function EnterpriseActivitiesPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) {
    redirect("/dashboard");
  }
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    redirect("/dashboard");
  }

  const canSeeAll =
    membership.role === "OWNER" ||
    membership.role === "ADMIN_ENTREPRISE" ||
    membership.role === "ADMIN_ENTERPRISE" ||
    membership.role === "MANAGER";
  const requestWhere = canSeeAll
    ? { organizationId }
    : {
        organizationId,
        OR: [{ createdById: user.id }, { assignedToUserId: user.id }],
      };

  const [organization, blocks, requests] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, sector: true, businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } } },
    }),
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterpriseActivityRequest.findMany({
      where: requestWhere,
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { createdBy: { select: { name: true, email: true } }, block: { select: { labelFr: true, labelEn: true, icon: true } } },
    }),
  ]);

  if (!organization) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <EnterpriseActivitiesModule
        organization={organization}
        blocks={JSON.parse(JSON.stringify(blocks))}
        requests={JSON.parse(JSON.stringify(requests))}
      />
    </AppShell>
  );
}
