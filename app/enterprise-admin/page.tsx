import { redirect } from "next/navigation";
import { EnterpriseAdministrationModule } from "@/components/enterprise/enterprise-administration-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { getEnterpriseAdministrationDataset } from "@/lib/enterprise/enterprise-admin-loader";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";

export default async function EnterpriseAdminPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId || !(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    redirect("/dashboard");
  }

  const dataset = await getEnterpriseAdministrationDataset(organizationId);
  if (!dataset) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <EnterpriseAdministrationModule
        organization={dataset.organization}
        dashboard={dataset.dashboard}
        locale={user.locale}
        members={dataset.members}
        modules={dataset.modules}
        departments={dataset.departments}
        positions={dataset.positions}
        activityBlocks={dataset.activityBlocks}
        workflows={dataset.workflows}
        recentRequests={dataset.recentRequests}
        calendarEvents={dataset.calendarEvents}
        sectorRecords={dataset.sectorRecords}
      />
    </AppShell>
  );
}
