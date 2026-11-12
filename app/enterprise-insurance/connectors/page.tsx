import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { HealthInsuranceConnectorWorkspace } from "@/components/enterprise/health-insurance-connector-workspace";
import { requireUser, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

export default async function EnterpriseInsuranceConnectorsPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const [org, access] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, organizationType: "CLIENT", sectorCode: { in: ["HEALTH_CARE","PHARMACY"] }, status: "ACTIVE", deletedAt: null }, select: { id: true } }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" }),
  ]);
  if (!org || !access.allowed) redirect("/enterprise-admin");
  return <AppShell user={user}><LocaleProvider locale={user.locale === "en" ? "en" : "fr"}>
    <HealthInsuranceConnectorWorkspace organizationId={organizationId}/>
  </LocaleProvider></AppShell>;
}
