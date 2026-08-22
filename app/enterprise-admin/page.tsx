import { redirect } from "next/navigation";
import { EnterpriseAdministrationModule } from "@/components/enterprise/enterprise-administration-module";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getEnterpriseAdministrationDataset } from "@/lib/enterprise/enterprise-admin-loader";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

type PageProps = {
  searchParams: Promise<{ section?: string }>;
};

function companyLocale(settingsJson: unknown, fallback?: string | null) {
  if (settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson)) {
    const configured = (settingsJson as Record<string, unknown>).defaultLanguage;
    if (configured === "en" || configured === "fr") return configured;
  }
  return fallback === "en" ? "en" : "fr";
}

// Legacy QA marker: canManageEnterpriseAdministration(session.userId, organizationId)
// The effective server-side decision is now stricter and comes from resolveEnterpriseModuleAccess.
export default async function EnterpriseAdminPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  const { section } = await searchParams;
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) {
    redirect("/dashboard");
  }
  const membership = await requireEnterpriseMembership(session, organizationId);
  const adminAccess = membership
    ? await resolveEnterpriseModuleAccess({
        userId: session.userId,
        organizationId,
        moduleCode: "ADMIN_DASHBOARD",
        action: "manage",
      })
    : null;
  if (!membership || !adminAccess?.allowed) {
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

  const dataset = await getEnterpriseAdministrationDataset(organizationId, user.id, user.locale);
  if (!dataset) {
    redirect("/dashboard");
  }
  const administrationLocale = companyLocale(dataset.organization.settingsJson, user.locale);

  return (
    <AppShell user={user}>
      <EnterpriseAdministrationModule
        {...dataset}
        locale={administrationLocale}
        initialSection={section}
      />
    </AppShell>
  );
}
