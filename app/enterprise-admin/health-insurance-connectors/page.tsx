import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { HealthInsuranceConnectorWorkspace } from "@/components/enterprise/health-insurance-connector-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function HealthInsuranceConnectorAdminPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const membership = await requireEnterpriseMembership(session, organizationId);
  const access = membership ? await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" }) : null;
  if (!membership || !access?.allowed || !["HEALTH_CARE", "PHARMACY"].includes(membership.organization.sectorCode || "")) redirect("/enterprise-admin");
  return (
    <AppShell user={user}>
      <LocaleProvider locale={user.locale === "en" ? "en" : "fr"}>
        <HealthInsuranceConnectorWorkspace organizationId={organizationId} />
      </LocaleProvider>
    </AppShell>
  );
}
