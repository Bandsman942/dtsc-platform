import { notFound, redirect } from "next/navigation";
import { EnterpriseFinanceWorkspace } from "@/components/enterprise/enterprise-finance-workspace";
import {
  EnterpriseOperationalFinanceWorkspace,
  OPERATIONAL_FINANCE_MODULE_CODES,
} from "@/components/enterprise/professional/enterprise-operational-finance-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);

export async function EnterpriseFinanceModulePage({ moduleCode }: { moduleCode: EnterpriseFinanceModuleCode }) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });
  const [access, membership, organization] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "read" }),
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { name: true },
    }),
  ]);
  if (!access.allowed || !membership || !organization) notFound();

  const definition = access.definition || getEnterpriseModuleDefinition(moduleCode);
  if (!definition || definition.code !== moduleCode || definition.routeKind !== "DEDICATED_CORE") notFound();
  const canManage = MANAGER_ROLES.has(membership.role);

  return (
    <AppShell user={user}>
      {OPERATIONAL_FINANCE_MODULE_CODES.has(moduleCode) ? (
        <EnterpriseOperationalFinanceWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={definition}
          locale={user.locale}
          canManage={canManage}
        />
      ) : (
        <EnterpriseFinanceWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={definition}
          locale={user.locale}
          canManage={canManage}
        />
      )}
    </AppShell>
  );
}
