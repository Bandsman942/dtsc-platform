import { notFound, redirect } from "next/navigation";
import { MobileMoneyAgencyWorkspace } from "@/components/enterprise/professional/mobile-money-agency-workspace";
import { RetailActiveCustomerBar } from "@/components/enterprise/professional/retail-active-customer-bar";
import { RetailDailyCloseWorkspace } from "@/components/enterprise/professional/retail-daily-close-workspace";
import { RetailOperatorWorkspace } from "@/components/enterprise/professional/retail-operator-workspace";
import { RetailPosSupplementaryTools } from "@/components/enterprise/professional/retail-pos-supplementary-tools";
import { RetailPosWorkspace } from "@/components/enterprise/professional/retail-pos-workspace";
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
      <div className="space-y-4">
        {moduleCode === "RETAIL_POS" ? <RetailActiveCustomerBar organizationId={organizationId} /> : null}

        {moduleCode === "RETAIL_DAILY_CLOSE" ? (
          <RetailDailyCloseWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : moduleCode === "RETAIL_POS" ? (
          <RetailPosWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : moduleCode === "MOBILE_MONEY_AGENCY" ? (
          <MobileMoneyAgencyWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : (
          <RetailOperatorWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
            moduleCode={moduleCode}
          />
        )}

        {moduleCode === "RETAIL_POS" ? <RetailPosSupplementaryTools organizationId={organizationId} /> : null}
      </div>
    </AppShell>
  );
}
