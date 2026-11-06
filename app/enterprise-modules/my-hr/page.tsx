import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EnterpriseMyHrSelfService } from "@/components/enterprise/professional/enterprise-my-hr-self-service";
import { ModuleContent, ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getEnterpriseNavigationModules } from "@/lib/enterprise/enterprise-navigation";
import { hasEnterpriseSelfHrModule } from "@/lib/enterprise/hr-payroll/self-service";

export default async function EnterprisePersonalHrPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const [canReadPayroll, canReadTime, navigation] = await Promise.all([
    hasEnterpriseSelfHrModule(session, organizationId, "PAYROLL_OPERATIONS"),
    hasEnterpriseSelfHrModule(session, organizationId, "TIME_ATTENDANCE"),
    getEnterpriseNavigationModules(organizationId, user.id, user.locale),
  ]);
  if (!canReadPayroll && !canReadTime) notFound();

  const locale = user.locale === "en" ? "en" : "fr";
  const relatedModules = navigation
    .filter((module) => ["TIME_ATTENDANCE", "HUMAN_RESOURCES", "PAYROLL_OPERATIONS"].includes(module.code))
    .map((module) => ({ code: module.code as "TIME_ATTENDANCE" | "HUMAN_RESOURCES" | "PAYROLL_OPERATIONS", href: module.href, label: module.label }));

  return <AppShell user={user}>
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={locale === "en" ? "Personal HR" : "Libre-service personnel"}
        title={locale === "en" ? "My HR space" : "Mon espace RH"}
        description={locale === "en" ? "Your private HR information and links to modules you may access." : "Vos informations RH privées et les liens vers les modules auxquels vous avez accès."}
      />
      <ModuleContent>
        <EnterpriseMyHrSelfService organizationId={organizationId} relatedModules={relatedModules} />
      </ModuleContent>
    </ModuleWorkspace>
  </AppShell>;
}
