import { redirect } from "next/navigation";
import { EnterpriseAdministrationModule } from "@/components/enterprise/enterprise-administration-module";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getEnterpriseAdministrationDataset } from "@/lib/enterprise/enterprise-admin-loader";
import { canManageEnterpriseAdministration, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function EnterpriseAdminPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) {
    redirect("/dashboard");
  }
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || !(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    redirect("/dashboard");
  }
  const featureAccess = await canUseFeature(organizationId, "enterprise-admin");
  if (!featureAccess.allowed) {
    const entitlements = await getOrganizationEntitlements(organizationId);
    return (
      <AppShell user={user}>
        <SaasAccessNotice
          title="Administration entreprise indisponible"
          message={featureAccess.message}
          planLabel={entitlements?.planLabel}
          subscriptionStatus={entitlements?.subscriptionStatus}
        />
      </AppShell>
    );
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
        entitlements={dataset.entitlements}
      />
    </AppShell>
  );
}
