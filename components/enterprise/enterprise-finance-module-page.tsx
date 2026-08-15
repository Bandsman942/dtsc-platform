import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { EnterpriseAccountingOnboardingPanel } from "@/components/enterprise/professional/enterprise-accounting-onboarding-panel";
import { EnterpriseAdvancedFinanceWorkspace } from "@/components/enterprise/professional/enterprise-advanced-finance-workspace";
import { EnterpriseOperationalFinanceWorkspace } from "@/components/enterprise/professional/enterprise-operational-finance-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { getSession, requireUser } from "@/lib/auth";
import {
  OPERATIONAL_FINANCE_MODULE_CODES,
  type EnterpriseFinanceModuleCode,
} from "@/lib/enterprise/accounting/constants";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getAccountingOnboardingGuide } from "@/lib/user-guides/accounting-onboarding-guide";

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
      select: { name: true, logoUrl: true },
    }),
  ]);
  if (!access.allowed || !membership || !organization) notFound();

  const definition = access.definition || getEnterpriseModuleDefinition(moduleCode);
  if (!definition || definition.code !== moduleCode || definition.routeKind !== "DEDICATED_CORE") notFound();
  const canManage = MANAGER_ROLES.has(membership.role);
  const locale = user.locale === "en" ? "en" : "fr";

  return (
    <AppShell user={user}>
      {moduleCode === "FINANCE_TREASURY" ? (
        <div className="mx-auto mb-4 w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <Link href="/enterprise-modules/FINANCE_TREASURY/exchange-rates" className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-dtsc-ink transition hover:border-cyan-400/60">
            <span className="min-w-0">
              <span className="block text-sm font-black">{locale === "fr" ? "Taux de change et consolidation multi-devise" : "Exchange rates and multi-currency consolidation"}</span>
              <span className="mt-1 block text-xs font-semibold text-dtsc-muted">{locale === "fr" ? "Configurer les taux datés utilisés par Finance et les rapports Shop." : "Configure dated rates used by Finance and Shop reports."}</span>
            </span>
            <ArrowRightLeft className="h-5 w-5 shrink-0 text-cyan-600" />
          </Link>
        </div>
      ) : null}
      {moduleCode === "FINANCE_ACCOUNTING" ? (
        <>
          <div className="mx-auto mb-4 flex w-full max-w-[1600px] justify-end px-4 sm:px-6 lg:px-8">
            <ContextualUserGuide guide={getAccountingOnboardingGuide(user.locale)} compact />
          </div>
          <EnterpriseAccountingOnboardingPanel organizationId={organizationId} locale={user.locale} canManage={canManage} />
        </>
      ) : null}
      {OPERATIONAL_FINANCE_MODULE_CODES.includes(
        moduleCode as (typeof OPERATIONAL_FINANCE_MODULE_CODES)[number],
      ) ? (
        <EnterpriseOperationalFinanceWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={definition}
          locale={user.locale}
          canManage={canManage}
        />
      ) : (
        <EnterpriseAdvancedFinanceWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          organizationLogoUrl={organization.logoUrl}
          definition={definition}
          locale={user.locale}
          canManage={canManage}
        />
      )}
    </AppShell>
  );
}
