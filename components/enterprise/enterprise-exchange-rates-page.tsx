import { notFound, redirect } from "next/navigation";
import { EnterpriseExchangeRatesWorkspace } from "@/components/enterprise/professional/enterprise-exchange-rates-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);

export async function EnterpriseExchangeRatesPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });
  const [access, membership, organization] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "FINANCE_TREASURY", action: "read" }),
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { name: true },
    }),
  ]);
  if (!access.allowed || !membership || !organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseExchangeRatesWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        canManage={MANAGER_ROLES.has(membership.role)}
      />
    </AppShell>
  );
}
