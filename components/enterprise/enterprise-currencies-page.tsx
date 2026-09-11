import { notFound, redirect } from "next/navigation";
import { EnterpriseCurrenciesWorkspace } from "@/components/enterprise/professional/enterprise-currencies-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export async function EnterpriseCurrenciesPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });
  const [readAccess, manageAccess, membership, organization] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "FINANCE_OVERVIEW", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "FINANCE_OVERVIEW", action: "manage" }),
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { name: true },
    }),
  ]);
  if (!readAccess.allowed || !membership || !organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseCurrenciesWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        canManage={manageAccess.allowed}
      />
    </AppShell>
  );
}
