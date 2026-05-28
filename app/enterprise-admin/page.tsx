import { redirect } from "next/navigation";
import { EnterpriseAdministrationModule } from "@/components/enterprise/enterprise-administration-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export default async function EnterpriseAdminPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId || !(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    redirect("/dashboard");
  }

  const [organization, members, openRequestsCount, modules, departments, positions, activityBlocks, workflows, recentRequests, sectorRecords] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        name: true,
        sector: true,
        sectorCode: true,
        businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
      },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 200,
    }),
    prisma.enterpriseActivityRequest.count({ where: { organizationId, status: { in: ["SUBMITTED", "IN_PROGRESS", "PENDING"] } } }),
    prisma.enterpriseModule.findMany({ where: { organizationId }, orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterprisePosition.findMany({
      where: { organizationId },
      orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }],
      include: { department: { select: { labelFr: true, labelEn: true } } },
    }),
    prisma.enterpriseActivityBlock.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseWorkflow.findMany({ where: { organizationId }, orderBy: { labelFr: "asc" } }),
    prisma.enterpriseActivityRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    prisma.enterpriseSectorRecord.findMany({
      where: { organizationId, sectorCode: "HEALTH_CARE", deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 120,
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  if (!organization) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <EnterpriseAdministrationModule
        organization={organization}
        dashboard={{
          membersCount: members.length,
          activeModulesCount: modules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
          modulesCount: modules.length,
          openRequestsCount,
        recentRequestsCount: recentRequests.length,
        }}
        locale={user.locale}
        members={JSON.parse(JSON.stringify(members))}
        modules={JSON.parse(JSON.stringify(modules))}
        departments={JSON.parse(JSON.stringify(departments))}
        positions={JSON.parse(JSON.stringify(positions))}
        activityBlocks={JSON.parse(JSON.stringify(activityBlocks))}
        workflows={JSON.parse(JSON.stringify(workflows))}
        recentRequests={JSON.parse(JSON.stringify(recentRequests))}
        sectorRecords={JSON.parse(JSON.stringify(sectorRecords))}
      />
    </AppShell>
  );
}
