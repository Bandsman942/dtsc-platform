import { notFound, redirect } from "next/navigation";
import { EnterpriseRetailOperationsWorkspace } from "@/components/enterprise/professional/enterprise-retail-operations-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export async function renderRetailModulePage(moduleCode: "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE") {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const access = await resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "read" });
  if (!access.allowed || !access.definition || access.definition.code !== moduleCode) notFound();

  const [membership, organization] = await Promise.all([
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { name: true },
    }),
  ]);
  if (!membership || !organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseRetailOperationsWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        definition={access.definition}
      />
    </AppShell>
  );
}
