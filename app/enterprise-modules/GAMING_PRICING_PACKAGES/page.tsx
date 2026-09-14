import { notFound, redirect } from "next/navigation";
import { EnterpriseGamingPricingWorkspace } from "@/components/enterprise/gaming/enterprise-gaming-pricing-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

export default async function GamingPricingPackagesPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: user.id,
    organizationId,
    moduleCode: "GAMING_PRICING_PACKAGES",
  });
  if (!capabilities.canRead || !capabilities.definition) notFound();

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { name: true },
  });
  if (!organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseGamingPricingWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        definition={capabilities.definition}
      />
    </AppShell>
  );
}
