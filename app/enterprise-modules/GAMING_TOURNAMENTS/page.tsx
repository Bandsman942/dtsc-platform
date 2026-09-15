import { notFound, redirect } from "next/navigation";
import { EnterpriseGamingTournamentsWorkspace } from "@/components/enterprise/gaming/enterprise-gaming-tournaments-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

export default async function GamingTournamentsPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId: user.id, organizationId, moduleCode: "GAMING_TOURNAMENTS" });
  if (!capabilities.canRead || !capabilities.definition) notFound();
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" }, select: { name: true } });
  if (!organization) notFound();
  return <AppShell user={user}><EnterpriseGamingTournamentsWorkspace organizationId={organizationId} organizationName={organization.name} definition={capabilities.definition} /></AppShell>;
}
