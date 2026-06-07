import { notFound, redirect } from "next/navigation";
import { EnterpriseModuleWorkspace } from "@/components/enterprise/enterprise-module-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };

export default async function EnterpriseModulePage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const { moduleCode } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || !(await canAccessEnterpriseModule(user.id, organizationId, moduleCode, "read"))) notFound();

  const [organization, enterpriseModule, activityBlocks, records] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.enterpriseModule.findUnique({ where: { organizationId_moduleCode: { organizationId, moduleCode } } }),
    prisma.enterpriseActivityBlock.findMany({ where: { organizationId, isEnabled: true, targetModuleCode: moduleCode }, orderBy: { sortOrder: "asc" }, select: { id: true, labelFr: true, labelEn: true, blockCode: true } }),
    prisma.enterpriseSectorRecord.findMany({ where: { organizationId, moduleCode, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, summary: true, status: true, updatedAt: true } }),
  ]);
  if (!organization || !enterpriseModule) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseModuleWorkspace
        organizationName={organization.name}
        enterpriseModule={{ code: enterpriseModule.moduleCode, label: user.locale === "en" ? enterpriseModule.labelEn : enterpriseModule.labelFr, description: user.locale === "en" ? enterpriseModule.descriptionEn || enterpriseModule.moduleCode : enterpriseModule.descriptionFr || enterpriseModule.moduleCode, category: enterpriseModule.moduleCategory, isCore: enterpriseModule.isCore }}
        activityBlocks={activityBlocks}
        records={records}
        canManage={ENTERPRISE_MANAGER_ROLES.has(membership.role)}
        locale={user.locale}
      />
    </AppShell>
  );
}
