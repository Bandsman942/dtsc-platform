import { notFound, redirect } from "next/navigation";
import { GamingCommercialReadiness } from "@/components/enterprise/gaming/gaming-commercial-readiness";
import { EnterpriseGamingDashboardWorkspace } from "@/components/enterprise/gaming/enterprise-gaming-dashboard-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

export default async function GamingDashboardPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId: user.id, organizationId, moduleCode: "GAMING_DASHBOARD" });
  if (!capabilities.canRead || !capabilities.definition) notFound();
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" }, select: { name: true } });
  if (!organization) notFound();
  return <AppShell user={user}><div className="space-y-4"><GamingCommercialReadiness organizationId={organizationId} /><EnterpriseGamingDashboardWorkspace organizationId={organizationId} organizationName={organization.name} definition={capabilities.definition} /></div></AppShell>;
}
