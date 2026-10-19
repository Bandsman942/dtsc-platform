import { redirect } from "next/navigation";
import { EnterpriseActivitiesModule } from "@/components/enterprise/enterprise-activities-module";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getEnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-loader";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { translate } from "@/lib/i18n";

export default async function EnterpriseActivitiesPage({ searchParams }: { searchParams: Promise<{ activity?: string }> }) {
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
  const featureAccess = await canUseFeature(organizationId, "enterprise-activities");
  if (!featureAccess.allowed) {
    const entitlements = await getOrganizationEntitlements(organizationId);
    return (
      <AppShell user={user}>
        <SaasAccessNotice
          title={translate(user.locale, "enterpriseActivities.unavailableTitle")}
          message={featureAccess.message}
          planLabel={entitlements?.planLabel}
          subscriptionStatus={entitlements?.subscriptionStatus}
        />
      </AppShell>
    );
  }

  const { activity } = await searchParams;
  const dataset = await getEnterpriseActivitiesDataset({ organizationId, userId: user.id, membershipRole: membership.role });
  if (!dataset) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <EnterpriseActivitiesModule {...dataset} initialActivityId={activity && dataset.requests.some((item) => item.id === activity) ? activity : null} />
    </AppShell>
  );
}
